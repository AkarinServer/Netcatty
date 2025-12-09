import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { TerminalSquare, Shield, Folder, LayoutGrid, Plus, Bell, User, Sun, Moon, X, Minus, Square, Copy } from 'lucide-react';
import { TerminalSession, Workspace } from '../types';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu';
import { useActiveTabId, activeTabStore } from '../application/state/activeTabStore';

interface TopTabsProps {
  theme: 'dark' | 'light';
  sessions: TerminalSession[];
  orphanSessions: TerminalSession[];
  workspaces: Workspace[];
  orderedTabs: string[];
  draggingSessionId: string | null;
  isMacClient: boolean;
  onCloseSession: (sessionId: string, e?: React.MouseEvent) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onOpenQuickSwitcher: () => void;
  onToggleTheme: () => void;
  onStartSessionDrag: (sessionId: string) => void;
  onEndSessionDrag: () => void;
  onReorderTabs: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
}

const sessionStatusDot = (status: TerminalSession['status']) => {
  const tone = status === 'connected'
    ? "bg-emerald-400"
    : status === 'connecting'
      ? "bg-amber-400"
      : "bg-rose-500";
  return <span className={cn("inline-block h-2 w-2 rounded-full shadow-[0_0_0_2px_rgba(0,0,0,0.35)]", tone)} />;
};

// Custom window controls for Windows/Linux (frameless window)
const WindowControls: React.FC = memo(() => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state
    window.nebula?.windowIsMaximized?.().then(setIsMaximized);

    // Listen for window resize to update maximized state
    const handleResize = () => {
      window.nebula?.windowIsMaximized?.().then(setIsMaximized);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMinimize = () => {
    window.nebula?.windowMinimize?.();
  };

  const handleMaximize = async () => {
    const result = await window.nebula?.windowMaximize?.();
    setIsMaximized(result ?? false);
  };

  const handleClose = () => {
    window.nebula?.windowClose?.();
  };

  return (
    <div className="flex items-center app-no-drag">
      <button
        onClick={handleMinimize}
        className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-all duration-150"
        title="Minimize"
      >
        <Minus size={16} />
      </button>
      <button
        onClick={handleMaximize}
        className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-all duration-150"
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? (
          // Restore icon (two overlapping squares)
          <Copy size={14} />
        ) : (
          // Maximize icon (single square)
          <Square size={14} />
        )}
      </button>
      <button
        onClick={handleClose}
        className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-all duration-150"
        title="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
});
WindowControls.displayName = 'WindowControls';

