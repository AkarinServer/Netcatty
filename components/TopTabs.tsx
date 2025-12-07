import React from 'react';
import { TerminalSquare, Shield, Folder, LayoutGrid, Plus, Bell, User, Sun, Moon, X } from 'lucide-react';
import { TerminalSession, Workspace } from '../types';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu';

interface TopTabsProps {
  theme: 'dark' | 'light';
  isVaultActive: boolean;
  isSftpActive: boolean;
  activeTabId: string;
  sessions: TerminalSession[];
  orphanSessions: TerminalSession[];
  workspaces: Workspace[];
  draggingSessionId: string | null;
  isMacClient: boolean;
  onSelectTab: (id: string) => void;
  onCloseSession: (sessionId: string, e?: React.MouseEvent) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onOpenQuickSwitcher: () => void;
  onToggleTheme: () => void;
  onStartSessionDrag: (sessionId: string) => void;
  onEndSessionDrag: () => void;
}

const sessionStatusDot = (status: TerminalSession['status']) => {
  const tone = status === 'connected'
    ? "bg-emerald-400"
    : status === 'connecting'
      ? "bg-amber-400"
      : "bg-rose-500";
  return <span className={cn("inline-block h-2 w-2 rounded-full shadow-[0_0_0_2px_rgba(0,0,0,0.35)]", tone)} />;
};

export const TopTabs: React.FC<TopTabsProps> = ({
  theme,
  isVaultActive,
  isSftpActive,
  activeTabId,
  sessions,
  orphanSessions,
  workspaces,
  draggingSessionId,
  isMacClient,
  onSelectTab,
  onCloseSession,
  onRenameWorkspace,
  onCloseWorkspace,
  onOpenQuickSwitcher,
  onToggleTheme,
  onStartSessionDrag,
  onEndSessionDrag,
}) => {
  return (
    <div className="w-full bg-secondary/90 border-b border-border/60 backdrop-blur app-drag">
      <div
        className="h-10 px-3 flex items-center gap-2"
        style={{ paddingLeft: isMacClient ? 76 : 12 }}
      >
        <div
          onClick={() => onSelectTab('vault')}
          className={cn(
            "h-8 px-3 rounded-md border text-xs font-semibold cursor-pointer flex items-center gap-2 app-no-drag",
            isVaultActive ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
          )}
        >
          <Shield size={14} /> Vaults
        </div>
        <div
          onClick={() => onSelectTab('sftp')}
          className={cn(
            "h-8 px-3 rounded-md border text-xs font-semibold cursor-pointer flex items-center gap-2 app-no-drag",
            isSftpActive ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
          )}
        >
          <Folder size={14} /> SFTP
        </div>
        {orphanSessions.map(session => (
          <div
            key={session.id}
            onClick={() => onSelectTab(session.id)}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('session-id', session.id);
              onStartSessionDrag(session.id);
            }}
            onDragEnd={() => onEndSessionDrag()}
            className={cn(
              "h-8 pl-3 pr-2 min-w-[140px] max-w-[240px] rounded-md border text-xs font-semibold cursor-pointer flex items-center justify-between gap-2 app-no-drag",
              activeTabId === session.id ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              draggingSessionId === session.id ? "opacity-70" : ""
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TerminalSquare size={14} className={cn("shrink-0", activeTabId === session.id ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate">{session.hostLabel}</span>
              <div className="flex-shrink-0">{sessionStatusDot(session.status)}</div>
            </div>
            <button
              onClick={(e) => onCloseSession(session.id, e)}
              className="p-1 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label="Close session"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {workspaces.map(workspace => {
          const paneCount = sessions.filter(s => s.workspaceId === workspace.id).length;
          const isActive = activeTabId === workspace.id;
          return (
            <ContextMenu key={workspace.id}>
              <ContextMenuTrigger asChild>
                <div
                  onClick={() => onSelectTab(workspace.id)}
                  className={cn(
                    "h-8 pl-3 pr-2 min-w-[150px] max-w-[260px] rounded-md border text-xs font-semibold cursor-pointer flex items-center justify-between gap-2 app-no-drag",
                    isActive ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    <LayoutGrid size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className="truncate">{workspace.title}</span>
                  </div>
                  <div className="text-[10px] px-2 py-1 rounded-full border border-border/70 bg-background/60 min-w-[28px] text-center">
                    {paneCount}
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => onRenameWorkspace(workspace.id)}>
                  Rename
                </ContextMenuItem>
                <ContextMenuItem className="text-destructive" onClick={() => onCloseWorkspace(workspace.id)}>
                  Close
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 app-no-drag"
          onClick={onOpenQuickSwitcher}
          title="Open quick switcher"
        >
          <Plus size={14} />
        </Button>
        <div className="ml-auto flex items-center gap-2 app-no-drag">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Bell size={16} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <User size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onToggleTheme}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
};
