/**
 * Settings Page - Standalone settings window content
 * This component is rendered in a separate Electron window
 */
import { AppWindow, Cloud, Keyboard, Palette, TerminalSquare, X } from "lucide-react";
import React, { useCallback } from "react";
import { useSettingsState } from "../application/state/useSettingsState";
import { useVaultState } from "../application/state/useVaultState";
import { useWindowControls } from "../application/state/useWindowControls";
import SettingsApplicationTab from "./SettingsApplicationTab";
import SettingsAppearanceTab from "./settings/tabs/SettingsAppearanceTab";
import SettingsShortcutsTab from "./settings/tabs/SettingsShortcutsTab";
import SettingsSyncTab from "./settings/tabs/SettingsSyncTab";
import SettingsTerminalTab from "./settings/tabs/SettingsTerminalTab";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export default function SettingsPage() {
    const {
        theme,
        setTheme,
        primaryColor,
        setPrimaryColor,
        terminalThemeId,
        setTerminalThemeId,
        terminalFontFamilyId,
        setTerminalFontFamilyId,
        terminalFontSize,
        setTerminalFontSize,
        terminalSettings,
        updateTerminalSetting,
        hotkeyScheme,
        setHotkeyScheme,
        keyBindings,
        updateKeyBinding,
        resetKeyBinding,
        resetAllKeyBindings,
        customCSS,
        setCustomCSS,
    } = useSettingsState();

    const { hosts, keys, snippets, importDataFromString } = useVaultState();
    const { closeSettingsWindow } = useWindowControls();

    const handleClose = useCallback(() => {
        closeSettingsWindow();
    }, [closeSettingsWindow]);

    return (
        <div className="h-screen flex flex-col bg-background text-foreground">
            <div className="shrink-0 border-b border-border app-drag">
                <div className="flex items-center justify-between px-4 pt-3">
                    {isMac && <div className="h-6" />}
                </div>
                <div className="flex items-center justify-between px-4 py-2">
                    <h1 className="text-lg font-semibold">Settings</h1>
                    {!isMac && (
                        <button
                            onClick={handleClose}
                            className="app-no-drag w-8 h-8 flex items-center justify-center rounded-md hover:bg-destructive/20 hover:text-destructive transition-colors text-muted-foreground"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            <Tabs defaultValue="application" orientation="vertical" className="flex-1 flex overflow-hidden">
                <div className="w-56 border-r border-border flex flex-col shrink-0 px-3 py-3">
                    <TabsList className="flex flex-col h-auto bg-transparent gap-1 p-0 justify-start">
                        <TabsTrigger
                            value="application"
                            className="w-full justify-start gap-2 px-3 py-2 text-sm data-[state=active]:bg-background hover:bg-background/60 rounded-md transition-colors"
                        >
                            <AppWindow size={14} /> Application
                        </TabsTrigger>
                        <TabsTrigger
                            value="appearance"
                            className="w-full justify-start gap-2 px-3 py-2 text-sm data-[state=active]:bg-background hover:bg-background/60 rounded-md transition-colors"
                        >
                            <Palette size={14} /> Appearance
                        </TabsTrigger>
                        <TabsTrigger
                            value="terminal"
                            className="w-full justify-start gap-2 px-3 py-2 text-sm data-[state=active]:bg-background hover:bg-background/60 rounded-md transition-colors"
                        >
                            <TerminalSquare size={14} /> Terminal
                        </TabsTrigger>
                        <TabsTrigger
                            value="shortcuts"
                            className="w-full justify-start gap-2 px-3 py-2 text-sm data-[state=active]:bg-background hover:bg-background/60 rounded-md transition-colors"
                        >
                            <Keyboard size={14} /> Shortcuts
                        </TabsTrigger>
                        <TabsTrigger
                            value="sync"
                            className="w-full justify-start gap-2 px-3 py-2 text-sm data-[state=active]:bg-background hover:bg-background/60 rounded-md transition-colors"
                        >
                            <Cloud size={14} /> Sync & Cloud
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 h-full flex flex-col min-h-0 bg-muted/10">
                    <SettingsApplicationTab />

                    <SettingsAppearanceTab
                        theme={theme}
                        setTheme={setTheme}
                        primaryColor={primaryColor}
                        setPrimaryColor={setPrimaryColor}
                        customCSS={customCSS}
                        setCustomCSS={setCustomCSS}
                    />

                    <SettingsTerminalTab
                        terminalThemeId={terminalThemeId}
                        setTerminalThemeId={setTerminalThemeId}
                        terminalFontFamilyId={terminalFontFamilyId}
                        setTerminalFontFamilyId={setTerminalFontFamilyId}
                        terminalFontSize={terminalFontSize}
                        setTerminalFontSize={setTerminalFontSize}
                        terminalSettings={terminalSettings}
                        updateTerminalSetting={updateTerminalSetting}
                    />

                    <SettingsShortcutsTab
                        hotkeyScheme={hotkeyScheme}
                        setHotkeyScheme={setHotkeyScheme}
                        keyBindings={keyBindings}
                        updateKeyBinding={updateKeyBinding}
                        resetKeyBinding={resetKeyBinding}
                        resetAllKeyBindings={resetAllKeyBindings}
                    />

                    <SettingsSyncTab
                        hosts={hosts}
                        keys={keys}
                        snippets={snippets}
                        importDataFromString={importDataFromString}
                    />
                </div>
            </Tabs>
        </div>
    );
}

