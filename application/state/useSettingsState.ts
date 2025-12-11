import { useCallback,useEffect,useMemo,useState } from 'react';
import { SyncConfig, TerminalSettings, DEFAULT_TERMINAL_SETTINGS, HotkeyScheme, CustomKeyBindings, DEFAULT_KEY_BINDINGS, KeyBinding } from '../../domain/models';
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
} from '../../infrastructure/config/storageKeys';
import { TERMINAL_THEMES } from '../../infrastructure/config/terminalThemes';
import { TERMINAL_FONTS, DEFAULT_FONT_SIZE } from '../../infrastructure/config/fonts';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';

const DEFAULT_COLOR = '221.2 83.2% 53.3%';
const DEFAULT_THEME: 'light' | 'dark' = 'light';
const DEFAULT_TERMINAL_THEME = 'netcatty-dark';
const DEFAULT_FONT_FAMILY = 'menlo';
const DEFAULT_HOTKEY_SCHEME: HotkeyScheme = 'mac';

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
  window.netcatty?.setTheme?.(theme);
};

export const useSettingsState = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => (localStorageAdapter.readString(STORAGE_KEY_THEME) as 'dark' | 'light') || DEFAULT_THEME);
  const [primaryColor, setPrimaryColor] = useState<string>(() => localStorageAdapter.readString(STORAGE_KEY_COLOR) || DEFAULT_COLOR);
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(() => localStorageAdapter.read<SyncConfig>(STORAGE_KEY_SYNC));
  const [terminalThemeId, setTerminalThemeId] = useState<string>(() => localStorageAdapter.readString(STORAGE_KEY_TERM_THEME) || DEFAULT_TERMINAL_THEME);
  const [terminalFontFamilyId, setTerminalFontFamilyId] = useState<string>(() => localStorageAdapter.readString(STORAGE_KEY_TERM_FONT_FAMILY) || DEFAULT_FONT_FAMILY);
  const [terminalFontSize, setTerminalFontSize] = useState<number>(() => localStorageAdapter.readNumber(STORAGE_KEY_TERM_FONT_SIZE) || DEFAULT_FONT_SIZE);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(() => {
    const stored = localStorageAdapter.read<TerminalSettings>(STORAGE_KEY_TERM_SETTINGS);
    return stored ? { ...DEFAULT_TERMINAL_SETTINGS, ...stored } : DEFAULT_TERMINAL_SETTINGS;
  });
  const [hotkeyScheme, setHotkeyScheme] = useState<HotkeyScheme>(() => (localStorageAdapter.readString(STORAGE_KEY_HOTKEY_SCHEME) as HotkeyScheme) || DEFAULT_HOTKEY_SCHEME);
  const [customKeyBindings, setCustomKeyBindings] = useState<CustomKeyBindings>(() => 
    localStorageAdapter.read<CustomKeyBindings>(STORAGE_KEY_CUSTOM_KEY_BINDINGS) || {}
  );

  useEffect(() => {
    applyThemeTokens(theme, primaryColor);
    localStorageAdapter.writeString(STORAGE_KEY_THEME, theme);
    localStorageAdapter.writeString(STORAGE_KEY_COLOR, primaryColor);
  }, [theme, primaryColor]);

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
  };
};
