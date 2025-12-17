/**
 * Terminal Toolbar
 * Displays SFTP, Scripts, Theme, Search buttons and close button in terminal status bar
 */
import { FolderInput, X, Zap, Palette, Search } from 'lucide-react';
import React, { useState } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { Snippet, Host } from '../../types';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import ThemeCustomizeModal from './ThemeCustomizeModal';

export interface TerminalToolbarProps {
    status: 'connecting' | 'connected' | 'disconnected';
    snippets: Snippet[];
    host?: Host;
    isScriptsOpen: boolean;
    setIsScriptsOpen: (open: boolean) => void;
    onOpenSFTP: () => void;
    onSnippetClick: (command: string) => void;
    onUpdateHost?: (host: Host) => void;
    showClose?: boolean;
    onClose?: () => void;
    // Search functionality
    isSearchOpen?: boolean;
    onToggleSearch?: () => void;
}

export const TerminalToolbar: React.FC<TerminalToolbarProps> = ({
    status,
    snippets,
    host,
    isScriptsOpen,
    setIsScriptsOpen,
    onOpenSFTP,
    onSnippetClick,
    onUpdateHost,
    showClose,
    onClose,
    isSearchOpen,
    onToggleSearch,
}) => {
    const { t } = useI18n();
    const [themeModalOpen, setThemeModalOpen] = useState(false);
    const buttonBase = "h-7 px-2 text-[11px] bg-white/5 hover:bg-white/10 text-white shadow-none border-none";

    const handleThemeChange = (themeId: string) => {
        if (host && onUpdateHost) {
            onUpdateHost({ ...host, theme: themeId });
        }
    };

    const handleFontFamilyChange = (fontFamilyId: string) => {
        if (host && onUpdateHost) {
            onUpdateHost({ ...host, fontFamily: fontFamilyId });
        }
    };

    const handleFontSizeChange = (fontSize: number) => {
        if (host && onUpdateHost) {
            onUpdateHost({ ...host, fontSize });
        }
    };

    return (
        <>
            <Button
                variant="secondary"
                size="sm"
                className={buttonBase}
                disabled={status !== 'connected'}
                title={status === 'connected' ? t("terminal.toolbar.openSftp") : t("terminal.toolbar.availableAfterConnect")}
                onClick={onOpenSFTP}
            >
                <FolderInput size={12} className="mr-2" /> {t("terminal.toolbar.sftp")}
            </Button>

            <Popover open={isScriptsOpen} onOpenChange={setIsScriptsOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="secondary"
                        size="sm"
                        className={buttonBase}
                    >
                        <Zap size={12} className="mr-2" /> {t("terminal.toolbar.scripts")}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="start">
                    <div className="px-3 py-2 text-[10px] uppercase text-muted-foreground font-semibold bg-muted/30 border-b">
                        {t("terminal.toolbar.library")}
                    </div>
                    <ScrollArea className="h-64">
                        <div className="py-1">
                            {snippets.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-muted-foreground italic">
                                    {t("terminal.toolbar.noSnippets")}
                                </div>
                            ) : (
                                snippets.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => onSnippetClick(s.command)}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex flex-col gap-0.5"
                                    >
                                        <span className="font-medium">{s.label}</span>
                                        <span className="text-muted-foreground truncate font-mono text-[10px]">
                                            {s.command}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </ScrollArea>
                </PopoverContent>
            </Popover>

            <Button
                variant="secondary"
                size="sm"
                className={buttonBase}
                title={t("terminal.toolbar.terminalSettings")}
                onClick={() => setThemeModalOpen(true)}
            >
                <Palette size={12} className="mr-2" /> {t("common.settings")}
            </Button>

            <Button
                variant="secondary"
                size="sm"
                className={`${buttonBase} px-1.5 ${isSearchOpen ? 'bg-white/20' : ''}`}
                title={t("terminal.toolbar.searchTerminal")}
                onClick={onToggleSearch}
            >
                <Search size={12} />
            </Button>

            {showClose && onClose && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    title={t("terminal.toolbar.closeSession")}
                >
                    <X size={12} />
                </Button>
            )}

            <ThemeCustomizeModal
                open={themeModalOpen}
                onClose={() => setThemeModalOpen(false)}
                currentThemeId={host?.theme || 'termius-dark'}
                currentFontFamilyId={host?.fontFamily || 'menlo'}
                currentFontSize={host?.fontSize || 14}
                onThemeChange={handleThemeChange}
                onFontFamilyChange={handleFontFamilyChange}
                onFontSizeChange={handleFontSizeChange}
                onSave={() => {
                    // Trigger any necessary updates
                }}
            />
        </>
    );
};

export default TerminalToolbar;
