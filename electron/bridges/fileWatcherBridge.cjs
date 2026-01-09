/**
 * File Watcher Bridge - Watches local temp files for changes to sync back to remote
 * 
 * This bridge enables auto-sync functionality for files opened with external applications.
 * When a file is downloaded to temp and opened with an external app, we watch for changes
 * and automatically upload them back to the remote server.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Map of watchId -> { watcher, localPath, remotePath, sftpId, lastModified, lastSize }
const activeWatchers = new Map();

// Debounce map to prevent multiple rapid syncs
const debounceTimers = new Map();

let sftpClients = null;
let electronModule = null;

/**
 * Initialize the file watcher bridge with dependencies
 */
function init(deps) {
  sftpClients = deps.sftpClients;
  electronModule = deps.electronModule;
}

/**
 * Show a system notification for file sync events
 * Works on macOS, Windows, and Linux
 */
function showSystemNotification(title, body) {
  try {
    if (!electronModule?.Notification) {
      console.warn("[FileWatcher] Electron Notification API not available");
      return;
    }
    
    const { Notification } = electronModule;
    
    // Check if notifications are supported
    if (!Notification.isSupported()) {
      console.warn("[FileWatcher] System notifications not supported on this platform");
      return;
    }
    
    const notification = new Notification({
      title,
      body,
      silent: false, // Allow notification sound
    });
    
    notification.show();
  } catch (err) {
    console.warn("[FileWatcher] Failed to show system notification:", err.message);
  }
}

/**
 * Start watching a local file for changes
 * Returns a watchId that can be used to stop watching
 */
