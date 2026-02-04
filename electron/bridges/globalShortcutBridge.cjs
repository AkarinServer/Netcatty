/**
 * Global Shortcut Bridge - Handles global keyboard shortcuts and system tray
 * Implements the "Quake mode" / drop-down terminal feature
 */

const path = require("node:path");
const fs = require("node:fs");

let electronModule = null;
let tray = null;
let closeToTray = false;
let currentHotkey = null;
let hotkeyEnabled = false;

const STATUS_TEXT = {
  session: {
    connected: "Connected",
    connecting: "Connecting",
    disconnected: "Disconnected",
  },
  portForward: {
    active: "Active",
    connecting: "Connecting",
    inactive: "Inactive",
    error: "Error",
  },
};

// Dynamic tray menu data (synced from renderer)
let trayMenuData = {
  sessions: [],        // { id, label, hostLabel, status }
  portForwardRules: [], // { id, label, type, localPort, remoteHost, remotePort, status, hostId }
};

function resolveTrayIconPath() {
  const { app } = electronModule;
  
  // Use different icons for different platforms
  // macOS: template image (black + transparent, system handles color)
  // Windows/Linux: colored icon
  const isMac = process.platform === "darwin";
  const iconName = isMac ? "tray-iconTemplate.png" : "tray-icon.png";
  
  // Security: Only use known packaged icon locations, ignore renderer-provided paths
  const candidates = [
    path.join(app.getAppPath(), "dist", iconName),
    path.join(app.getAppPath(), "public", iconName),
    path.join(__dirname, "../../public", iconName),
    path.join(__dirname, "../../dist", iconName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Initialize the bridge with dependencies
 */
function init(deps) {
  electronModule = deps.electronModule;
}

/**
 * Get the main window reference
 */
function getMainWindow() {
  const { BrowserWindow } = electronModule;
  const wins = BrowserWindow.getAllWindows();
  // Return the first window (main window)
  return wins && wins.length ? wins[0] : null;
}

/**
 * Convert a hotkey string from frontend format to Electron accelerator format
 * e.g., "⌘ + Space" -> "CommandOrControl+Space"
 *       "Ctrl + `" -> "CommandOrControl+`"
 *       "Alt + Space" -> "Alt+Space"
 */
function toElectronAccelerator(hotkeyStr) {
  if (!hotkeyStr || hotkeyStr === "Disabled" || hotkeyStr === "") {
    return null;
  }

  // Parse the hotkey string
  const parts = hotkeyStr.split("+").map((p) => p.trim());

  // Convert each part to Electron accelerator format
  const acceleratorParts = parts.map((part) => {
    // Mac symbols to Electron format
    if (part === "⌘" || part === "Cmd" || part === "Command") {
      return "CommandOrControl";
    }
    if (part === "⌃" || part === "Ctrl" || part === "Control") {
      return "Control";
    }
    if (part === "⌥" || part === "Alt" || part === "Option") {
      return "Alt";
    }
    if (part === "Shift") {
      return "Shift";
    }
    if (part === "Win" || part === "Super" || part === "Meta") {
      return "Super";
    }
    // Arrow symbols
    if (part === "↑") return "Up";
    if (part === "↓") return "Down";
    if (part === "←") return "Left";
    if (part === "→") return "Right";
    // Special keys
    if (part === "↵" || part === "Enter" || part === "Return") return "Return";
    if (part === "⇥" || part === "Tab") return "Tab";
    if (part === "⌫" || part === "Backspace") return "Backspace";
    if (part === "Del" || part === "Delete") return "Delete";
    if (part === "Esc" || part === "Escape") return "Escape";
    if (part === "Space") return "Space";
    // Backtick/grave accent
    if (part === "`" || part === "~") return "`";
    // Function keys
    if (/^F\d+$/i.test(part)) return part.toUpperCase();
    // Single character - keep as-is
    return part;
  });

  return acceleratorParts.join("+");
}

/**
 * Toggle the main window visibility
 */
function toggleWindowVisibility() {
  const win = getMainWindow();
  if (!win) return;

  try {
    // Check if window is minimized first - minimized windows may still report isVisible() = true
    if (win.isMinimized()) {
      win.restore();
      win.show();
      win.focus();
      const { app } = electronModule;
      try {
        app.focus({ steal: true });
      } catch {
        // ignore
      }
    } else if (win.isVisible()) {
      if (win.isFocused()) {
        // Window is visible and focused - hide it
        win.hide();
      } else {
        // Window is visible but not focused - focus it
        win.focus();
        const { app } = electronModule;
        try {
          app.focus({ steal: true });
        } catch {
          // ignore
        }
      }
    } else {
      // Window is hidden - show and focus it
      win.show();
        win.focus();
      const { app } = electronModule;
      try {
        app.focus({ steal: true });
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn("[GlobalShortcut] Error toggling window visibility:", err);
  }
}

/**
 * Register the global toggle hotkey
 */
function registerGlobalHotkey(hotkeyStr) {
  const { globalShortcut } = electronModule;

  // Unregister existing hotkey first
  unregisterGlobalHotkey();

  if (!hotkeyStr || hotkeyStr === "Disabled" || hotkeyStr === "") {
    hotkeyEnabled = false;
    currentHotkey = null;
    return { success: true, enabled: false };
  }

  const accelerator = toElectronAccelerator(hotkeyStr);
  if (!accelerator) {
    hotkeyEnabled = false;
    currentHotkey = null;
    return { success: false, error: "Invalid hotkey format" };
  }

  try {
    const registered = globalShortcut.register(accelerator, toggleWindowVisibility);
    if (registered) {
      hotkeyEnabled = true;
      currentHotkey = hotkeyStr;
      console.log(`[GlobalShortcut] Registered hotkey: ${accelerator}`);
      return { success: true, enabled: true, accelerator };
    } else {
      console.warn(`[GlobalShortcut] Failed to register hotkey: ${accelerator}`);
      return { success: false, error: "Hotkey may be in use by another application" };
    }
  } catch (err) {
    console.error("[GlobalShortcut] Error registering hotkey:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Unregister the global toggle hotkey
 */
function unregisterGlobalHotkey() {
  if (!hotkeyEnabled || !currentHotkey) return;

  const { globalShortcut } = electronModule;
  const accelerator = toElectronAccelerator(currentHotkey);

  if (accelerator) {
    try {
      globalShortcut.unregister(accelerator);
      console.log(`[GlobalShortcut] Unregistered hotkey: ${accelerator}`);
    } catch (err) {
      console.warn("[GlobalShortcut] Error unregistering hotkey:", err);
    }
  }

  hotkeyEnabled = false;
  currentHotkey = null;
}

/**
 * Create the system tray icon
 */
function createTray() {
  const { Tray, Menu, app, nativeImage } = electronModule;

  if (tray) {
    // Tray already exists
    return;
  }

  try {
    // Load the tray icon
    let trayIcon;
    const resolvedIconPath = resolveTrayIconPath();
    if (resolvedIconPath) {
      trayIcon = nativeImage.createFromPath(resolvedIconPath);
      // Resize for tray (16x16 on most platforms, 22x22 on some Linux)
      if (process.platform === "darwin") {
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
        trayIcon.setTemplateImage(true);
      } else {
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      }
    }

    tray = new Tray(trayIcon || nativeImage.createEmpty());
    tray.setToolTip("Netcatty");

    // Build and set initial context menu
    updateTrayMenu();

    // Click on tray icon shows menu
    tray.on("click", () => {
      if (tray) tray.popUpContextMenu();
    });

    console.log("[GlobalShortcut] System tray created");
  } catch (err) {
    console.error("[GlobalShortcut] Error creating tray:", err);
  }
}

/**
 * Build the tray context menu with dynamic content
 */
function buildTrayMenuTemplate() {
  const { app } = electronModule;
  const menuTemplate = [];

  // Open Main Window
  menuTemplate.push({
    label: "Open Main Window",
    click: () => {
      const win = getMainWindow();
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
        try {
          app.focus({ steal: true });
        } catch {
          // ignore
        }
      }
    },
  });

  menuTemplate.push({ type: "separator" });

  // Active Sessions
  if (trayMenuData.sessions && trayMenuData.sessions.length > 0) {
    menuTemplate.push({
      label: "Sessions",
      enabled: false,
    });
    for (const session of trayMenuData.sessions) {
      const statusText =
        session.status === "connected"
          ? STATUS_TEXT.session.connected
          : session.status === "connecting"
            ? STATUS_TEXT.session.connecting
            : STATUS_TEXT.session.disconnected;
      menuTemplate.push({
        label: `  ${session.hostLabel || session.label}  (${statusText})`,
        click: () => {
          // Focus window and switch to this session
          const win = getMainWindow();
          if (win) {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
            // Notify renderer to focus this session
            win.webContents?.send("netcatty:tray:focusSession", session.id);
          }
        },
      });
    }
    menuTemplate.push({ type: "separator" });
  }

  // Port Forwarding Rules
  if (trayMenuData.portForwardRules && trayMenuData.portForwardRules.length > 0) {
    menuTemplate.push({
      label: "Port Forwarding",
      enabled: false,
    });
    for (const rule of trayMenuData.portForwardRules) {
      const isActive = rule.status === "active";
      const isConnecting = rule.status === "connecting";
      const statusText =
        rule.status === "active"
          ? STATUS_TEXT.portForward.active
          : rule.status === "connecting"
            ? STATUS_TEXT.portForward.connecting
            : rule.status === "error"
              ? STATUS_TEXT.portForward.error
              : STATUS_TEXT.portForward.inactive;
      const typeLabel = rule.type === "local" ? "L" : rule.type === "remote" ? "R" : "D";
      const portInfo = rule.type === "dynamic" 
        ? `${rule.localPort}` 
        : `${rule.localPort} → ${rule.remoteHost}:${rule.remotePort}`;
      
      menuTemplate.push({
        label: `  [${typeLabel}] ${rule.label || portInfo}  (${statusText})`,
        enabled: !isConnecting,
        click: () => {
          const win = getMainWindow();
          if (win) {
            win.webContents?.send("netcatty:tray:togglePortForward", rule.id, !isActive);
          }
        },
      });
    }
    menuTemplate.push({ type: "separator" });
  }

  // Quit
  menuTemplate.push({
    label: "Quit",
    click: () => {
      closeToTray = false;
      app.quit();
    },
  });

  return menuTemplate;
}

/**
 * Update the tray context menu
 */
function updateTrayMenu() {
  if (!tray) return;
  
  const { Menu } = electronModule;
  const menuTemplate = buildTrayMenuTemplate();
  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

/**
 * Update tray menu data from renderer
 */
function setTrayMenuData(data) {
  if (data.sessions !== undefined) {
    trayMenuData.sessions = data.sessions;
  }
  if (data.portForwardRules !== undefined) {
    trayMenuData.portForwardRules = data.portForwardRules;
  }
  // Rebuild menu with new data
  updateTrayMenu();
}

/**
 * Destroy the system tray icon
 */
function destroyTray() {
  if (tray) {
    try {
      tray.destroy();
      tray = null;
      console.log("[GlobalShortcut] System tray destroyed");
    } catch (err) {
      console.warn("[GlobalShortcut] Error destroying tray:", err);
    }
  }
}

/**
 * Set close-to-tray behavior
 */
function setCloseToTray(enabled) {
  closeToTray = !!enabled;

  if (closeToTray) {
    // Create tray if it doesn't exist
    if (!tray) {
      createTray();
    }
  } else {
    // Destroy tray if it exists
    destroyTray();
  }

  return { success: true, enabled: closeToTray };
}

/**
 * Check if close-to-tray is enabled
 */
function isCloseToTrayEnabled() {
  return closeToTray;
}

/**
 * Get current hotkey status
 */
function getHotkeyStatus() {
  return {
    enabled: hotkeyEnabled,
    hotkey: currentHotkey,
  };
}

/**
 * Handle window close event - hide to tray instead of closing
 */
function handleWindowClose(event, win) {
  if (closeToTray && tray) {
    event.preventDefault();
    win.hide();
    return true; // Prevented close
  }
  return false; // Allow close
}

/**
 * Register IPC handlers
 */
function registerHandlers(ipcMain) {
  // Register global toggle hotkey
  ipcMain.handle("netcatty:globalHotkey:register", async (_event, { hotkey }) => {
    return registerGlobalHotkey(hotkey);
  });

  // Unregister global toggle hotkey
  ipcMain.handle("netcatty:globalHotkey:unregister", async () => {
    unregisterGlobalHotkey();
    return { success: true };
  });

  // Get current hotkey status
  ipcMain.handle("netcatty:globalHotkey:status", async () => {
    return getHotkeyStatus();
  });

  // Set close-to-tray behavior
  ipcMain.handle("netcatty:tray:setCloseToTray", async (_event, { enabled }) => {
    return setCloseToTray(enabled);
  });

  // Get close-to-tray status
  ipcMain.handle("netcatty:tray:isCloseToTray", async () => {
    return { enabled: closeToTray };
  });

  // Update tray menu data
  ipcMain.handle("netcatty:tray:updateMenuData", async (_event, data) => {
    setTrayMenuData(data);
    return { success: true };
  });

  console.log("[GlobalShortcut] IPC handlers registered");
}

/**
 * Cleanup on app quit
 */
function cleanup() {
  unregisterGlobalHotkey();
  destroyTray();
}

module.exports = {
  init,
  registerHandlers,
  registerGlobalHotkey,
  unregisterGlobalHotkey,
  setCloseToTray,
  isCloseToTrayEnabled,
  handleWindowClose,
  toggleWindowVisibility,
  getHotkeyStatus,
  setTrayMenuData,
  updateTrayMenu,
  cleanup,
};
