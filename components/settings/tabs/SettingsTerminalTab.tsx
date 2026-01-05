import React, { useCallback } from "react";
import { Check, Minus, Plus, RotateCcw } from "lucide-react";
import type {
  CursorShape,
  LinkModifier,
  RightClickBehavior,
  TerminalEmulationType,
  TerminalSettings,
} from "../../../domain/models";
import { DEFAULT_KEYWORD_HIGHLIGHT_RULES } from "../../../domain/models";
import { useI18n } from "../../../application/i18n/I18nProvider";
import { TERMINAL_FONTS, MAX_FONT_SIZE, MIN_FONT_SIZE } from "../../../infrastructure/config/fonts";
import { TERMINAL_THEMES } from "../../../infrastructure/config/terminalThemes";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { SectionHeader, Select, SettingsTabContent, SettingRow, Toggle } from "../settings-ui";

// Helper: render terminal preview
const renderTerminalPreview = (theme: (typeof TERMINAL_THEMES)[0]) => {
  const c = theme.colors;
  const lines = [
    { prompt: "~", cmd: "ssh prod-server", color: c.foreground },
    { prompt: "prod", cmd: "ls -la", color: c.green },
    { prompt: "prod", cmd: "cat config.json", color: c.cyan },
  ];
  return (
    <div
      className="font-mono text-[9px] leading-tight p-1.5 rounded overflow-hidden h-full"
      style={{ backgroundColor: c.background, color: c.foreground }}
    >
      {lines.map((l, i) => (
        <div key={i} className="flex gap-1 truncate">
          <span style={{ color: c.blue }}>{l.prompt}</span>
          <span style={{ color: c.magenta }}>$</span>
          <span style={{ color: l.color }}>{l.cmd}</span>
        </div>
      ))}
      <div className="flex gap-1">
        <span style={{ color: c.blue }}>~</span>
        <span style={{ color: c.magenta }}>$</span>
        <span className="inline-block w-1.5 h-2.5 animate-pulse" style={{ backgroundColor: c.cursor }} />
      </div>
    </div>
  );
};

const TerminalThemeCard: React.FC<{
  theme: (typeof TERMINAL_THEMES)[0];
  active: boolean;
  onClick: () => void;
}> = ({ theme, active, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      "relative flex flex-col rounded-lg border-2 transition-all overflow-hidden text-left",
      active ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-primary/50",
    )}
  >
    <div className="h-16">{renderTerminalPreview(theme)}</div>
    <div className="px-2 py-1.5 text-xs font-medium border-t bg-card">{theme.name}</div>
    {active && (
      <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
        <Check size={10} className="text-primary-foreground" />
      </div>
    )}
  </button>
);

