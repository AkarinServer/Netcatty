/**
 * Terminal Context Menu
 * Right-click menu for terminal with split, copy/paste, and other actions
 */
import {
  ClipboardPaste,
  Copy,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Terminal as TerminalIcon,
  Trash2,
} from 'lucide-react';
import React, { useCallback } from 'react';
import { useI18n } from '../../application/i18n/I18nProvider';
import { RightClickBehavior } from '../../domain/models';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '../ui/context-menu';

export interface TerminalContextMenuProps {
  children: React.ReactNode;
  hasSelection?: boolean;
  hotkeyScheme?: 'disabled' | 'mac' | 'pc';
  rightClickBehavior?: RightClickBehavior;
  onCopy?: () => void;
  onPaste?: () => void;
  onSelectAll?: () => void;
  onClear?: () => void;
  onSplitHorizontal?: () => void;
  onSplitVertical?: () => void;
  onClose?: () => void;
  onSelectWord?: () => void;
}

export const TerminalContextMenu: React.FC<TerminalContextMenuProps> = ({
  children,
  hasSelection = false,
  hotkeyScheme = 'mac',
  rightClickBehavior = 'context-menu',
  onCopy,
  onPaste,
  onSelectAll,
  onClear,
  onSplitHorizontal,
  onSplitVertical,
  onClose,
  onSelectWord,
}) => {
  const { t } = useI18n();
  const isMac = hotkeyScheme === 'mac';

  const copyShortcut = isMac ? '⌘C' : 'Ctrl+Shift+C';
  const pasteShortcut = isMac ? '⌘V' : 'Ctrl+Shift+V';
  const selectAllShortcut = isMac ? '⌘A' : 'Ctrl+Shift+A';
  const splitHShortcut = isMac ? '⌘D' : 'Ctrl+Shift+D';
  const splitVShortcut = isMac ? '⌘E' : 'Ctrl+Shift+E';
  const clearShortcut = isMac ? '⌘K' : 'Ctrl+L';

  const showContextMenu = rightClickBehavior === 'context-menu';

  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      if (rightClickBehavior === 'paste') {
        e.preventDefault();
        e.stopPropagation();
        onPaste?.();
      } else if (rightClickBehavior === 'select-word') {
        e.preventDefault();
        e.stopPropagation();
        onSelectWord?.();
      }
    },
    [rightClickBehavior, onPaste, onSelectWord],
  );

  // Always use ContextMenu wrapper to maintain consistent React tree structure
  // This prevents terminal from unmounting when rightClickBehavior changes
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        disabled={!showContextMenu}
        onContextMenu={!showContextMenu ? handleRightClick : undefined}
      >
        {children}
      </ContextMenuTrigger>
      {showContextMenu && (
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={onCopy} disabled={!hasSelection}>
            <Copy size={14} className="mr-2" />
            {t('terminal.menu.copy')}
            <ContextMenuShortcut>{copyShortcut}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={onPaste}>
            <ClipboardPaste size={14} className="mr-2" />
            {t('terminal.menu.paste')}
            <ContextMenuShortcut>{pasteShortcut}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={onSelectAll}>
            <TerminalIcon size={14} className="mr-2" />
            {t('terminal.menu.selectAll')}
            <ContextMenuShortcut>{selectAllShortcut}</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={onSplitVertical}>
            <SplitSquareHorizontal size={14} className="mr-2" />
            {t('terminal.menu.splitHorizontal')}
            <ContextMenuShortcut>{splitVShortcut}</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onClick={onSplitHorizontal}>
            <SplitSquareVertical size={14} className="mr-2" />
            {t('terminal.menu.splitVertical')}
            <ContextMenuShortcut>{splitHShortcut}</ContextMenuShortcut>
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onClick={onClear}>
            <Trash2 size={14} className="mr-2" />
            {t('terminal.menu.clearBuffer')}
            <ContextMenuShortcut>{clearShortcut}</ContextMenuShortcut>
          </ContextMenuItem>

          {onClose && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={onClose}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 size={14} className="mr-2" />
                {t('terminal.menu.closeTerminal')}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
};

export default TerminalContextMenu;
