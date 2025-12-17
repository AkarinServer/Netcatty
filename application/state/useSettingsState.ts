import { useCallback,useEffect,useMemo,useState } from 'react';
import { SyncConfig, TerminalSettings, DEFAULT_TERMINAL_SETTINGS, HotkeyScheme, CustomKeyBindings, DEFAULT_KEY_BINDINGS, KeyBinding, UILanguage } from '../../domain/models';
import {
STORAGE_KEY_COLOR,
STORAGE_KEY_SYNC,
STORAGE_KEY_TERM_THEME,
STORAGE_KEY_THEME,
STORAGE_KEY_TERM_FONT_FAMILY,
STORAGE_KEY_TERM_FONT_SIZE,
STORAGE_KEY_TERM_SETTINGS,
STORAGE_KEY_HOTKEY_SCHEME,
STORAGE_KEY_CUSTOM_KEY_BINDINGS,
STORAGE_KEY_CUSTOM_CSS,
STORAGE_KEY_UI_LANGUAGE,
} from '../../infrastructure/config/storageKeys';
import { DEFAULT_UI_LOCALE, isSupportedLocale } from '../../infrastructure/config/i18n';
import { TERMINAL_THEMES } from '../../infrastructure/config/terminalThemes';
import { TERMINAL_FONTS, DEFAULT_FONT_SIZE } from '../../infrastructure/config/fonts';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';
import { netcattyBridge } from '../../infrastructure/services/netcattyBridge';

const DEFAULT_COLOR = '221.2 83.2% 53.3%';
const DEFAULT_THEME: 'light' | 'dark' = 'light';
const DEFAULT_TERMINAL_THEME = 'netcatty-dark';
const DEFAULT_FONT_FAMILY = 'menlo';
// Auto-detect default hotkey scheme based on platform
const DEFAULT_HOTKEY_SCHEME: HotkeyScheme = 
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform) 
    ? 'mac' 
    : 'pc';

const applyThemeTokens = (theme: 'light' | 'dark', primaryColor: string) => {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.setProperty('--primary', primaryColor);
  root.style.setProperty('--accent', primaryColor);
  root.style.setProperty('--ring', primaryColor);
  const lightness = parseFloat(primaryColor.split(/\s+/)[2]?.replace('%', '') || '');
  const accentForeground = theme === 'dark'
    ? '220 40% 96%'
    : (!Number.isNaN(lightness) && lightness < 55 ? '0 0% 98%' : '222 47% 12%');
  root.style.setProperty('--accent-foreground', accentForeground);
  
  // Sync with native window title bar (Electron)
  netcattyBridge.get()?.setTheme?.(theme);
};