export default function SettingsTerminalTab(props: {
  terminalThemeId: string;
  setTerminalThemeId: (id: string) => void;
  terminalFontFamilyId: string;
  setTerminalFontFamilyId: (id: string) => void;
  terminalFontSize: number;
  setTerminalFontSize: (size: number) => void;
  terminalSettings: TerminalSettings;
  updateTerminalSetting: <K extends keyof TerminalSettings>(
    key: K,
    value: TerminalSettings[K],
  ) => void;
}) {
  const {
    terminalThemeId,
    setTerminalThemeId,
    terminalFontFamilyId,
    setTerminalFontFamilyId,
    terminalFontSize,
    setTerminalFontSize,
    terminalSettings,
    updateTerminalSetting,
  } = props;
  const { t } = useI18n();

  const clampFontSize = useCallback((next: number) => {
    const safe = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, next));
    setTerminalFontSize(safe);
  }, [setTerminalFontSize]);

  return (
    <SettingsTabContent value="terminal">
      <SectionHeader title={t("settings.terminal.section.theme")} />
      <div className="grid grid-cols-2 gap-3">
        {TERMINAL_THEMES.map((t) => (
          <TerminalThemeCard
            key={t.id}
            theme={t}
            active={terminalThemeId === t.id}
            onClick={() => setTerminalThemeId(t.id)}
          />
        ))}
      </div>

      <SectionHeader title={t("settings.terminal.section.font")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.terminal.font.family")}
          description={t("settings.terminal.font.family.desc")}
        >
          <Select
            value={terminalFontFamilyId}
            options={TERMINAL_FONTS.map((f) => ({ value: f.id, label: f.name }))}
            onChange={(id) => setTerminalFontFamilyId(id)}
            className="w-40"
          />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.font.size")}
          description={t("settings.terminal.font.size.desc")}
        >
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => clampFontSize(terminalFontSize - 1)}
              disabled={terminalFontSize <= MIN_FONT_SIZE}
            >
              <Minus size={14} />
            </Button>
            <span className="text-sm font-mono w-10 text-center">{terminalFontSize}px</span>
            <Button
              variant="outline"
              size="icon"
              onClick={() => clampFontSize(terminalFontSize + 1)}
              disabled={terminalFontSize >= MAX_FONT_SIZE}
            >
              <Plus size={14} />
            </Button>
          </div>
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.font.weight")}
          description={t("settings.terminal.font.weight.desc")}
        >
          <Select
            value={String(terminalSettings.fontWeight)}
            options={[
              { value: "100", label: "100 - Thin" },
              { value: "200", label: "200 - Extra Light" },
              { value: "300", label: "300 - Light" },
              { value: "400", label: "400 - Normal" },
              { value: "500", label: "500 - Medium" },
              { value: "600", label: "600 - Semi Bold" },
              { value: "700", label: "700 - Bold" },
              { value: "800", label: "800 - Extra Bold" },
              { value: "900", label: "900 - Black" },
            ]}
            onChange={(v) => updateTerminalSetting("fontWeight", parseInt(v))}
            className="w-40"
          />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.font.weightBold")}
          description={t("settings.terminal.font.weightBold.desc")}
        >
          <Select
            value={String(terminalSettings.fontWeightBold)}
            options={[
              { value: "100", label: "100 - Thin" },
              { value: "200", label: "200 - Extra Light" },
              { value: "300", label: "300 - Light" },
              { value: "400", label: "400 - Normal" },
              { value: "500", label: "500 - Medium" },
              { value: "600", label: "600 - Semi Bold" },
              { value: "700", label: "700 - Bold" },
              { value: "800", label: "800 - Extra Bold" },
              { value: "900", label: "900 - Black" },
            ]}
            onChange={(v) => updateTerminalSetting("fontWeightBold", parseInt(v))}
            className="w-40"
          />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.font.linePadding")}
          description={t("settings.terminal.font.linePadding.desc")}
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={terminalSettings.linePadding}
              onChange={(e) => updateTerminalSetting("linePadding", parseInt(e.target.value))}
              className="w-24 accent-primary"
            />
            <span className="text-sm text-muted-foreground w-6 text-center">{terminalSettings.linePadding}</span>
          </div>
        </SettingRow>

        <SettingRow label={t("settings.terminal.font.emulationType")}>
          <Select
            value={terminalSettings.terminalEmulationType}
            options={[
              { value: "xterm-256color", label: "xterm-256color" },
              { value: "xterm-16color", label: "xterm-16color" },
              { value: "xterm", label: "xterm" },
            ]}
            onChange={(v) =>
              updateTerminalSetting("terminalEmulationType", v as TerminalEmulationType)
            }
            className="w-36"
          />
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.terminal.section.cursor")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow label={t("settings.terminal.cursor.style")}>
          <Select
            value={terminalSettings.cursorShape}
            options={[
              { value: "block", label: t("settings.terminal.cursor.style.block") },
              { value: "bar", label: t("settings.terminal.cursor.style.bar") },
              { value: "underline", label: t("settings.terminal.cursor.style.underline") },
            ]}
            onChange={(v) => updateTerminalSetting("cursorShape", v as CursorShape)}
            className="w-32"
          />
        </SettingRow>

        <SettingRow label={t("settings.terminal.cursor.blink")}>
          <Toggle
            checked={terminalSettings.cursorBlink}
            onChange={(v) => updateTerminalSetting("cursorBlink", v)}
          />
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.terminal.section.keyboard")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.terminal.keyboard.altAsMeta")}
          description={t("settings.terminal.keyboard.altAsMeta.desc")}
        >
          <Toggle checked={terminalSettings.altAsMeta} onChange={(v) => updateTerminalSetting("altAsMeta", v)} />
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.terminal.section.accessibility")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.terminal.accessibility.minimumContrastRatio")}
          description={t("settings.terminal.accessibility.minimumContrastRatio.desc")}
        >
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={21}
              step={1}
              value={terminalSettings.minimumContrastRatio}
              onChange={(e) =>
                updateTerminalSetting("minimumContrastRatio", parseInt(e.target.value))
              }
              className="w-24 accent-primary"
            />
            <span className="text-sm text-muted-foreground w-6 text-center">
              {terminalSettings.minimumContrastRatio}
            </span>
          </div>
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.terminal.section.behavior")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.terminal.behavior.rightClick")}
          description={t("settings.terminal.behavior.rightClick.desc")}
        >
          <Select
            value={terminalSettings.rightClickBehavior}
            options={[
              { value: "context-menu", label: t("settings.terminal.behavior.rightClick.menu") },
              { value: "paste", label: t("settings.terminal.behavior.rightClick.paste") },
              { value: "select-word", label: t("settings.terminal.behavior.rightClick.selectWord") },
            ]}
            onChange={(v) => updateTerminalSetting("rightClickBehavior", v as RightClickBehavior)}
            className="w-36"
          />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.behavior.copyOnSelect")}
          description={t("settings.terminal.behavior.copyOnSelect.desc")}
        >
          <Toggle checked={terminalSettings.copyOnSelect} onChange={(v) => updateTerminalSetting("copyOnSelect", v)} />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.behavior.middleClickPaste")}
          description={t("settings.terminal.behavior.middleClickPaste.desc")}
        >
          <Toggle checked={terminalSettings.middleClickPaste} onChange={(v) => updateTerminalSetting("middleClickPaste", v)} />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.behavior.scrollOnInput")}
          description={t("settings.terminal.behavior.scrollOnInput.desc")}
        >
          <Toggle checked={terminalSettings.scrollOnInput} onChange={(v) => updateTerminalSetting("scrollOnInput", v)} />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.behavior.scrollOnOutput")}
          description={t("settings.terminal.behavior.scrollOnOutput.desc")}
        >
          <Toggle checked={terminalSettings.scrollOnOutput} onChange={(v) => updateTerminalSetting("scrollOnOutput", v)} />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.behavior.scrollOnKeyPress")}
          description={t("settings.terminal.behavior.scrollOnKeyPress.desc")}
        >
          <Toggle checked={terminalSettings.scrollOnKeyPress} onChange={(v) => updateTerminalSetting("scrollOnKeyPress", v)} />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.behavior.scrollOnPaste")}
          description={t("settings.terminal.behavior.scrollOnPaste.desc")}
        >
          <Toggle checked={terminalSettings.scrollOnPaste} onChange={(v) => updateTerminalSetting("scrollOnPaste", v)} />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.behavior.linkModifier")}
          description={t("settings.terminal.behavior.linkModifier.desc")}
        >
          <Select
            value={terminalSettings.linkModifier}
            options={[
              { value: "none", label: t("settings.terminal.behavior.linkModifier.none") },
              { value: "ctrl", label: t("settings.terminal.behavior.linkModifier.ctrl") },
              { value: "alt", label: t("settings.terminal.behavior.linkModifier.alt") },
              { value: "meta", label: t("settings.terminal.behavior.linkModifier.meta") },
            ]}
            onChange={(v) => updateTerminalSetting("linkModifier", v as LinkModifier)}
            className="w-40"
          />
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.terminal.section.scrollback")} />
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground mb-3">
          {t("settings.terminal.scrollback.desc")}
        </p>
        <div className="space-y-1">
          <Label className="text-xs">{t("settings.terminal.scrollback.rows")}</Label>
          <Input
            type="number"
            min={0}
            max={100000}
            value={terminalSettings.scrollback}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 0 && val <= 100000) {
                updateTerminalSetting("scrollback", val);
              }
            }}
            className="w-full"
          />
        </div>
      </div>

      <SectionHeader title={t("settings.terminal.section.keywordHighlight")} />
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium">
            {t("settings.terminal.keywordHighlight.title")}
          </span>
          <Toggle
            checked={terminalSettings.keywordHighlightEnabled}
            onChange={(v) => updateTerminalSetting("keywordHighlightEnabled", v)}
          />
        </div>
        {terminalSettings.keywordHighlightEnabled && (
          <div className="space-y-2.5">
            {terminalSettings.keywordHighlightRules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between">
                <span className="text-sm" style={{ color: rule.color }}>
                  {rule.label}
                </span>
                <label className="relative">
                  <input
                    type="color"
                    value={rule.color}
                    onChange={(e) => {
                      const newRules = terminalSettings.keywordHighlightRules.map((r) =>
                        r.id === rule.id ? { ...r, color: e.target.value } : r,
                      );
                      updateTerminalSetting("keywordHighlightRules", newRules);
                    }}
                    className="sr-only"
                  />
                  <span
                    className="block w-10 h-6 rounded-md cursor-pointer border border-border/50 hover:border-border transition-colors"
                    style={{ backgroundColor: rule.color }}
                  />
                </label>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="w-full mt-3 text-muted-foreground hover:text-foreground"
              onClick={() => {
                const resetRules = terminalSettings.keywordHighlightRules.map((rule) => {
                  const defaultRule = DEFAULT_KEYWORD_HIGHLIGHT_RULES.find((r) => r.id === rule.id);
                  return defaultRule ? { ...rule, color: defaultRule.color } : rule;
                });
                updateTerminalSetting("keywordHighlightRules", resetRules);
              }}
            >
              <RotateCcw size={14} className="mr-2" />
              {t("settings.terminal.keywordHighlight.resetColors")}
            </Button>
          </div>
        )}
      </div>

      <SectionHeader title={t("settings.terminal.section.localShell")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.terminal.localShell.shell")}
          description={t("settings.terminal.localShell.shell.desc")}
        >
          <Input
            value={terminalSettings.localShell}
            placeholder={t("settings.terminal.localShell.shell.placeholder")}
            onChange={(e) => updateTerminalSetting("localShell", e.target.value)}
            className="w-48"
          />
        </SettingRow>

        <SettingRow
          label={t("settings.terminal.localShell.startDir")}
          description={t("settings.terminal.localShell.startDir.desc")}
        >
          <Input
            value={terminalSettings.localStartDir}
            placeholder={t("settings.terminal.localShell.startDir.placeholder")}
            onChange={(e) => updateTerminalSetting("localStartDir", e.target.value)}
            className="w-48"
          />
        </SettingRow>
      </div>
    </SettingsTabContent>
  );
}
