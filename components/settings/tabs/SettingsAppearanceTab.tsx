import React, { useCallback } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { useI18n } from "../../../application/i18n/I18nProvider";
import { SUPPORTED_UI_LOCALES } from "../../../infrastructure/config/i18n";
import { cn } from "../../../lib/utils";
import { SectionHeader, SettingsTabContent, SettingRow, Toggle, Select } from "../settings-ui";

// More comprehensive color palette
const COLORS = [
  // Blues
  { name: "Sky Blue", value: "199 89% 48%" },
  { name: "Blue", value: "221.2 83.2% 53.3%" },
  { name: "Indigo", value: "234 89% 62%" },
  // Purples
  { name: "Violet", value: "262.1 83.3% 57.8%" },
  { name: "Purple", value: "271 81% 56%" },
  { name: "Fuchsia", value: "292 84% 61%" },
  // Pinks & Reds
  { name: "Pink", value: "330 81% 60%" },
  { name: "Rose", value: "346.8 77.2% 49.8%" },
  { name: "Red", value: "0 84.2% 60.2%" },
  // Oranges & Yellows
  { name: "Orange", value: "24.6 95% 53.1%" },
  { name: "Amber", value: "38 92% 50%" },
  { name: "Yellow", value: "48 96% 53%" },
  // Greens
  { name: "Lime", value: "84 81% 44%" },
  { name: "Green", value: "142.1 76.2% 36.3%" },
  { name: "Emerald", value: "160 84% 39%" },
  { name: "Teal", value: "173 80% 40%" },
  // Neutrals
  { name: "Cyan", value: "189 94% 43%" },
  { name: "Slate", value: "215 16% 47%" },
];

export default function SettingsAppearanceTab(props: {
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  uiLanguage: string;
  setUiLanguage: (language: string) => void;
  customCSS: string;
  setCustomCSS: (css: string) => void;
}) {
  const { t } = useI18n();
  const { theme, setTheme, primaryColor, setPrimaryColor, uiLanguage, setUiLanguage, customCSS, setCustomCSS } = props;

  const getHslStyle = useCallback((hsl: string) => ({ backgroundColor: `hsl(${hsl})` }), []);

  const hexToHsl = useCallback((hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }, []);

  return (
    <SettingsTabContent value="appearance">
      <SectionHeader title={t("settings.appearance.language")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.language")}
          description={t("settings.appearance.language.desc")}
        >
          <Select
            value={uiLanguage}
            options={SUPPORTED_UI_LOCALES.map((l) => ({ value: l.id, label: l.label }))}
            onChange={(v) => setUiLanguage(v)}
            className="w-40"
          />
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.uiTheme")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.darkMode")}
          description={t("settings.appearance.darkMode.desc")}
        >
          <div className="flex items-center gap-2">
            <Sun size={14} className="text-muted-foreground" />
            <Toggle checked={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />
            <Moon size={14} className="text-muted-foreground" />
          </div>
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.accentColor")} />
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c.name}
            onClick={() => setPrimaryColor(c.value)}
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm",
              primaryColor === c.value
                ? "ring-2 ring-offset-2 ring-foreground scale-110"
                : "hover:scale-105",
            )}
            style={getHslStyle(c.value)}
            title={c.name}
          >
            {primaryColor === c.value && <Check className="text-white drop-shadow-md" size={10} />}
          </button>
        ))}
        <label
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm cursor-pointer",
            "bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500",
            !COLORS.some((c) => c.value === primaryColor)
              ? "ring-2 ring-offset-2 ring-foreground scale-110"
              : "hover:scale-105",
          )}
          title={t("settings.appearance.customColor")}
        >
          <input
            type="color"
            className="sr-only"
            onChange={(e) => setPrimaryColor(hexToHsl(e.target.value))}
          />
          {!COLORS.some((c) => c.value === primaryColor) ? (
            <Check className="text-white drop-shadow-md" size={10} />
          ) : (
            <Palette size={12} className="text-white drop-shadow-md" />
          )}
        </label>
      </div>

      <SectionHeader title={t("settings.appearance.customCss")} />
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("settings.appearance.customCss.desc")}
        </p>
        <textarea
          value={customCSS}
          onChange={(e) => setCustomCSS(e.target.value)}
          placeholder={t("settings.appearance.customCss.placeholder")}
          className="w-full h-32 px-3 py-2 text-xs font-mono bg-muted/50 border border-border rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
          spellCheck={false}
        />
      </div>
    </SettingsTabContent>
  );
}