async function startWatching(event, { localPath, remotePath, sftpId }) {
  const watchId = `watch-${crypto.randomUUID()}`;
  
  console.log(`[FileWatcher] Starting watch: ${localPath} -> ${remotePath}`);
  
  // Get initial file stats
  let lastModified;
  let lastSize;
  try {
    const stat = await fs.promises.stat(localPath);
    lastModified = stat.mtimeMs;
    lastSize = stat.size;
  } catch (err) {
    console.error(`[FileWatcher] Failed to stat file ${localPath}:`, err.message);
    throw new Error(`Cannot watch file: ${err.message}`);
  }
  
  // Store webContents reference for later notifications
  const webContents = event.sender;
  
  // Create file system watcher with persistent: true to keep it active
  // Note: On macOS and Windows, some editors use atomic writes (rename) instead of in-place writes
  // So we need to handle both 'change' and 'rename' events
  const watcher = fs.watch(localPath, { persistent: true }, async (eventType) => {
    console.log(`[FileWatcher] Event received for ${localPath}: ${eventType}`);
    
    // Handle both 'change' and 'rename' events
    // 'rename' can occur when editors use atomic writes (save to temp, then rename)
    if (eventType !== "change" && eventType !== "rename") return;
    
    // For rename events, check if the file still exists (it might be the old file being deleted)
    if (eventType === "rename") {
      try {
        await fs.promises.access(localPath, fs.constants.F_OK);
      } catch {
        console.log(`[FileWatcher] File ${localPath} no longer exists after rename event, skipping`);
        return;
      }
    }
    
    // Debounce rapid changes (e.g., multiple saves in quick succession)
    const existingTimer = debounceTimers.get(watchId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(async () => {
      debounceTimers.delete(watchId);
      await handleFileChange(watchId, webContents);
    }, 500); // 500ms debounce
    
    debounceTimers.set(watchId, timer);
  });
  
  watcher.on("error", (err) => {
    console.error(`[FileWatcher] Watcher error for ${localPath}:`, err.message);
    stopWatching(null, { watchId });
  });
  
  activeWatchers.set(watchId, {
    watcher,
    localPath,
    remotePath,
    sftpId,
    lastModified,
    lastSize,
    webContents,
  });
  
  console.log(`[FileWatcher] Watch started with ID: ${watchId}`);
  return { watchId };
}

/**
 * Handle file change event - sync to remote
 */
async function handleFileChange(watchId, webContents) {
  const watchInfo = activeWatchers.get(watchId);
  if (!watchInfo) return;
  
  const { localPath, remotePath, sftpId, lastModified: previousModified, lastSize: previousSize } = watchInfo;
  
  // Extract file name once for notifications and logging
  const fileName = path.basename(remotePath);
  
  console.log(`[FileWatcher] File change detected: ${localPath}`);
  
  try {
    // Check if file was actually modified (compare mtime and size)
    const stat = await fs.promises.stat(localPath);
    
    // Skip if neither mtime nor size changed (prevents spurious events on some platforms)
    if (stat.mtimeMs <= previousModified && stat.size === previousSize) {
      console.log(`[FileWatcher] File unchanged (mtime and size same), skipping sync`);
      return;
    }
    
    // Update lastModified and lastSize
    watchInfo.lastModified = stat.mtimeMs;
    watchInfo.lastSize = stat.size;
    
    // Get the SFTP client
    if (!sftpClients) {
      throw new Error("SFTP clients not initialized");
    }
    
    const client = sftpClients.get(sftpId);
    if (!client) {
      throw new Error("SFTP session not found or expired");
    }
    
    // Read the local file
    const content = await fs.promises.readFile(localPath);
    
    console.log(`[FileWatcher] Syncing ${content.length} bytes to ${remotePath}`);
    
    // Upload to remote
    await client.put(content, remotePath);
    
    console.log(`[FileWatcher] Sync complete: ${remotePath}`);
    
    // Show system notification for successful sync
    showSystemNotification(
      "Netcatty",
      `File synced to remote: ${fileName}`
    );
    
    // Notify the renderer about successful sync
    if (webContents && !webContents.isDestroyed()) {
      webContents.send("netcatty:filewatch:synced", {
        watchId,
        localPath,
        remotePath,
        bytesWritten: content.length,
      });
    }
    
  } catch (err) {
    console.error(`[FileWatcher] Sync failed for ${localPath}:`, err.message);
    
    // Show system notification for sync failure
    showSystemNotification(
      "Netcatty",
      `Failed to sync ${fileName}: ${err.message}`
    );
    
    // Notify the renderer about sync failure
    if (webContents && !webContents.isDestroyed()) {
      webContents.send("netcatty:filewatch:error", {
        watchId,
        localPath,
        remotePath,
        error: err.message,
      });
    }
  }
}

/**
 * Stop watching a file
 */
function stopWatching(event, { watchId }) {
  const watchInfo = activeWatchers.get(watchId);
  if (!watchInfo) {
    console.log(`[FileWatcher] Watch ID not found: ${watchId}`);
    return { success: false };
  }
  
  console.log(`[FileWatcher] Stopping watch: ${watchInfo.localPath}`);
  
  // Clear debounce timer if any
  const timer = debounceTimers.get(watchId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(watchId);
  }
  
  // Close the watcher
  try {
    watchInfo.watcher.close();
  } catch (err) {
    console.warn(`[FileWatcher] Error closing watcher:`, err.message);
  }
  
  activeWatchers.delete(watchId);
  
  return { success: true };
}

/**
 * Stop all watchers for a specific SFTP session
 * Called when SFTP connection is closed
 */
function stopWatchersForSession(sftpId) {
  let count = 0;
  for (const [watchId, watchInfo] of activeWatchers.entries()) {
    if (watchInfo.sftpId === sftpId) {
      stopWatching(null, { watchId });
      count++;
    }
  }
  if (count > 0) {
    console.log(`[FileWatcher] Stopped ${count} watcher(s) for SFTP session: ${sftpId}`);
  }
}

/**
 * Get list of active watchers
 */
function listWatchers() {
  const watchers = [];
  for (const [watchId, info] of activeWatchers.entries()) {
    watchers.push({
      watchId,
      localPath: info.localPath,
      remotePath: info.remotePath,
      sftpId: info.sftpId,
    });
  }
  return watchers;
}

/**
 * Register IPC handlers for file watching operations
 */
function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:filewatch:start", startWatching);
  ipcMain.handle("netcatty:filewatch:stop", stopWatching);
  ipcMain.handle("netcatty:filewatch:list", listWatchers);
}

/**
 * Cleanup all watchers on shutdown
 */
function cleanup() {
  console.log(`[FileWatcher] Cleaning up ${activeWatchers.size} watcher(s)`);
  for (const [watchId] of activeWatchers.entries()) {
    stopWatching(null, { watchId });
  }
}

module.exports = {
  init,
  registerHandlers,
  startWatching,
  stopWatching,
  stopWatchersForSession,
  listWatchers,
  cleanup,
};
