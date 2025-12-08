import { MouseEvent, useMemo, useState, useCallback } from 'react';
import { Host, TerminalSession, Workspace } from '../../domain/models';
import {
  createWorkspaceFromSessions as createWorkspaceEntity,
  insertPaneIntoWorkspace,
  pruneWorkspaceNode,
  SplitHint,
  updateWorkspaceSplitSizes,
} from '../../domain/workspace';
import { activeTabStore } from './activeTabStore';

export const useSessionState = () => {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // activeTabId is now managed by external store - components subscribe directly
  const setActiveTabId = activeTabStore.setActiveTabId;
  const [draggingSessionId, setDraggingSessionId] = useState<string | null>(null);
  const [workspaceRenameTarget, setWorkspaceRenameTarget] = useState<Workspace | null>(null);
  const [workspaceRenameValue, setWorkspaceRenameValue] = useState('');
  // Tab order: stores ordered list of tab IDs (orphan session IDs and workspace IDs)
  const [tabOrder, setTabOrder] = useState<string[]>([]);

  const createLocalTerminal = useCallback(() => {
    const sessionId = crypto.randomUUID();
    const localHostId = `local-${sessionId}`;
    const newSession: TerminalSession = {
      id: sessionId,
      hostId: localHostId,
      hostLabel: 'Local Terminal',
      hostname: 'localhost',
      username: 'local',
      status: 'connecting',
    };
    setSessions(prev => [...prev, newSession]);
    setActiveTabId(sessionId);
  }, []);

  const connectToHost = useCallback((host: Host) => {
    const newSession: TerminalSession = {
      id: crypto.randomUUID(),
      hostId: host.id,
      hostLabel: host.label,
      hostname: host.hostname,
      username: host.username,
      status: 'connecting',
    };
    setSessions(prev => [...prev, newSession]);
    setActiveTabId(newSession.id);
  }, []);

  const updateSessionStatus = useCallback((sessionId: string, status: TerminalSession['status']) => {
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status } : s));
  }, []);

  const closeSession = useCallback((sessionId: string, e?: MouseEvent) => {
    e?.stopPropagation();
    
    setSessions(prevSessions => {
      const targetSession = prevSessions.find(s => s.id === sessionId);
      const workspaceId = targetSession?.workspaceId;
      
      setWorkspaces(prevWorkspaces => {
        let removedWorkspaceId: string | null = null;
        let nextWorkspaces = prevWorkspaces;
        
        if (workspaceId) {
          nextWorkspaces = prevWorkspaces
            .map(ws => {
              if (ws.id !== workspaceId) return ws;
              const pruned = pruneWorkspaceNode(ws.root, sessionId);
              if (!pruned) {
                removedWorkspaceId = ws.id;
                return null;
              }
              return { ...ws, root: pruned };
            })
            .filter((ws): ws is Workspace => Boolean(ws));
        }
        
        const remainingSessions = prevSessions.filter(s => s.id !== sessionId);
        const fallbackWorkspace = nextWorkspaces[nextWorkspaces.length - 1];
        const fallbackSolo = remainingSessions.filter(s => !s.workspaceId).slice(-1)[0];

        const currentActiveTabId = activeTabStore.getActiveTabId();
        const getFallback = () => {
          if (fallbackWorkspace) return fallbackWorkspace.id;
          if (fallbackSolo) return fallbackSolo.id;
          return 'vault';
        };

        if (currentActiveTabId === sessionId) {
          setActiveTabId(fallbackSolo ? fallbackSolo.id : getFallback());
        } else if (removedWorkspaceId && currentActiveTabId === removedWorkspaceId) {
          setActiveTabId(getFallback());
        } else if (workspaceId && currentActiveTabId === workspaceId && !nextWorkspaces.find(w => w.id === workspaceId)) {
          setActiveTabId(getFallback());
        }
        
        return nextWorkspaces;
      });
      
      return prevSessions.filter(s => s.id !== sessionId);
    });
  }, []);

  const closeWorkspace = useCallback((workspaceId: string) => {
    setWorkspaces(prevWorkspaces => {
      const remainingWorkspaces = prevWorkspaces.filter(w => w.id !== workspaceId);
      
      setSessions(prevSessions => prevSessions.filter(s => s.workspaceId !== workspaceId));
      
      const currentActiveTabId = activeTabStore.getActiveTabId();
      if (currentActiveTabId === workspaceId) {
        if (remainingWorkspaces.length > 0) {
          setActiveTabId(remainingWorkspaces[remainingWorkspaces.length - 1].id);
        } else {
          setActiveTabId('vault');
        }
      }
      
      return remainingWorkspaces;
    });
  }, []);

  const startWorkspaceRename = useCallback((workspaceId: string) => {
    setWorkspaces(prevWorkspaces => {
      const target = prevWorkspaces.find(w => w.id === workspaceId);
      if (target) {
        setWorkspaceRenameTarget(target);
        setWorkspaceRenameValue(target.title);
      }
      return prevWorkspaces;
    });
  }, []);

  const submitWorkspaceRename = useCallback(() => {
    setWorkspaceRenameValue(prevValue => {
      const name = prevValue.trim();
      if (!name) return prevValue;
      
      setWorkspaceRenameTarget(prevTarget => {
        if (!prevTarget) return prevTarget;
        setWorkspaces(prev => prev.map(w => w.id === prevTarget.id ? { ...w, title: name } : w));
        return null;
      });
      
      return '';
    });
  }, []);

  const resetWorkspaceRename = useCallback(() => {
    setWorkspaceRenameTarget(null);
    setWorkspaceRenameValue('');
  }, []);

  const createWorkspaceFromSessions = useCallback((
    baseSessionId: string,
    joiningSessionId: string,
    hint: SplitHint
  ) => {
    if (!hint || baseSessionId === joiningSessionId) return;
    
    setSessions(prevSessions => {
      const base = prevSessions.find(s => s.id === baseSessionId);
      const joining = prevSessions.find(s => s.id === joiningSessionId);
      if (!base || !joining || base.workspaceId || joining.workspaceId) return prevSessions;

      const newWorkspace = createWorkspaceEntity(baseSessionId, joiningSessionId, hint);
      setWorkspaces(prev => [...prev, newWorkspace]);
      setActiveTabId(newWorkspace.id);
      
      return prevSessions.map(s => {
        if (s.id === baseSessionId || s.id === joiningSessionId) {
          return { ...s, workspaceId: newWorkspace.id };
        }
        return s;
      });
    });
  }, []);

  const addSessionToWorkspace = useCallback((
    workspaceId: string,
    sessionId: string,
    hint: SplitHint
  ) => {
    if (!hint) return;
    
    setSessions(prevSessions => {
      const session = prevSessions.find(s => s.id === sessionId);
      if (!session || session.workspaceId) return prevSessions;
      
      setWorkspaces(prevWorkspaces => {
        const targetWorkspace = prevWorkspaces.find(w => w.id === workspaceId);
        if (!targetWorkspace) return prevWorkspaces;
        
        return prevWorkspaces.map(ws => {
          if (ws.id !== workspaceId) return ws;
          return { ...ws, root: insertPaneIntoWorkspace(ws.root, sessionId, hint) };
        });
      });
      
      setActiveTabId(workspaceId);
      return prevSessions.map(s => s.id === sessionId ? { ...s, workspaceId } : s);
    });
  }, []);

  const updateSplitSizes = useCallback((workspaceId: string, splitId: string, sizes: number[]) => {
    setWorkspaces(prev => prev.map(ws => {
      if (ws.id !== workspaceId) return ws;
      return { ...ws, root: updateWorkspaceSplitSizes(ws.root, splitId, sizes) };
    }));
  }, []);

  const orphanSessions = useMemo(() => sessions.filter(s => !s.workspaceId), [sessions]);

  // Get ordered tabs: combines orphan sessions and workspaces in the custom order
  const orderedTabs = useMemo(() => {
    const allTabIds = [
      ...orphanSessions.map(s => s.id),
      ...workspaces.map(w => w.id),
    ];
    // Filter tabOrder to only include existing tabs, then add any new tabs at the end
    const orderedIds = tabOrder.filter(id => allTabIds.includes(id));
    const newIds = allTabIds.filter(id => !orderedIds.includes(id));
    return [...orderedIds, ...newIds];
  }, [orphanSessions, workspaces, tabOrder]);

  const reorderTabs = useCallback((draggedId: string, targetId: string, position: 'before' | 'after' = 'before') => {
    if (draggedId === targetId) return;
    
    setTabOrder(prevTabOrder => {
      // Get all current tab IDs (orphan sessions + workspaces)
      const allTabIds = [
        ...orphanSessions.map(s => s.id),
        ...workspaces.map(w => w.id),
      ];
      
      // Build current effective order: existing order + new tabs at end
      const orderedIds = prevTabOrder.filter(id => allTabIds.includes(id));
      const newIds = allTabIds.filter(id => !orderedIds.includes(id));
      const currentOrder = [...orderedIds, ...newIds];
      
      const draggedIndex = currentOrder.indexOf(draggedId);
      const targetIndex = currentOrder.indexOf(targetId);
      
      if (draggedIndex === -1 || targetIndex === -1) return prevTabOrder;
      
      // Remove dragged item first
      currentOrder.splice(draggedIndex, 1);
      
      // Calculate new target index (adjusted after removal)
      let newTargetIndex = targetIndex;
      if (draggedIndex < targetIndex) {
        newTargetIndex -= 1;
      }
      
      // Insert at the correct position
      if (position === 'after') {
        newTargetIndex += 1;
      }
      
      currentOrder.splice(newTargetIndex, 0, draggedId);
      
      return currentOrder;
    });
  }, [orphanSessions, workspaces]);

  return {
    sessions,
    workspaces,
    // activeTabId removed - components should subscribe via useActiveTabId() from activeTabStore
    setActiveTabId,
    draggingSessionId,
    setDraggingSessionId,
    workspaceRenameTarget,
    workspaceRenameValue,
    setWorkspaceRenameValue,
    startWorkspaceRename,
    submitWorkspaceRename,
    resetWorkspaceRename,
    createLocalTerminal,
    connectToHost,
    closeSession,
    closeWorkspace,
    updateSessionStatus,
    createWorkspaceFromSessions,
    addSessionToWorkspace,
    updateSplitSizes,
    orphanSessions,
    orderedTabs,
    reorderTabs,
  };
};
