/**
 * Netcatty Electron Main Process
 * 
 * This is the main entry point for the Electron application.
 * All major functionality has been extracted into separate bridge modules:
 * 
 * - sshBridge.cjs: SSH connections and session management
 * - sftpBridge.cjs: SFTP file operations
 * - localFsBridge.cjs: Local filesystem operations
 * - transferBridge.cjs: File transfers with progress
 * - portForwardingBridge.cjs: SSH port forwarding tunnels
 * - terminalBridge.cjs: Local shell, telnet, and mosh sessions
 * - windowManager.cjs: Electron window management
 */

// Handle environment setup
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

// Handle uncaught exceptions for EPIPE errors
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
    console.warn('Ignored stream error:', err.code);
    return;
  }
  console.error('Uncaught exception:', err);
  throw err;
});

// Load Electron
let electronModule;
try {
  electronModule = require("node:electron");
} catch {
  electronModule = require("electron");
}

const { app, BrowserWindow, nativeTheme, Menu } = electronModule || {};
if (!app || !BrowserWindow) {
  throw new Error("Failed to load Electron runtime. Ensure the app is launched with the Electron binary.");
}

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");

// Import bridge modules
const sshBridge = require("./bridges/sshBridge.cjs");
const sftpBridge = require("./bridges/sftpBridge.cjs");
const localFsBridge = require("./bridges/localFsBridge.cjs");
const transferBridge = require("./bridges/transferBridge.cjs");
const portForwardingBridge = require("./bridges/portForwardingBridge.cjs");
const terminalBridge = require("./bridges/terminalBridge.cjs");
const windowManager = require("./bridges/windowManager.cjs");

// GPU settings
app.commandLine.appendSwitch("no-sandbox");
// Force hardware acceleration even on blocklisted GPUs (macs sometimes fall back to software)
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("ignore-gpu-blacklist"); // Some Chromium builds use this alias; keep both for safety
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");

// Silence noisy DevTools Autofill CDP errors (Electron's backend doesn't expose this domain)
app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "devtools") return;
  // Drop console output from Autofill requests in DevTools frontend
  contents.on("did-finish-load", () => {
    contents
      .executeJavaScript(`
        (() => {
          const block = (methodName) => {
            const original = console[methodName];
            if (!original) return;
            console[methodName] = (...args) => {
              if (args.some(arg => typeof arg === "string" && arg.includes("Autofill."))) return;
              original(...args);
            };
          };
          block("error");
          block("warn");
        })();
      `)
      .catch(() => {});
  });
  contents.on("console-message", (event, _level, message, _line, sourceId) => {
    if (sourceId?.startsWith("devtools://") && message.includes("Autofill.")) {
      event.preventDefault();
    }
  });
});

// Application configuration
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const isDev = !!devServerUrl;
const preload = path.join(__dirname, "preload.cjs");
const isMac = process.platform === "darwin";
const appIcon = path.join(__dirname, "../public/icon.png");
const electronDir = __dirname;

// Shared state
const sessions = new Map();
const sftpClients = new Map();
const keyRoot = path.join(os.homedir(), ".netcatty", "keys");

// Key management helpers
const ensureKeyDir = () => {
  try {
    fs.mkdirSync(keyRoot, { recursive: true, mode: 0o700 });
  } catch (err) {
    console.warn("Unable to ensure key cache dir", err);
  }
};

const writeKeyToDisk = (keyId, privateKey) => {
  if (!privateKey) return null;
  ensureKeyDir();
  const filename = `${keyId || "temp"}.pem`;
  const target = path.join(keyRoot, filename);
  const normalized = privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`;
  try {
    fs.writeFileSync(target, normalized, { mode: 0o600 });
    return target;
  } catch (err) {
    console.error("Failed to persist private key", err);
    return null;
  }
};

// Track if bridges are registered
let bridgesRegistered = false;

/**
 * Register all IPC bridges with Electron
 */
const registerBridges = (win) => {
  if (bridgesRegistered) return;
  bridgesRegistered = true;

  const { ipcMain } = electronModule;

  // Initialize bridges with shared dependencies
  const deps = {
    sessions,
    sftpClients,
    electronModule,
  };

  sshBridge.init(deps);
  sftpBridge.init(deps);
  transferBridge.init(deps);
  terminalBridge.init(deps);

  // Register all IPC handlers
  sshBridge.registerHandlers(ipcMain);
  sftpBridge.registerHandlers(ipcMain);
  localFsBridge.registerHandlers(ipcMain);
  transferBridge.registerHandlers(ipcMain);
  portForwardingBridge.registerHandlers(ipcMain);
  terminalBridge.registerHandlers(ipcMain);

  console.log('[Main] All bridges registered successfully');
};

/**
 * Create the main application window
 */
async function createWindow() {
  const win = await windowManager.createWindow(electronModule, {
    preload,
    devServerUrl,
    isDev,
    appIcon,
    isMac,
    electronDir,
    onRegisterBridge: registerBridges,
  });
  
  return win;
}

// Application lifecycle
app.whenReady().then(() => {
  // Set dock icon on macOS
  if (isMac && appIcon && app.dock?.setIcon) {
    try {
      app.dock.setIcon(appIcon);
    } catch (err) {
      console.warn("Failed to set dock icon", err);
    }
  }

  // Build and set application menu
  const menu = windowManager.buildAppMenu(Menu, app, isMac);
  Menu.setApplicationMenu(menu);

  // Create the main window
  createWindow();

  // Re-create window on macOS dock click
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Cleanup on all windows closed
app.on("window-all-closed", () => {
  windowManager.closeProductionServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Export for testing
module.exports = {
  sessions,
  sftpClients,
  ensureKeyDir,
  writeKeyToDisk,
};
