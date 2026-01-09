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
  
  // Create file system watcher
  const watcher = fs.watch(localPath, { persistent: false }, async (eventType) => {
    if (eventType !== "change") return;
    
    // Debounce rapid changes (e.g., multiple saves in quick succession)
    const existingTimer = debounceTimers.get(watchId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(async () => {
      debounceTimers.delete(watchId);
      await handleFileChange(watchId, event.sender);
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
    senderId: event.sender.id,
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