const TopTabsInner: React.FC<TopTabsProps> = ({
  theme,
  sessions,
  orphanSessions,
  workspaces,
  orderedTabs,
  draggingSessionId,
  isMacClient,
  onCloseSession,
  onRenameWorkspace,
  onCloseWorkspace,
  onOpenQuickSwitcher,
  onToggleTheme,
  onStartSessionDrag,
  onEndSessionDrag,
  onReorderTabs,
}) => {
  // Subscribe to activeTabId from external store
  const activeTabId = useActiveTabId();
  const isVaultActive = activeTabId === 'vault';
  const isSftpActive = activeTabId === 'sftp';
  const onSelectTab = activeTabStore.setActiveTabId;

  // Tab reorder drag state
  const [dropIndicator, setDropIndicator] = useState<{ tabId: string; position: 'before' | 'after' } | null>(null);
  const [isDraggingForReorder, setIsDraggingForReorder] = useState(false);
  const draggedTabIdRef = useRef<string | null>(null);

  // Pre-compute lookup maps for O(1) access instead of O(n) find operations
  const orphanSessionMap = useMemo(() => {
    const map = new Map<string, TerminalSession>();
    for (const s of orphanSessions) map.set(s.id, s);
    return map;
  }, [orphanSessions]);

  const workspaceMap = useMemo(() => {
    const map = new Map<string, Workspace>();
    for (const w of workspaces) map.set(w.id, w);
    return map;
  }, [workspaces]);

  // Pre-compute session counts per workspace for O(1) access
  const workspacePaneCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sessions) {
      if (s.workspaceId) {
        counts.set(s.workspaceId, (counts.get(s.workspaceId) || 0) + 1);
      }
    }
    return counts;
  }, [sessions]);

  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('tab-reorder-id', tabId);
    // Also set session-id for backward compatibility with workspace split functionality
    // Only orphan sessions can be dragged to create workspaces
    const isOrphanSession = orphanSessionMap.has(tabId);
    if (isOrphanSession) {
      e.dataTransfer.setData('session-id', tabId);
    }
    draggedTabIdRef.current = tabId;
    // Use setTimeout to allow the drag image to be captured before we change styles
    setTimeout(() => {
      setIsDraggingForReorder(true);
    }, 0);
    onStartSessionDrag(tabId);
  }, [orphanSessionMap, onStartSessionDrag]);

  const handleTabDragEnd = useCallback(() => {
    draggedTabIdRef.current = null;
    setDropIndicator(null);
    setIsDraggingForReorder(false);
    onEndSessionDrag();
  }, [onEndSessionDrag]);

  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedTabIdRef.current || draggedTabIdRef.current === tabId) {
      return;
    }

    // Determine if we're on the left or right half of the target tab
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const position: 'before' | 'after' = e.clientX < midpoint ? 'before' : 'after';

    setDropIndicator({ tabId, position });
  }, []);

  const handleTabDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if we're leaving the tab entirely (not moving to a child element)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropIndicator(null);
    }
  }, []);

  const handleTabDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('tab-reorder-id') || draggedTabIdRef.current;

    if (draggedId && draggedId !== targetTabId && dropIndicator) {
      onReorderTabs(draggedId, targetTabId, dropIndicator.position);
    }

    setDropIndicator(null);
    setIsDraggingForReorder(false);
  }, [dropIndicator, onReorderTabs]);

  // Pre-compute tab shift styles for all tabs to avoid recalculation during render
  const tabShiftStyles = useMemo(() => {
    if (!dropIndicator || !isDraggingForReorder || !draggedTabIdRef.current) {
      return {};
    }
    const styles: Record<string, React.CSSProperties> = {};
    const draggedIndex = orderedTabs.indexOf(draggedTabIdRef.current);
    const targetIndex = orderedTabs.indexOf(dropIndicator.tabId);
    const dropIndex = dropIndicator.position === 'before' ? targetIndex : targetIndex + 1;

    for (let i = 0; i < orderedTabs.length; i++) {
      const tabId = orderedTabs[i];
      if (tabId === draggedTabIdRef.current) continue;

      if (draggedIndex < dropIndex) {
        if (i > draggedIndex && i < dropIndex) {
          styles[tabId] = { transform: 'translateX(-8px)' };
        }
      } else {
        if (i >= dropIndex && i < draggedIndex) {
          styles[tabId] = { transform: 'translateX(8px)' };
        }
      }
    }
    return styles;
  }, [dropIndicator, isDraggingForReorder, orderedTabs]);

  // Build ordered tab items using pre-computed maps for O(1) lookups
  const orderedTabItems = useMemo(() => {
    return orderedTabs.map((tabId) => {
      const session = orphanSessionMap.get(tabId);
      const workspace = workspaceMap.get(tabId);
      if (session) {
        return { type: 'session' as const, id: tabId, session };
      }
      if (workspace) {
        return { type: 'workspace' as const, id: tabId, workspace, paneCount: workspacePaneCounts.get(tabId) || 0 };
      }
      return null;
    }).filter(Boolean);
  }, [orderedTabs, orphanSessionMap, workspaceMap, workspacePaneCounts]);

  // Render the tabs
  const renderOrderedTabs = () => {
    return orderedTabItems.map((item) => {
      if (!item) return null;

      if (item.type === 'session') {
        const session = item.session;
        const isBeingDragged = draggingSessionId === session.id;
        const shiftStyle = tabShiftStyles[session.id] || {};
        const showDropIndicatorBefore = dropIndicator?.tabId === session.id && dropIndicator.position === 'before';
        const showDropIndicatorAfter = dropIndicator?.tabId === session.id && dropIndicator.position === 'after';

        return (
          <div
            key={session.id}
            onClick={() => onSelectTab(session.id)}
            draggable
            onDragStart={(e) => handleTabDragStart(e, session.id)}
            onDragEnd={handleTabDragEnd}
            onDragOver={(e) => handleTabDragOver(e, session.id)}
            onDragLeave={handleTabDragLeave}
            onDrop={(e) => handleTabDrop(e, session.id)}
            className={cn(
              "relative h-8 pl-3 pr-2 min-w-[140px] max-w-[240px] rounded-md border text-xs font-semibold cursor-pointer flex items-center justify-between gap-2 app-no-drag",
              "transition-all duration-200 ease-out",
              activeTabId === session.id ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              isBeingDragged && isDraggingForReorder ? "opacity-40 scale-95" : ""
            )}
            style={shiftStyle}
          >
            {/* Drop indicator line - before */}
            {showDropIndicatorBefore && isDraggingForReorder && (
              <div className="absolute -left-1.5 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
            )}
            {/* Drop indicator line - after */}
            {showDropIndicatorAfter && isDraggingForReorder && (
              <div className="absolute -right-1.5 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
            )}
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
        );
      }

      if (item.type === 'workspace') {
        const workspace = item.workspace;
        const paneCount = item.paneCount;
        const isActive = activeTabId === workspace.id;
        const isBeingDragged = draggingSessionId === workspace.id;
        const shiftStyle = tabShiftStyles[workspace.id] || {};
        const showDropIndicatorBefore = dropIndicator?.tabId === workspace.id && dropIndicator.position === 'before';
        const showDropIndicatorAfter = dropIndicator?.tabId === workspace.id && dropIndicator.position === 'after';

        return (
          <ContextMenu key={workspace.id}>
            <ContextMenuTrigger asChild>
              <div
                onClick={() => onSelectTab(workspace.id)}
                draggable
                onDragStart={(e) => handleTabDragStart(e, workspace.id)}
                onDragEnd={handleTabDragEnd}
                onDragOver={(e) => handleTabDragOver(e, workspace.id)}
                onDragLeave={handleTabDragLeave}
                onDrop={(e) => handleTabDrop(e, workspace.id)}
                className={cn(
                  "relative h-8 pl-3 pr-2 min-w-[150px] max-w-[260px] rounded-md border text-xs font-semibold cursor-pointer flex items-center justify-between gap-2 app-no-drag",
                  "transition-all duration-200 ease-out",
                  isActive ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  isBeingDragged && isDraggingForReorder ? "opacity-40 scale-95" : ""
                )}
                style={shiftStyle}
              >
                {/* Drop indicator line - before */}
                {showDropIndicatorBefore && isDraggingForReorder && (
                  <div className="absolute -left-1.5 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
                )}
                {/* Drop indicator line - after */}
                {showDropIndicatorAfter && isDraggingForReorder && (
                  <div className="absolute -right-1.5 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
                )}
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
      }

      return null;
    });
  };

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
        {renderOrderedTabs()}
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
        {/* Custom window controls for Windows/Linux */}
        {!isMacClient && <WindowControls />}
      </div>
    </div>
  );
};

// Custom comparison: only re-render when data props change - activeTabId is now managed internally via store subscription
const topTabsAreEqual = (prev: TopTabsProps, next: TopTabsProps): boolean => {
  return (
    prev.theme === next.theme &&
    prev.sessions === next.sessions &&
    prev.orphanSessions === next.orphanSessions &&
    prev.workspaces === next.workspaces &&
    prev.orderedTabs === next.orderedTabs &&
    prev.draggingSessionId === next.draggingSessionId &&
    prev.isMacClient === next.isMacClient
  );
};

export const TopTabs = memo(TopTabsInner, topTabsAreEqual);
TopTabs.displayName = 'TopTabs';