export const useSettingsState = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorageAdapter.readString(STORAGE_KEY_THEME) as 'dark' | 'light') || DEFAULT_THEME);
  const [primaryColor, setPrimaryColor] = useState<string>(() => localStorageAdapter.readString(STORAGE_KEY_COLOR) || DEFAULT_COLOR);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(() => localStorageAdapter.read<SyncConfig>(STORAGE_KEY_SYNC));
  const [terminalThemeId, setTerminalThemeId] = useState<string>(() => localStorageAdapter.readString(STORAGE_KEY_TERM_THEME) || DEFAULT_TERMINAL_THEME);
  const [terminalFontFamilyId, setTerminalFontFamilyId] = useState<string>(() => localStorageAdapter.readString(STORAGE_KEY_TERM_FONT_FAMILY) || DEFAULT_FONT_FAMILY);
  const [terminalFontSize, setTerminalFontSize] = useState<number>(() => localStorageAdapter.readNumber(STORAGE_KEY_TERM_FONT_SIZE) || DEFAULT_FONT_SIZE);
  const [uiLanguage, setUiLanguage] = useState<UILanguage>(() => {
    const stored = localStorageAdapter.readString(STORAGE_KEY_UI_LANGUAGE);
    return stored && isSupportedLocale(stored) ? stored : DEFAULT_UI_LOCALE;
  });
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(() => {
    const stored = localStorageAdapter.read<TerminalSettings>(STORAGE_KEY_TERM_SETTINGS);
    return stored ? { ...DEFAULT_TERMINAL_SETTINGS, ...stored } : DEFAULT_TERMINAL_SETTINGS;
  });
  const [hotkeyScheme, setHotkeyScheme] = useState<HotkeyScheme>(() => {
    const stored = localStorageAdapter.readString(STORAGE_KEY_HOTKEY_SCHEME);
    // Validate stored value is a valid HotkeyScheme
    if (stored === 'disabled' || stored === 'mac' || stored === 'pc') {
      return stored;
    }
    return DEFAULT_HOTKEY_SCHEME;
  });
  const [customKeyBindings, setCustomKeyBindings] = useState<CustomKeyBindings>(() => 
    localStorageAdapter.read<CustomKeyBindings>(STORAGE_KEY_CUSTOM_KEY_BINDINGS) || {}
  );
  const [customCSS, setCustomCSS] = useState<string>(() => 
    localStorageAdapter.readString(STORAGE_KEY_CUSTOM_CSS) || ''
  );

  useEffect(() => {
    applyThemeTokens(theme, primaryColor);
    localStorageAdapter.writeString(STORAGE_KEY_THEME, theme);
    localStorageAdapter.writeString(STORAGE_KEY_COLOR, primaryColor);
  }, [theme, primaryColor]);

  useEffect(() => {
    localStorageAdapter.writeString(STORAGE_KEY_UI_LANGUAGE, uiLanguage);
    document.documentElement.lang = uiLanguage;
    netcattyBridge.get()?.setLanguage?.(uiLanguage);
  }, [uiLanguage]);

  useEffect(() => {
    const bridge = netcattyBridge.get();
    if (!bridge?.onLanguageChanged) return;
    const unsubscribe = bridge.onLanguageChanged((language) => {
      if (typeof language !== 'string' || !language.length) return;
      const next = isSupportedLocale(language) ? language : DEFAULT_UI_LOCALE;
      setUiLanguage((prev) => (prev === next ? prev : next));
    });
    return () => {
      try {
        unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, []);

  // Listen for storage changes from other windows (cross-window sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_THEME && e.newValue) {
        const newTheme = e.newValue as 'light' | 'dark';
        if (newTheme !== theme) {
          setTheme(newTheme);
        }
      }
      if (e.key === STORAGE_KEY_COLOR && e.newValue) {
        if (e.newValue !== primaryColor) {
          setPrimaryColor(e.newValue);
        }
      }
      if (e.key === STORAGE_KEY_CUSTOM_CSS && e.newValue !== null) {
        if (e.newValue !== customCSS) {
          setCustomCSS(e.newValue);
        }
      }
      if (e.key === STORAGE_KEY_HOTKEY_SCHEME && e.newValue) {
        const newScheme = e.newValue as HotkeyScheme;
        if (newScheme !== hotkeyScheme) {
          setHotkeyScheme(newScheme);
        }
      }
      if (e.key === STORAGE_KEY_UI_LANGUAGE && e.newValue) {
        const next = e.newValue as UILanguage;
        if (typeof next === 'string' && isSupportedLocale(next) && next !== uiLanguage) {
          setUiLanguage(next);
        }
      }
      if (e.key === STORAGE_KEY_CUSTOM_KEY_BINDINGS && e.newValue) {
        try {
          const newBindings = JSON.parse(e.newValue) as CustomKeyBindings;
          setCustomKeyBindings(newBindings);
        } catch {
          // ignore parse errors
        }
      }
      // Sync terminal settings from other windows
	      if (e.key === STORAGE_KEY_TERM_SETTINGS && e.newValue) {
	        try {
	          const newSettings = JSON.parse(e.newValue) as TerminalSettings;
	          setTerminalSettings(_prev => ({ ...DEFAULT_TERMINAL_SETTINGS, ...newSettings }));
	        } catch {
	          // ignore parse errors
	        }
	      }
      // Sync terminal theme from other windows
      if (e.key === STORAGE_KEY_TERM_THEME && e.newValue) {
        if (e.newValue !== terminalThemeId) {
          setTerminalThemeId(e.newValue);
        }
      }
      // Sync terminal font family from other windows
      if (e.key === STORAGE_KEY_TERM_FONT_FAMILY && e.newValue) {
        if (e.newValue !== terminalFontFamilyId) {
          setTerminalFontFamilyId(e.newValue);
        }
      }
      // Sync terminal font size from other windows
      if (e.key === STORAGE_KEY_TERM_FONT_SIZE && e.newValue) {
        const newSize = parseInt(e.newValue, 10);
        if (!isNaN(newSize) && newSize !== terminalFontSize) {
          setTerminalFontSize(newSize);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [theme, primaryColor, customCSS, hotkeyScheme, uiLanguage, terminalThemeId, terminalFontFamilyId, terminalFontSize]);

  useEffect(() => {
    localStorageAdapter.writeString(STORAGE_KEY_TERM_THEME, terminalThemeId);
  }, [terminalThemeId]);

  useEffect(() => {
    localStorageAdapter.writeString(STORAGE_KEY_TERM_FONT_FAMILY, terminalFontFamilyId);
  }, [terminalFontFamilyId]);

  useEffect(() => {
    localStorageAdapter.writeNumber(STORAGE_KEY_TERM_FONT_SIZE, terminalFontSize);
  }, [terminalFontSize]);

  useEffect(() => {
    localStorageAdapter.write(STORAGE_KEY_TERM_SETTINGS, terminalSettings);
  }, [terminalSettings]);

  useEffect(() => {
    localStorageAdapter.writeString(STORAGE_KEY_HOTKEY_SCHEME, hotkeyScheme);
  }, [hotkeyScheme]);

  useEffect(() => {
    localStorageAdapter.write(STORAGE_KEY_CUSTOM_KEY_BINDINGS, customKeyBindings);
  }, [customKeyBindings]);

  // Apply and persist custom CSS
  useEffect(() => {
    localStorageAdapter.writeString(STORAGE_KEY_CUSTOM_CSS, customCSS);
    
    // Apply custom CSS to document
    let styleEl = document.getElementById('netcatty-custom-css') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'netcatty-custom-css';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = customCSS;
  }, [customCSS]);

  // Get merged key bindings (defaults + custom overrides)
  const keyBindings = useMemo((): KeyBinding[] => {
    return DEFAULT_KEY_BINDINGS.map(binding => {
      const custom = customKeyBindings[binding.id];
      if (!custom) return binding;
      return {
        ...binding,
        mac: custom.mac ?? binding.mac,
        pc: custom.pc ?? binding.pc,
      };
    });
  }, [customKeyBindings]);

  // Update a single key binding
  const updateKeyBinding = useCallback((bindingId: string, scheme: 'mac' | 'pc', newKey: string) => {
    setCustomKeyBindings(prev => ({
      ...prev,
      [bindingId]: {
        ...prev[bindingId],
        [scheme]: newKey,
      },
    }));
  }, []);

  // Reset a key binding to default
  const resetKeyBinding = useCallback((bindingId: string, scheme?: 'mac' | 'pc') => {
    setCustomKeyBindings(prev => {
      const next = { ...prev };
      if (scheme) {
        if (next[bindingId]) {
          delete next[bindingId][scheme];
          if (Object.keys(next[bindingId]).length === 0) {
            delete next[bindingId];
          }
        }
      } else {
        delete next[bindingId];
      }
      return next;
    });
  }, []);

  // Reset all key bindings to defaults
  const resetAllKeyBindings = useCallback(() => {
    setCustomKeyBindings({});
  }, []);

  const updateSyncConfig = useCallback((config: SyncConfig | null) => {
    setSyncConfig(config);
    localStorageAdapter.write(STORAGE_KEY_SYNC, config);
  }, []);

  const currentTerminalTheme = useMemo(
    () => TERMINAL_THEMES.find(t => t.id === terminalThemeId) || TERMINAL_THEMES[0],
    [terminalThemeId]
  );

  const currentTerminalFont = useMemo(
    () => TERMINAL_FONTS.find(f => f.id === terminalFontFamilyId) || TERMINAL_FONTS[0],
    [terminalFontFamilyId]
  );

  const updateTerminalSetting = useCallback(<K extends keyof TerminalSettings>(
    key: K,
    value: TerminalSettings[K]
  ) => {
    setTerminalSettings(prev => ({ ...prev, [key]: value }));
  }, []);

  return {
    theme,
    setTheme,
    primaryColor,
    setPrimaryColor,
    syncConfig,
    updateSyncConfig,
    uiLanguage,
    setUiLanguage,
    terminalThemeId,
    setTerminalThemeId,
    currentTerminalTheme,
    terminalFontFamilyId,
    setTerminalFontFamilyId,
    currentTerminalFont,
    terminalFontSize,
    setTerminalFontSize,
    terminalSettings,
    setTerminalSettings,
    updateTerminalSetting,
    hotkeyScheme,
    setHotkeyScheme,
    keyBindings,
    customKeyBindings,
    updateKeyBinding,
    resetKeyBinding,
    resetAllKeyBindings,
    customCSS,
    setCustomCSS,
  };
};
