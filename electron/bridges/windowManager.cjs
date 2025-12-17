/**
 * Window Manager - Handles Electron window creation and management
 * Extracted from main.cjs for single responsibility
 */

const path = require("node:path");

// Theme colors configuration
const THEME_COLORS = {
  dark: {
    background: "#0b1220",
    titleBarColor: "#0b1220",
    symbolColor: "#ffffff",
  },
  light: {
    background: "#ffffff",
    titleBarColor: "#f8fafc",
    symbolColor: "#1e293b",
  },
};

// State
let mainWindow = null;
let settingsWindow = null;
let currentTheme = "light";
let currentLanguage = "en";
let handlersRegistered = false; // Prevent duplicate IPC handler registration
let menuDeps = null;

const MENU_LABELS = {
  en: { edit: "Edit", view: "View", window: "Window" },
  "zh-CN": { edit: "编辑", view: "视图", window: "窗口" },
};

function tMenu(language, key) {
  if (!language) return MENU_LABELS.en[key] ?? key;
  const direct = MENU_LABELS?.[language]?.[key];
  if (direct) return direct;
  const base = String(language).split("-")[0];
  const baseMatchKey = Object.keys(MENU_LABELS).find((k) => k === base || k.startsWith(`${base}-`));
  const baseMatch = baseMatchKey ? MENU_LABELS[baseMatchKey]?.[key] : undefined;
  return baseMatch ?? MENU_LABELS.en[key] ?? key;
}

function rebuildApplicationMenu() {
  if (!menuDeps?.Menu || !menuDeps?.app) return;
  const menu = buildAppMenu(menuDeps.Menu, menuDeps.app, menuDeps.isMac, currentLanguage);
  menuDeps.Menu.setApplicationMenu(menu);
}

function broadcastLanguageChanged() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents?.send?.("netcatty:languageChanged", currentLanguage);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents?.send?.("netcatty:languageChanged", currentLanguage);
    }
  } catch {
    // ignore
  }
}

/**
 * Normalize dev server URL for local access compatibility
 */
function normalizeDevServerUrl(urlString) {
  if (!urlString) return urlString;
  try {
    const u = new URL(urlString);
    const host = u.hostname;
    // Vite often binds to 0.0.0.0; Chromium can't navigate to it. Prefer localhost.
    if (
      host === "0.0.0.0" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]" ||
      host === "[::]" ||
      host === "::"
    ) {
      u.hostname = "localhost";
      return u.toString();
    }
    return urlString;
  } catch {
    return urlString;
  }
}

/**
 * Create the main application window
 */
async function createWindow(electronModule, options) {
  const { BrowserWindow, nativeTheme } = electronModule;
  const { preload, devServerUrl, isDev, appIcon, isMac, onRegisterBridge } = options;
  
  const themeConfig = THEME_COLORS[currentTheme];
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: themeConfig.background,
    icon: appIcon,
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow = win;

  // Register window control handlers
  registerWindowHandlers(electronModule.ipcMain, nativeTheme);

  if (isDev) {
    try {
      await win.loadURL(normalizeDevServerUrl(devServerUrl));
      win.webContents.openDevTools({ mode: "detach" });
      onRegisterBridge?.(win);
      return win;
    } catch (e) {
      console.warn("Dev server not reachable, falling back to bundled dist.", e);
    }
  }

  // Production mode - load via app:// protocol (handled by main process).
  await win.loadURL(`app://./index.html`);
  
  onRegisterBridge?.(win);
  return win;
}

/**
 * Create or focus the settings window
 */
async function openSettingsWindow(electronModule, options) {
  const { BrowserWindow } = electronModule;
  const { preload, devServerUrl, isDev, appIcon, isMac } = options;
  
  // If settings window already exists, just focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }
  
  const themeConfig = THEME_COLORS[currentTheme];
  const win = new BrowserWindow({
    width: 800,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: themeConfig.background,
    icon: appIcon,
    parent: mainWindow,
    modal: false,
    show: false,
    frame: false,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 18 } : undefined,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  settingsWindow = win;

  // Show window when ready to prevent flicker
  win.once('ready-to-show', () => {
    win.show();
  });

  // Clean up reference when closed
  win.on('closed', () => {
    settingsWindow = null;
  });

  // Load the settings page
  const settingsPath = '/#/settings';
  
  if (isDev) {
    try {
      await win.loadURL(normalizeDevServerUrl(devServerUrl) + settingsPath);
      return win;
    } catch (e) {
      console.warn("Dev server not reachable for settings window", e);
    }
  }

  // Production mode - load via app:// protocol (handled by main process).
  await win.loadURL(`app://./index.html#/settings`);
  
  return win;
}

/**
 * Close the settings window
 */
function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
    settingsWindow = null;
  }
}

/**
 * Register window control IPC handlers (only once)
 */
function registerWindowHandlers(ipcMain, nativeTheme) {
  // Prevent duplicate registration
  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  ipcMain.handle("netcatty:window:minimize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle("netcatty:window:maximize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
        return false;
      } else {
        mainWindow.maximize();
        return true;
      }
    }
    return false;
  });

  ipcMain.handle("netcatty:window:close", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle("netcatty:window:isMaximized", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isMaximized();
    }
    return false;
  });

  ipcMain.handle("netcatty:setTheme", (_event, theme) => {
    currentTheme = theme;
    nativeTheme.themeSource = theme;
    const themeConfig = THEME_COLORS[theme] || THEME_COLORS.light;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundColor(themeConfig.background);
    }
    // Also update settings window if open
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.setBackgroundColor(themeConfig.background);
    }
    return true;
  });

  ipcMain.handle("netcatty:setLanguage", (_event, language) => {
    currentLanguage = typeof language === "string" && language.length ? language : "en";
    rebuildApplicationMenu();
    broadcastLanguageChanged();
    return true;
  });

  // Settings window close handler
  ipcMain.handle("netcatty:settings:close", () => {
    closeSettingsWindow();
  });
}

/**
 * Build the application menu
 */
function buildAppMenu(Menu, app, isMac, language = currentLanguage) {
  // Save deps so later language changes can rebuild the menu.
  menuDeps = { Menu, app, isMac };
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: tMenu(language, "edit"),
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: tMenu(language, "view"),
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: tMenu(language, "window"),
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }]
          : [{ role: "close" }]),
      ],
    },
  ];
  
  return Menu.buildFromTemplate(template);
}

/**
 * Get the main window instance
 */
function getMainWindow() {
  return mainWindow;
}

/**
 * Get the settings window instance
 */
function getSettingsWindow() {
  return settingsWindow;
}

module.exports = {
  createWindow,
  openSettingsWindow,
  closeSettingsWindow,
  buildAppMenu,
  getMainWindow,
  getSettingsWindow,
  THEME_COLORS,
};
