import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileConflict,
  Host,
  Identity,
  SftpConnection,
  SftpFileEntry,
  SSHKey,
  TransferDirection,
  TransferStatus,
  TransferTask,
} from "../../domain/models";
import { logger } from "../../lib/logger";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge";
import { resolveHostAuth } from "../../domain/sshAuth";

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "--";
  const units = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

const formatDate = (timestamp: number): string => {
  if (!timestamp) return "--";
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getFileExtension = (name: string): string => {
  if (name === "..") return "folder";
  const ext = name.split(".").pop()?.toLowerCase();
  return ext || "file";
};

// Check if an entry is navigable like a directory (directories or symlinks pointing to directories)
const isNavigableDirectory = (entry: SftpFileEntry): boolean => {
  return entry.type === "directory" || (entry.type === "symlink" && entry.linkTarget === "directory");
};

// Check if path is Windows-style
const isWindowsPath = (path: string): boolean => /^[A-Za-z]:/.test(path);

const normalizeWindowsRoot = (path: string): string => {
  const normalized = path.replace(/\//g, "\\");
  if (/^[A-Za-z]:\\$/.test(normalized)) return normalized;
  if (/^[A-Za-z]:$/.test(normalized)) return `${normalized}\\`;
  return normalized;
};

const isWindowsRoot = (path: string): boolean => {
  if (!isWindowsPath(path)) return false;
  return /^[A-Za-z]:\\?$/.test(path.replace(/\//g, "\\"));
};

const joinPath = (base: string, name: string): string => {
  if (isWindowsPath(base)) {
    // Windows path
    const normalizedBase = normalizeWindowsRoot(base).replace(/[\\/]+$/, "");
    return `${normalizedBase}\\${name}`;
  }
  // Unix path
  if (base === "/") return `/${name}`;
  return `${base}/${name}`;
};

const getParentPath = (path: string): string => {
  console.log("[SFTP getParentPath] input", { path, isWindows: isWindowsPath(path) });
  
  if (isWindowsPath(path)) {
    const normalized = normalizeWindowsRoot(path).replace(/[\\]+$/, "");
    const drive = normalized.slice(0, 2);
    if (/^[A-Za-z]:$/.test(normalized) || /^[A-Za-z]:\\$/.test(normalized)) {
      console.log("[SFTP getParentPath] Windows root, returning", { result: `${drive}\\` });
      return `${drive}\\`;
    }
    const rest = normalized.slice(2).replace(/^[\\]+/, "");
    const parts = rest ? rest.split(/[\\]+/).filter(Boolean) : [];
    if (parts.length <= 1) {
      console.log("[SFTP getParentPath] Windows near root, returning", { result: `${drive}\\` });
      return `${drive}\\`;
    }
    parts.pop();
    const result = `${drive}\\${parts.join("\\")}`;
    console.log("[SFTP getParentPath] Windows result", { result });
    return result;
  }
  // Unix path
  if (path === "/") {
    console.log("[SFTP getParentPath] Unix root, returning /");
    return "/";
  }
  const parts = path.split("/").filter(Boolean);
  console.log("[SFTP getParentPath] Unix parts before pop", { parts: [...parts] });
  parts.pop();
  const result = parts.length ? `/${parts.join("/")}` : "/";
  console.log("[SFTP getParentPath] Unix result", { result, partsAfterPop: parts });
  return result;
};

const getFileName = (path: string): string => {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || "";
};

export interface SftpPane {
  id: string;
  connection: SftpConnection | null;
  files: SftpFileEntry[];
  loading: boolean;
  reconnecting: boolean;
  error: string | null;
  selectedFiles: Set<string>;
  filter: string;
}

// Multi-tab state for left and right sides
export interface SftpSideTabs {
  tabs: SftpPane[];
  activeTabId: string | null;
}

// Constants for empty placeholder pane IDs
const EMPTY_LEFT_PANE_ID = "__empty_left__";
const EMPTY_RIGHT_PANE_ID = "__empty_right__";

const createEmptyPane = (id?: string): SftpPane => ({
  id: id || crypto.randomUUID(),
  connection: null,
  files: [],
  loading: false,
  reconnecting: false,
  error: null,
  selectedFiles: new Set(),
  filter: "",
});

// File watch event types
export interface FileWatchSyncedEvent {
  watchId: string;
  localPath: string;
  remotePath: string;
  bytesWritten: number;
}

export interface FileWatchErrorEvent {
  watchId: string;
  localPath: string;
  remotePath: string;
  error: string;
}

export interface SftpStateOptions {
  onFileWatchSynced?: (event: FileWatchSyncedEvent) => void;
  onFileWatchError?: (event: FileWatchErrorEvent) => void;
}

export const useSftpState = (
  hosts: Host[],
  keys: SSHKey[],
  identities: Identity[],
  options?: SftpStateOptions
) => {
  // Multi-tab state: left and right sides each have multiple tabs
  const [leftTabs, setLeftTabs] = useState<SftpSideTabs>({
    tabs: [],
    activeTabId: null,
  });

  const [rightTabs, setRightTabs] = useState<SftpSideTabs>({
    tabs: [],
    activeTabId: null,
  });

  // Use refs to access latest state without causing callback dependency changes
  const leftTabsRef = useRef(leftTabs);
  const rightTabsRef = useRef(rightTabs);
  leftTabsRef.current = leftTabs;
  rightTabsRef.current = rightTabs;

  // Helper to get active pane for a side - uses ref to avoid dependency on state
  const getActivePane = useCallback((side: "left" | "right"): SftpPane | null => {
    const sideTabs = side === "left" ? leftTabsRef.current : rightTabsRef.current;
    if (!sideTabs.activeTabId) return null;
    return sideTabs.tabs.find((t) => t.id === sideTabs.activeTabId) || null;
  }, []); // Empty deps - uses refs for latest state

  // For backward compatibility - return active pane or a default empty pane-like object
  // These need to update when tabs change, so they depend on actual state
  const leftPane = useMemo(() => {
    const pane = leftTabs.activeTabId 
      ? leftTabs.tabs.find((t) => t.id === leftTabs.activeTabId) 
      : null;
    return pane || createEmptyPane(EMPTY_LEFT_PANE_ID);
  }, [leftTabs]);
  
  const rightPane = useMemo(() => {
    const pane = rightTabs.activeTabId 
      ? rightTabs.tabs.find((t) => t.id === rightTabs.activeTabId) 
      : null;
    return pane || createEmptyPane(EMPTY_RIGHT_PANE_ID);
  }, [rightTabs]);

  // Helper to update a specific tab in a side
  const updateTab = useCallback(
    (side: "left" | "right", tabId: string, updater: (pane: SftpPane) => SftpPane) => {
      const setTabs = side === "left" ? setLeftTabs : setRightTabs;
      setTabs((prev) => ({
        ...prev,
        tabs: prev.tabs.map((t) => (t.id === tabId ? updater(t) : t)),
      }));
    },
    [],
  );

  // Helper to update active tab on a side - uses ref to avoid dependency on state
  const updateActiveTab = useCallback(
    (side: "left" | "right", updater: (pane: SftpPane) => SftpPane) => {
      const sideTabs = side === "left" ? leftTabsRef.current : rightTabsRef.current;
      if (!sideTabs.activeTabId) return;
      updateTab(side, sideTabs.activeTabId, updater);
    },
    [updateTab],
  );

  // Tab management functions
  const addTab = useCallback(
    (side: "left" | "right") => {
      const newPane = createEmptyPane();
      const setTabs = side === "left" ? setLeftTabs : setRightTabs;
      setTabs((prev) => ({
        tabs: [...prev.tabs, newPane],
        activeTabId: newPane.id,
      }));
      return newPane.id;
    },
    [],
  );

  const closeTab = useCallback(
    (side: "left" | "right", tabId: string) => {
      const setTabs = side === "left" ? setLeftTabs : setRightTabs;
      // Use functional update to access current state
      setTabs((prev) => {
        // Find the tab to close
        const tabIndex = prev.tabs.findIndex((t) => t.id === tabId);
        if (tabIndex === -1) return prev;

        // Determine new active tab after closing
        let newActiveTabId: string | null = null;
        if (prev.tabs.length > 1) {
          if (prev.activeTabId === tabId) {
            // Select next tab, or previous if closing last
            const nextIndex = tabIndex < prev.tabs.length - 1 ? tabIndex + 1 : tabIndex - 1;
            newActiveTabId = prev.tabs[nextIndex]?.id || null;
          } else {
            newActiveTabId = prev.activeTabId;
          }
        }

        return {
          tabs: prev.tabs.filter((t) => t.id !== tabId),
          activeTabId: newActiveTabId,
        };
      });
    },
    [],
  );

  const selectTab = useCallback(
    (side: "left" | "right", tabId: string) => {
      const setTabs = side === "left" ? setLeftTabs : setRightTabs;
      setTabs((prev) => ({
        ...prev,
        activeTabId: tabId,
      }));
    },
    [],
  );

  const reorderTabs = useCallback(
    (
      side: "left" | "right",
      draggedId: string,
      targetId: string,
      position: "before" | "after",
    ) => {
      const setTabs = side === "left" ? setLeftTabs : setRightTabs;
      setTabs((prev) => {
        const tabs = [...prev.tabs];
        const draggedIndex = tabs.findIndex((t) => t.id === draggedId);
        const targetIndex = tabs.findIndex((t) => t.id === targetId);
        
        if (draggedIndex === -1 || targetIndex === -1) return prev;
        
        // Remove the dragged tab from its original position
        const [draggedTab] = tabs.splice(draggedIndex, 1);
        // Calculate insert position based on whether we're dropping before or after target
        const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
        // When dragging forward (to a higher index), we need to subtract 1 because
        // removing the dragged tab shifts all subsequent indices down by 1
        const adjustedIndex = draggedIndex < targetIndex ? insertIndex - 1 : insertIndex;
        tabs.splice(adjustedIndex, 0, draggedTab);
        
        return { ...prev, tabs };
      });
    },
    [],
  );

  // Move a tab from one side to the other
  const moveTabToOtherSide = useCallback(
    (fromSide: "left" | "right", tabId: string) => {
      const sourceTabs = fromSide === "left" ? leftTabsRef.current : rightTabsRef.current;
      const setSourceTabs = fromSide === "left" ? setLeftTabs : setRightTabs;
      const setTargetTabs = fromSide === "left" ? setRightTabs : setLeftTabs;

      // Find the tab to move
      const tabToMove = sourceTabs.tabs.find((t) => t.id === tabId);
      if (!tabToMove) return;

      logger.info("[SFTP] Moving tab to other side", {
        fromSide,
        toSide: fromSide === "left" ? "right" : "left",
        tabId,
        hostLabel: tabToMove.connection?.hostLabel,
      });

      // Remove from source
      setSourceTabs((prev) => {
        const newTabs = prev.tabs.filter((t) => t.id !== tabId);
        let newActiveTabId: string | null = null;
        if (newTabs.length > 0) {
          if (prev.activeTabId === tabId) {
            // Select the first remaining tab
            newActiveTabId = newTabs[0].id;
          } else {
            newActiveTabId = prev.activeTabId;
          }
        }
        return { tabs: newTabs, activeTabId: newActiveTabId };
      });

      // Add to target and make it active
      setTargetTabs((prev) => ({
        tabs: [...prev.tabs, tabToMove],
        activeTabId: tabToMove.id,
      }));
    },
    [],
  );

  // Default label for tabs without a connection
  const DEFAULT_TAB_LABEL = "New Tab";

  // Get tab info for tab bar display - uses ref to avoid dependency
  const getTabsInfo = useCallback(
    (side: "left" | "right") => {
      const sideTabs = side === "left" ? leftTabsRef.current : rightTabsRef.current;
      return sideTabs.tabs.map((pane) => ({
        id: pane.id,
        label: pane.connection?.hostLabel || DEFAULT_TAB_LABEL,
        isLocal: pane.connection?.isLocal || false,
        hostId: pane.connection?.hostId || null,
      }));
    },
    [],
  );

  // getActiveTabId needs to trigger re-render when tab changes, so it depends on state
  const getActiveTabId = useCallback(
    (side: "left" | "right") => {
      const sideTabs = side === "left" ? leftTabsRef.current : rightTabsRef.current;
      return sideTabs.activeTabId;
    },
    [],
  );

  // Transfer management
  const [transfers, setTransfers] = useState<TransferTask[]>([]);
  const [conflicts, setConflicts] = useState<FileConflict[]>([]);

  // SFTP session refs
  const sftpSessionsRef = useRef<Map<string, string>>(new Map()); // connectionId -> sftpId

  // Directory listing cache (connectionId + path)
  const DIR_CACHE_TTL_MS = 10_000;
  const dirCacheRef = useRef<
    Map<string, { files: SftpFileEntry[]; timestamp: number }>
  >(new Map());

  // Navigation sequence per pane, used to ignore stale async results
  const navSeqRef = useRef<{ left: number; right: number }>({
    left: 0,
    right: 0,
  });

  const makeCacheKey = useCallback(
    (connectionId: string, path: string) => `${connectionId}::${path}`,
    [],
  );

  const clearCacheForConnection = useCallback((connectionId: string) => {
    for (const key of dirCacheRef.current.keys()) {
      if (key.startsWith(`${connectionId}::`)) {
        dirCacheRef.current.delete(key);
      }
    }
  }, []);

  // Progress simulation refs
  const progressIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Simulate progress for a transfer (used when real progress callbacks aren't available)
  const startProgressSimulation = useCallback(
    (taskId: string, estimatedBytes: number) => {
      // Clear any existing interval for this task
      const existing = progressIntervalsRef.current.get(taskId);
      if (existing) clearInterval(existing);

      // Estimate transfer speed based on file size (simulate realistic speeds)
      // Smaller files: faster perceived progress, larger files: slower but steady
      const baseSpeed = Math.max(50000, Math.min(500000, estimatedBytes / 10)); // 50KB/s to 500KB/s base
      const variability = 0.3; // 30% speed variation

      let transferred = 0;
      const interval = setInterval(() => {
        // Add some randomness to simulate real network conditions
        const speedFactor = 1 + (Math.random() - 0.5) * variability;
        const chunkSize = Math.floor(baseSpeed * speedFactor * 0.1); // Update every 100ms
        transferred = Math.min(transferred + chunkSize, estimatedBytes);

        setTransfers((prev) =>
          prev.map((t) => {
            if (t.id !== taskId || t.status !== "transferring") return t;
            return {
              ...t,
              transferredBytes: transferred,
              totalBytes: estimatedBytes,
              speed: chunkSize * 10, // Convert to per-second
            };
          }),
        );

        // If we've reached the estimated size, slow down to show we're finishing
        if (transferred >= estimatedBytes * 0.95) {
          clearInterval(interval);
          progressIntervalsRef.current.delete(taskId);
        }
      }, 100);

      progressIntervalsRef.current.set(taskId, interval);
    },
    [],
  );

  const stopProgressSimulation = useCallback((taskId: string) => {
    const interval = progressIntervalsRef.current.get(taskId);
    if (interval) {
      clearInterval(interval);
      progressIntervalsRef.current.delete(taskId);
    }
  }, []);

  // Check if an error indicates a stale/lost SFTP session
  const isSessionError = (err: unknown): boolean => {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("session not found") ||
      msg.includes("sftp session") ||
      msg.includes("not found") ||
      msg.includes("closed") ||
      msg.includes("connection reset")
    );
  };

  // Ref to track pending reconnections to avoid multiple reconnect attempts
  const reconnectingRef = useRef<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  // Store last connected host info for reconnection
  const lastConnectedHostRef = useRef<{
    left: Host | "local" | null;
    right: Host | "local" | null;
  }>({
    left: null,
    right: null,
  });

  // Handle session error - will trigger auto-reconnect if host info is available
  const handleSessionError = useCallback(
    (side: "left" | "right", _error: Error) => {
      const pane = getActivePane(side);
      const sideTabs = side === "left" ? leftTabsRef.current : rightTabsRef.current;

      if (!pane || !sideTabs.activeTabId) return;

      if (pane.connection) {
        // Clean up stale session reference
        sftpSessionsRef.current.delete(pane.connection.id);
        clearCacheForConnection(pane.connection.id);
      }

      // Invalidate pending navigation/results for this side
      navSeqRef.current[side] += 1;

      // Check if we have host info to attempt reconnection
      const lastHost = lastConnectedHostRef.current[side];
      if (lastHost && pane.files.length > 0 && !reconnectingRef.current[side]) {
        // We have files displayed, try to auto-reconnect
        reconnectingRef.current[side] = true;
        updateActiveTab(side, (prev) => ({
          ...prev,
          reconnecting: true,
          error: "Connection lost. Reconnecting...",
        }));
      } else {
        // No host info or empty files, just clear the connection
        updateActiveTab(side, (prev) => ({
          ...prev,
          connection: null,
          files: [],
          loading: false,
          reconnecting: false,
          error: "SFTP session lost. Please reconnect.",
          selectedFiles: new Set(),
          filter: "",
        }));
      }
    },
    [getActivePane, clearCacheForConnection, updateActiveTab],
  );

  // Cleanup on unmount
  useEffect(() => {
    // Capture refs at effect creation time to use in cleanup
    const sessionsRef = sftpSessionsRef.current;
    const intervalsRef = progressIntervalsRef.current;

    return () => {
	      // Clear all SFTP sessions
	      sessionsRef.forEach(async (sftpId) => {
	        try {
	          await netcattyBridge.get()?.closeSftp(sftpId);
	        } catch {
	          // Ignore errors when closing SFTP sessions during cleanup
	        }
	      });
      // Clear all progress simulation intervals
      intervalsRef.forEach((interval) => {
        clearInterval(interval);
      });
      intervalsRef.clear();
    };
  }, []);

  // Listen for file watch events (auto-sync feature)
  useEffect(() => {
    const bridge = netcattyBridge.get();
    if (!bridge?.onFileWatchSynced || !bridge?.onFileWatchError) return;
    
    const unsubscribeSynced = bridge.onFileWatchSynced((payload: FileWatchSyncedEvent) => {
      options?.onFileWatchSynced?.(payload);
    });
    
    const unsubscribeError = bridge.onFileWatchError((payload: FileWatchErrorEvent) => {
      options?.onFileWatchError?.(payload);
    });
    
    return () => {
      try {
        unsubscribeSynced?.();
        unsubscribeError?.();
      } catch {
        // ignore cleanup errors
      }
    };
  }, [options]);

  // Track if initial auto-connect has been done
  const initialConnectDoneRef = useRef(false);

  // Get host credentials
  const getHostCredentials = useCallback(
    (host: Host): NetcattySSHOptions => {
      const resolved = resolveHostAuth({ host, keys, identities });
      const key = resolved.key || null;
      
      // Build proxy config if present
      const proxyConfig = host.proxyConfig
        ? {
            type: host.proxyConfig.type,
            host: host.proxyConfig.host,
            port: host.proxyConfig.port,
            username: host.proxyConfig.username,
            password: host.proxyConfig.password,
          }
        : undefined;
      
      // Build jump hosts array if host chain is configured
      let jumpHosts: NetcattyJumpHost[] | undefined;
      if (host.hostChain?.hostIds && host.hostChain.hostIds.length > 0) {
        jumpHosts = host.hostChain.hostIds
          .map((hostId) => hosts.find((h) => h.id === hostId))
          .filter((h): h is Host => !!h)
          .map((jumpHost) => {
            const jumpAuth = resolveHostAuth({
              host: jumpHost,
              keys,
              identities,
            });
            const jumpKey = jumpAuth.key;
            return {
              hostname: jumpHost.hostname,
              port: jumpHost.port || 22,
              username: jumpAuth.username || "root",
              password: jumpAuth.password,
              privateKey: jumpKey?.privateKey,
              certificate: jumpKey?.certificate,
              passphrase: jumpAuth.passphrase || jumpKey?.passphrase,
              publicKey: jumpKey?.publicKey,
              keyId: jumpAuth.keyId,
              keySource: jumpKey?.source,
              label: jumpHost.label,
            };
          });
      }
      
      return {
        hostname: host.hostname,
        username: resolved.username,
        port: host.port || 22,
        password: resolved.password,
        privateKey: key?.privateKey,
        certificate: key?.certificate,
        publicKey: key?.publicKey,
        keyId: resolved.keyId,
        keySource: key?.source,
        proxy: proxyConfig,
        jumpHosts: jumpHosts && jumpHosts.length > 0 ? jumpHosts : undefined,
      };
    },
    [hosts, identities, keys],
  );

  const getMockLocalFiles = useCallback((path: string): SftpFileEntry[] => {
    return buildMockLocalFiles(path);
  }, []);

  const listLocalFiles = useCallback(
    async (path: string): Promise<SftpFileEntry[]> => {
      const rawFiles = await netcattyBridge.get()?.listLocalDir?.(path);
      if (!rawFiles) {
        // Fallback mock for development
        return getMockLocalFiles(path);
      }

      return rawFiles.map((f) => {
        const size = parseInt(f.size) || 0;
        return {
          name: f.name,
          type: f.type as "file" | "directory" | "symlink",
          size,
          sizeFormatted: formatFileSize(size),
          lastModified: new Date(f.lastModified).getTime(),
          lastModifiedFormatted: f.lastModified,
          linkTarget: f.linkTarget as "file" | "directory" | null | undefined,
          hidden: f.hidden, // Windows hidden attribute
        };
      });
    },
    [getMockLocalFiles],
  );

  const listRemoteFiles = useCallback(
    async (sftpId: string, path: string): Promise<SftpFileEntry[]> => {
      const rawFiles = await netcattyBridge.get()?.listSftp(sftpId, path);
      if (!rawFiles) return [];

      return rawFiles.map((f) => {
        const size = parseInt(f.size) || 0;
        return {
          name: f.name,
          type: f.type as "file" | "directory" | "symlink",
          size,
          sizeFormatted: formatFileSize(size),
          lastModified: new Date(f.lastModified).getTime(),
          lastModifiedFormatted: f.lastModified,
          linkTarget: f.linkTarget as "file" | "directory" | null | undefined,
        };
      });
    },
    [],
  );

  // Connect to a host - connects in the active tab of the specified side
  // If there's no active tab, creates one first using addTab
  const connect = useCallback(
    async (side: "left" | "right", host: Host | "local") => {
      const setTabs = side === "left" ? setLeftTabs : setRightTabs;
      
      // Get current active tab ID, or create a new tab if none exists
      let activeTabId: string | null = null;
      const sideTabs = side === "left" ? leftTabsRef.current : rightTabsRef.current;
      
      if (!sideTabs.activeTabId) {
        // Create a new tab synchronously using functional state update
        const newPane = createEmptyPane();
        activeTabId = newPane.id;
        setTabs((prev) => ({
          tabs: [...prev.tabs, newPane],
          activeTabId: newPane.id,
        }));
      } else {
        activeTabId = sideTabs.activeTabId;
      }
      
      // Need to wait for state to settle before continuing
      // We'll use the activeTabId we just set/captured
      if (!activeTabId) return;
      
      const connectionId = `${side}-${Date.now()}`;

      // Invalidate any pending navigation for this side
      navSeqRef.current[side] += 1;
      const connectRequestId = navSeqRef.current[side];

      // Save host info for potential reconnection
      lastConnectedHostRef.current[side] = host;

      // Get current pane state (may be null if we just created it)
      const currentPane = getActivePane(side);
      
      // First, disconnect any existing connection
      if (currentPane?.connection) {
        clearCacheForConnection(currentPane.connection.id);
      }
      if (currentPane?.connection && !currentPane.connection.isLocal) {
        const oldSftpId = sftpSessionsRef.current.get(
          currentPane.connection.id,
        );
	        if (oldSftpId) {
	          try {
	            await netcattyBridge.get()?.closeSftp(oldSftpId);
	          } catch {
	            // Ignore errors when closing stale SFTP sessions
	          }
	          sftpSessionsRef.current.delete(currentPane.connection.id);
	        }
	      }

      if (host === "local") {
	        // Local filesystem connection
	        // Try to get home directory from backend, fallback to platform-specific default
	        let homeDir = await netcattyBridge.get()?.getHomeDir?.();
	        if (!homeDir) {
	          // Detect platform and use appropriate default
	          const isWindows = navigator.platform.toLowerCase().includes("win");
	          homeDir = isWindows ? "C:\\Users\\damao" : "/Users/damao";
	        }

        const connection: SftpConnection = {
          id: connectionId,
          hostId: "local",
          hostLabel: "Local",
          isLocal: true,
          status: "connected",
          currentPath: homeDir,
          homeDir,
        };

        updateTab(side, activeTabId, (prev) => ({
          ...prev,
          connection,
          loading: true,
          reconnecting: false,
          error: null,
        }));

        try {
          const files = await listLocalFiles(homeDir);
          if (navSeqRef.current[side] !== connectRequestId) return;
          dirCacheRef.current.set(makeCacheKey(connectionId, homeDir), {
            files,
            timestamp: Date.now(),
          });
          // Clear reconnecting flag on success
          reconnectingRef.current[side] = false;
          updateTab(side, activeTabId, (prev) => ({
            ...prev,
            files,
            loading: false,
            reconnecting: false,
          }));
        } catch (err) {
          if (navSeqRef.current[side] !== connectRequestId) return;
          reconnectingRef.current[side] = false;
          updateTab(side, activeTabId, (prev) => ({
            ...prev,
            error:
              err instanceof Error ? err.message : "Failed to list directory",
            loading: false,
            reconnecting: false,
          }));
        }
      } else {
        // Remote SFTP connection
        const connection: SftpConnection = {
          id: connectionId,
          hostId: host.id,
          hostLabel: host.label,
          isLocal: false,
          status: "connecting",
          currentPath: "/",
        };

        updateTab(side, activeTabId, (prev) => ({
          ...prev,
          connection,
          loading: true,
          reconnecting: prev.reconnecting, // Preserve reconnecting state during connection
          error: null,
          files: prev.reconnecting ? prev.files : [], // Keep files if reconnecting
        }));

	        try {
	          const credentials = getHostCredentials(host);
            const bridge = netcattyBridge.get();
            const openSftp = bridge?.openSftp;
            if (!openSftp) throw new Error("SFTP bridge unavailable");

            const isAuthError = (err: unknown): boolean => {
              if (!(err instanceof Error)) return false;
              const msg = err.message.toLowerCase();
              return (
                msg.includes("authentication") ||
                msg.includes("auth") ||
                msg.includes("password") ||
                msg.includes("permission denied")
              );
            };

            const hasKey = !!credentials.privateKey;
            const hasPassword = !!credentials.password;

            let sftpId: string | undefined;
            if (hasKey) {
              try {
                // Prefer trying key/cert first when both are present.
                sftpId = await openSftp({
                  sessionId: `sftp-${connectionId}`,
                  ...credentials,
                  password: undefined,
                });
              } catch (err) {
                if (hasPassword && isAuthError(err)) {
                  sftpId = await openSftp({
                    sessionId: `sftp-${connectionId}`,
                    ...credentials,
                    privateKey: undefined,
                    certificate: undefined,
                    publicKey: undefined,
                    keyId: undefined,
                    keySource: undefined,
                  });
                } else {
                  throw err;
                }
              }
            } else {
              sftpId = await openSftp({
                sessionId: `sftp-${connectionId}`,
                ...credentials,
              });
            }

          if (!sftpId) throw new Error("Failed to open SFTP session");

          sftpSessionsRef.current.set(connectionId, sftpId);

	          // Try to get home directory, default to "/"
	          let startPath = "/";
	          const statSftp = netcattyBridge.get()?.statSftp;
	          if (statSftp) {
            const candidates: string[] = [];
            if (credentials.username === "root") {
              // Root user's home is /root, not /home/root
              candidates.push("/root");
            } else if (credentials.username) {
              candidates.push(`/home/${credentials.username}`);
              candidates.push("/root");
            } else {
              candidates.push("/root");
            }
            for (const candidate of candidates) {
              try {
                const stat = await statSftp(sftpId, candidate);
                if (stat?.type === "directory") {
                  startPath = candidate;
                  break;
                }
              } catch {
                // Ignore missing/permission errors
              }
            }
	          } else {
	            if (credentials.username === "root") {
	              // Root user's home is /root, not /home/root
	              try {
	                const rootFiles = await netcattyBridge.get()?.listSftp(
	                  sftpId,
	                  "/root",
	                );
	                if (rootFiles) startPath = "/root";
	              } catch {
                // Fallback path not available, use default
              }
	            } else if (credentials.username) {
	              try {
	                const homeFiles = await netcattyBridge.get()?.listSftp(
	                  sftpId,
	                  `/home/${credentials.username}`,
	                );
	                if (homeFiles) startPath = `/home/${credentials.username}`;
	              } catch {
                // Fall through to /root check
              }
	              if (startPath === "/") {
	                try {
	                  const rootFiles = await netcattyBridge.get()?.listSftp(
	                    sftpId,
	                    "/root",
	                  );
	                  if (rootFiles) startPath = "/root";
	                } catch {
                  // Fallback path not available, use default
                }
              }
            } else {
	              try {
	                const rootFiles = await netcattyBridge.get()?.listSftp(
	                  sftpId,
	                  "/root",
	                );
	                if (rootFiles) startPath = "/root";
	              } catch {
                // Fallback path not available, use default
              }
            }
          }

          const files = await listRemoteFiles(sftpId, startPath);
          if (navSeqRef.current[side] !== connectRequestId) return;
          dirCacheRef.current.set(makeCacheKey(connectionId, startPath), {
            files,
            timestamp: Date.now(),
          });

          // Clear reconnecting flag on success
          reconnectingRef.current[side] = false;

          updateTab(side, activeTabId, (prev) => ({
            ...prev,
            connection: prev.connection
              ? {
                  ...prev.connection,
                  status: "connected",
                  currentPath: startPath,
                  homeDir: startPath,
                }
              : null,
            files,
            loading: false,
            reconnecting: false,
          }));
        } catch (err) {
          if (navSeqRef.current[side] !== connectRequestId) return;
          reconnectingRef.current[side] = false;
          updateTab(side, activeTabId, (prev) => ({
            ...prev,
            connection: prev.connection
              ? {
                  ...prev.connection,
                  status: "error",
                  error:
                    err instanceof Error ? err.message : "Connection failed",
                }
              : null,
            error: err instanceof Error ? err.message : "Connection failed",
            loading: false,
            reconnecting: false,
          }));
        }
      }
    },
    [
      getHostCredentials,
      getActivePane,
      updateTab,
      clearCacheForConnection,
      makeCacheKey,
      listLocalFiles,
      listRemoteFiles,
    ],
  );

  // Auto-connect left pane to local filesystem on first mount
  useEffect(() => {
    if (!initialConnectDoneRef.current && leftTabs.tabs.length === 0) {
      initialConnectDoneRef.current = true;
      // connect() creates a tab when none exists; avoid adding an extra empty tab.
      setTimeout(() => {
        connect("left", "local");
      }, 0);
    }
  }, [connect, leftTabs.tabs.length]);

  // Auto-reconnect when reconnecting flag is set
  useEffect(() => {
    const attemptReconnect = async (side: "left" | "right") => {
      const lastHost = lastConnectedHostRef.current[side];
      if (lastHost && reconnectingRef.current[side]) {
        // Small delay before reconnecting
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (reconnectingRef.current[side]) {
          connect(side, lastHost);
        }
      }
    };

    if (leftPane.reconnecting && reconnectingRef.current.left) {
      attemptReconnect("left");
    }
    if (rightPane.reconnecting && reconnectingRef.current.right) {
      attemptReconnect("right");
    }
  }, [leftPane.reconnecting, rightPane.reconnecting, connect]);

  // Disconnect the active tab on a side
  const disconnect = useCallback(
    async (side: "left" | "right") => {
      const pane = getActivePane(side);
      const sideTabs = side === "left" ? leftTabsRef.current : rightTabsRef.current;
      const activeTabId = sideTabs.activeTabId;

      if (!pane || !activeTabId) return;

      // Invalidate any pending navigation for this side
      navSeqRef.current[side] += 1;

      if (pane.connection) {
        clearCacheForConnection(pane.connection.id);
      }

      // Clear reconnection state
      reconnectingRef.current[side] = false;
      lastConnectedHostRef.current[side] = null;

      if (pane.connection && !pane.connection.isLocal) {
	        const sftpId = sftpSessionsRef.current.get(pane.connection.id);
	        if (sftpId) {
	          try {
	            await netcattyBridge.get()?.closeSftp(sftpId);
	          } catch {
	            // Ignore errors when closing SFTP session during disconnect
	          }
	          sftpSessionsRef.current.delete(pane.connection.id);
	        }
	      }

      updateTab(side, activeTabId, () => createEmptyPane(activeTabId));
    },
    [getActivePane, clearCacheForConnection, updateTab],
  );

  // Mock local file data for development (when backend is not available)
  function buildMockLocalFiles(path: string): SftpFileEntry[] {
    // Normalize path for matching (handle both Windows and Unix paths)
    const normPath = path.replace(/\\/g, "/").replace(/\/$/, "") || "/";

    const mockData: Record<string, SftpFileEntry[]> = {
      // Unix-style paths
      "/": [
        {
          name: "Users",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
        {
          name: "Applications",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 172800000,
          lastModifiedFormatted: formatDate(Date.now() - 172800000),
        },
        {
          name: "System",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 259200000,
          lastModifiedFormatted: formatDate(Date.now() - 259200000),
        },
      ],
      "/Users": [
        {
          name: "damao",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 3600000,
          lastModifiedFormatted: formatDate(Date.now() - 3600000),
        },
        {
          name: "Shared",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
      ],
      "/Users/damao": [
        {
          name: "Desktop",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 1800000,
          lastModifiedFormatted: formatDate(Date.now() - 1800000),
        },
        {
          name: "Documents",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 7200000,
          lastModifiedFormatted: formatDate(Date.now() - 7200000),
        },
        {
          name: "Downloads",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 3600000,
          lastModifiedFormatted: formatDate(Date.now() - 3600000),
        },
        {
          name: "Pictures",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 172800000,
          lastModifiedFormatted: formatDate(Date.now() - 172800000),
        },
        {
          name: "Projects",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 900000,
          lastModifiedFormatted: formatDate(Date.now() - 900000),
        },
      ],
      // Windows-style paths (normalized to forward slashes for matching)
      "C:": [
        {
          name: "Users",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
        {
          name: "Program Files",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 172800000,
          lastModifiedFormatted: formatDate(Date.now() - 172800000),
        },
        {
          name: "Windows",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 259200000,
          lastModifiedFormatted: formatDate(Date.now() - 259200000),
        },
      ],
      "C:/Users": [
        {
          name: "damao",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 3600000,
          lastModifiedFormatted: formatDate(Date.now() - 3600000),
        },
        {
          name: "Public",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
        {
          name: "Default",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 172800000,
          lastModifiedFormatted: formatDate(Date.now() - 172800000),
        },
      ],
      "C:/Users/damao": [
        {
          name: "Desktop",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 1800000,
          lastModifiedFormatted: formatDate(Date.now() - 1800000),
        },
        {
          name: "Documents",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 7200000,
          lastModifiedFormatted: formatDate(Date.now() - 7200000),
        },
        {
          name: "Downloads",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 3600000,
          lastModifiedFormatted: formatDate(Date.now() - 3600000),
        },
        {
          name: "Pictures",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 172800000,
          lastModifiedFormatted: formatDate(Date.now() - 172800000),
        },
        {
          name: "Projects",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 900000,
          lastModifiedFormatted: formatDate(Date.now() - 900000),
        },
      ],
      "C:/Users/damao/Desktop": [
        {
          name: "Netcatty",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 300000,
          lastModifiedFormatted: formatDate(Date.now() - 300000),
        },
        {
          name: "notes.txt",
          type: "file",
          size: 2048,
          sizeFormatted: "2 KB",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
        {
          name: "screenshot.png",
          type: "file",
          size: 1048576,
          sizeFormatted: "1 MB",
          lastModified: Date.now() - 43200000,
          lastModifiedFormatted: formatDate(Date.now() - 43200000),
        },
      ],
      "C:/Users/damao/Desktop/Netcatty": [
        {
          name: "src",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 600000,
          lastModifiedFormatted: formatDate(Date.now() - 600000),
        },
        {
          name: "package.json",
          type: "file",
          size: 1536,
          sizeFormatted: "1.5 KB",
          lastModified: Date.now() - 3600000,
          lastModifiedFormatted: formatDate(Date.now() - 3600000),
        },
        {
          name: "README.md",
          type: "file",
          size: 4096,
          sizeFormatted: "4 KB",
          lastModified: Date.now() - 7200000,
          lastModifiedFormatted: formatDate(Date.now() - 7200000),
        },
        {
          name: "tsconfig.json",
          type: "file",
          size: 512,
          sizeFormatted: "512 Bytes",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
      ],
      "C:/Users/damao/Documents": [
        {
          name: "Work",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
        {
          name: "Personal",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 172800000,
          lastModifiedFormatted: formatDate(Date.now() - 172800000),
        },
        {
          name: "report.pdf",
          type: "file",
          size: 2097152,
          sizeFormatted: "2 MB",
          lastModified: Date.now() - 259200000,
          lastModifiedFormatted: formatDate(Date.now() - 259200000),
        },
      ],
      "C:/Users/damao/Downloads": [
        {
          name: "installer.exe",
          type: "file",
          size: 52428800,
          sizeFormatted: "50 MB",
          lastModified: Date.now() - 3600000,
          lastModifiedFormatted: formatDate(Date.now() - 3600000),
        },
        {
          name: "archive.zip",
          type: "file",
          size: 10485760,
          sizeFormatted: "10 MB",
          lastModified: Date.now() - 7200000,
          lastModifiedFormatted: formatDate(Date.now() - 7200000),
        },
        {
          name: "document.pdf",
          type: "file",
          size: 524288,
          sizeFormatted: "512 KB",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
      ],
      "C:/Users/damao/Projects": [
        {
          name: "webapp",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 1800000,
          lastModifiedFormatted: formatDate(Date.now() - 1800000),
        },
        {
          name: "scripts",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 43200000,
          lastModifiedFormatted: formatDate(Date.now() - 43200000),
        },
      ],
      "/Users/damao/Desktop": [
        {
          name: "Netcatty",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 300000,
          lastModifiedFormatted: formatDate(Date.now() - 300000),
        },
        {
          name: "notes.txt",
          type: "file",
          size: 2048,
          sizeFormatted: "2 KB",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
        {
          name: "screenshot.png",
          type: "file",
          size: 1048576,
          sizeFormatted: "1 MB",
          lastModified: Date.now() - 43200000,
          lastModifiedFormatted: formatDate(Date.now() - 43200000),
        },
      ],
      "/Users/damao/Desktop/Netcatty": [
        {
          name: "src",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 600000,
          lastModifiedFormatted: formatDate(Date.now() - 600000),
        },
        {
          name: "package.json",
          type: "file",
          size: 1536,
          sizeFormatted: "1.5 KB",
          lastModified: Date.now() - 3600000,
          lastModifiedFormatted: formatDate(Date.now() - 3600000),
        },
        {
          name: "README.md",
          type: "file",
          size: 4096,
          sizeFormatted: "4 KB",
          lastModified: Date.now() - 7200000,
          lastModifiedFormatted: formatDate(Date.now() - 7200000),
        },
        {
          name: "tsconfig.json",
          type: "file",
          size: 512,
          sizeFormatted: "512 Bytes",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
      ],
      "/Users/damao/Documents": [
        {
          name: "Work",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
        {
          name: "Personal",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 172800000,
          lastModifiedFormatted: formatDate(Date.now() - 172800000),
        },
        {
          name: "report.pdf",
          type: "file",
          size: 2097152,
          sizeFormatted: "2 MB",
          lastModified: Date.now() - 259200000,
          lastModifiedFormatted: formatDate(Date.now() - 259200000),
        },
      ],
      "/Users/damao/Downloads": [
        {
          name: "installer.exe",
          type: "file",
          size: 52428800,
          sizeFormatted: "50 MB",
          lastModified: Date.now() - 3600000,
          lastModifiedFormatted: formatDate(Date.now() - 3600000),
        },
        {
          name: "archive.zip",
          type: "file",
          size: 10485760,
          sizeFormatted: "10 MB",
          lastModified: Date.now() - 7200000,
          lastModifiedFormatted: formatDate(Date.now() - 7200000),
        },
        {
          name: "document.pdf",
          type: "file",
          size: 524288,
          sizeFormatted: "512 KB",
          lastModified: Date.now() - 86400000,
          lastModifiedFormatted: formatDate(Date.now() - 86400000),
        },
      ],
      "/Users/damao/Projects": [
        {
          name: "webapp",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 1800000,
          lastModifiedFormatted: formatDate(Date.now() - 1800000),
        },
        {
          name: "scripts",
          type: "directory",
          size: 0,
          sizeFormatted: "--",
          lastModified: Date.now() - 43200000,
          lastModifiedFormatted: formatDate(Date.now() - 43200000),
        },
      ],
    };
    return mockData[normPath] || [];
  }

  // Navigate to path
  const navigateTo = useCallback(
    async (
      side: "left" | "right",
      path: string,
      options?: { force?: boolean },
    ) => {
      console.log("[SFTP navigateTo] called", { side, path, force: options?.force });
      
      const pane = getActivePane(side);
      const sideTabs = side === "left" ? leftTabsRef.current : rightTabsRef.current;
      const activeTabId = sideTabs.activeTabId;

      console.log("[SFTP navigateTo] state check", { 
        paneId: pane?.id,
        hasConnection: !!pane?.connection,
        activeTabId,
        currentPath: pane?.connection?.currentPath
      });

      if (!pane?.connection || !activeTabId) {
        console.log("[SFTP navigateTo] No pane/connection/activeTabId, returning early");
        return;
      }

      const requestId = ++navSeqRef.current[side];
      const cacheKey = makeCacheKey(pane.connection.id, path);
      const cached = options?.force
        ? undefined
        : dirCacheRef.current.get(cacheKey);

      if (
        cached &&
        Date.now() - cached.timestamp < DIR_CACHE_TTL_MS &&
        cached.files
      ) {
        console.log("[SFTP navigateTo] Using cached files for path", { path, cacheKey });
        updateTab(side, activeTabId, (prev) => ({
          ...prev,
          connection: prev.connection
            ? { ...prev.connection, currentPath: path }
            : null,
          files: cached.files,
          loading: false,
          error: null,
          selectedFiles: new Set(),
        }));
        return;
      }

      console.log("[SFTP navigateTo] Fetching files from server for path", { path });
      updateTab(side, activeTabId, (prev) => ({ ...prev, loading: true, error: null }));

      try {
        let files: SftpFileEntry[];

        if (pane.connection.isLocal) {
          files = await listLocalFiles(path);
        } else {
          const sftpId = sftpSessionsRef.current.get(pane.connection.id);
          if (!sftpId) {
            // Session lost - clear connection state
            clearCacheForConnection(pane.connection.id);
            updateTab(side, activeTabId, (prev) => ({
              ...prev,
              connection: null,
              files: [],
              loading: false,
              reconnecting: false,
              error: "SFTP session lost. Please reconnect.",
              selectedFiles: new Set(),
              filter: "",
            }));
            return;
          }

          try {
            files = await listRemoteFiles(sftpId, path);
          } catch (err) {
            if (isSessionError(err)) {
              // Clean up stale session reference
              sftpSessionsRef.current.delete(pane.connection.id);
              clearCacheForConnection(pane.connection.id);
              updateTab(side, activeTabId, (prev) => ({
                ...prev,
                connection: null,
                files: [],
                loading: false,
                reconnecting: false,
                error: "SFTP session expired. Please reconnect.",
                selectedFiles: new Set(),
                filter: "",
              }));
              return;
            }
            throw err as Error;
          }
        }

        if (navSeqRef.current[side] !== requestId) return;

        dirCacheRef.current.set(cacheKey, {
          files,
          timestamp: Date.now(),
        });

        updateTab(side, activeTabId, (prev) => ({
          ...prev,
          connection: prev.connection
            ? { ...prev.connection, currentPath: path }
            : null,
          files,
          loading: false,
          selectedFiles: new Set(),
        }));
      } catch (err) {
        if (navSeqRef.current[side] !== requestId) return;
        updateTab(side, activeTabId, (prev) => ({
          ...prev,
          error:
            err instanceof Error ? err.message : "Failed to list directory",
          loading: false,
        }));
      }
    },
    [
      getActivePane,
      updateTab,
      makeCacheKey,
      clearCacheForConnection,
      listLocalFiles,
      listRemoteFiles,
    ],
  );

  // Refresh current directory
  const refresh = useCallback(
    async (side: "left" | "right") => {
      const pane = getActivePane(side);
      if (pane?.connection) {
        await navigateTo(side, pane.connection.currentPath, { force: true });
      }
    },
    [getActivePane, navigateTo],
  );

  // Navigate up
  const navigateUp = useCallback(
    async (side: "left" | "right") => {
      const pane = getActivePane(side);
      if (!pane?.connection) return;

      const currentPath = pane.connection.currentPath;
      // Check if we're at root (Unix "/" or Windows "C:")
      const isAtRoot = currentPath === "/" || isWindowsRoot(currentPath);

      if (!isAtRoot) {
        const parentPath = getParentPath(currentPath);
        await navigateTo(side, parentPath);
      }
    },
    [getActivePane, navigateTo],
  );

  // Open file/directory
  const openEntry = useCallback(
    async (side: "left" | "right", entry: SftpFileEntry) => {
      console.log("[SFTP openEntry] called", { side, entryName: entry.name, entryType: entry.type });
      
      const pane = getActivePane(side);
      console.log("[SFTP openEntry] getActivePane result", { 
        paneId: pane?.id, 
        hasConnection: !!pane?.connection,
        currentPath: pane?.connection?.currentPath 
      });
      
      if (!pane?.connection) {
        console.log("[SFTP openEntry] No pane or connection, returning early");
        return;
      }

      if (entry.name === "..") {
        // Navigate to parent directory directly using the current path from pane
        // instead of calling navigateUp which re-fetches the pane
        const currentPath = pane.connection.currentPath;
        const isAtRoot = currentPath === "/" || isWindowsRoot(currentPath);
        console.log("[SFTP openEntry] Navigating up from '..'", { 
          currentPath, 
          isAtRoot,
          isWindowsRoot: isWindowsRoot(currentPath)
        });
        
        if (!isAtRoot) {
          const parentPath = getParentPath(currentPath);
          console.log("[SFTP openEntry] Calculated parent path", { currentPath, parentPath });
          await navigateTo(side, parentPath);
        } else {
          console.log("[SFTP openEntry] Already at root, not navigating");
        }
        return;
      }

      // Navigate into directories, or symlinks that point to directories
      if (isNavigableDirectory(entry)) {
        const newPath = joinPath(pane.connection.currentPath, entry.name);
        console.log("[SFTP openEntry] Navigating into directory", { currentPath: pane.connection.currentPath, entryName: entry.name, newPath });
        await navigateTo(side, newPath);
      }
      // TODO: Handle file open/preview
    },
    [getActivePane, navigateTo],
  );

  // Selection management
  const toggleSelection = useCallback(
    (side: "left" | "right", fileName: string, multiSelect: boolean) => {
      updateActiveTab(side, (prev) => {
        const newSelection = new Set(multiSelect ? prev.selectedFiles : []);
        if (newSelection.has(fileName)) {
          newSelection.delete(fileName);
        } else {
          newSelection.add(fileName);
        }
        return { ...prev, selectedFiles: newSelection };
      });
    },
    [updateActiveTab],
  );

  // Range selection for shift-click
  // Now accepts the actual file names to select directly from the UI
  const rangeSelect = useCallback(
    (side: "left" | "right", fileNames: string[]) => {
      const newSelection = new Set<string>();
      for (const name of fileNames) {
        if (name && name !== "..") {
          newSelection.add(name);
        }
      }

      updateActiveTab(side, (prev) => ({ ...prev, selectedFiles: newSelection }));
    },
    [updateActiveTab],
  );

  const clearSelection = useCallback((side: "left" | "right") => {
    updateActiveTab(side, (prev) => ({ ...prev, selectedFiles: new Set() }));
  }, [updateActiveTab]);

  const selectAll = useCallback(
    (side: "left" | "right") => {
      const pane = getActivePane(side);
      if (!pane) return;

      updateActiveTab(side, (prev) => ({
        ...prev,
        selectedFiles: new Set(
          pane.files.filter((f) => f.name !== "..").map((f) => f.name),
        ),
      }));
    },
    [getActivePane, updateActiveTab],
  );

  // Filter
  const setFilter = useCallback((side: "left" | "right", filter: string) => {
    updateActiveTab(side, (prev) => ({ ...prev, filter }));
  }, [updateActiveTab]);

  // Create directory
  const createDirectory = useCallback(
    async (side: "left" | "right", name: string) => {
      const pane = getActivePane(side);
      if (!pane?.connection) return;

      const fullPath = joinPath(pane.connection.currentPath, name);

	      try {
	        if (pane.connection.isLocal) {
	          await netcattyBridge.get()?.mkdirLocal?.(fullPath);
	        } else {
	          const sftpId = sftpSessionsRef.current.get(pane.connection.id);
	          if (!sftpId) {
	            handleSessionError(side, new Error("SFTP session not found"));
	            return;
	          }
	          await netcattyBridge.get()?.mkdirSftp(sftpId, fullPath);
	        }
	        await refresh(side);
      } catch (err) {
        if (isSessionError(err)) {
          handleSessionError(side, err as Error);
          return;
        }
        throw err;
      }
    },
    [getActivePane, refresh, handleSessionError],
  );

  // Delete files
  const deleteFiles = useCallback(
    async (side: "left" | "right", fileNames: string[]) => {
      const pane = getActivePane(side);
      if (!pane?.connection) return;

	      try {
	        for (const name of fileNames) {
	          const fullPath = joinPath(pane.connection.currentPath, name);

	          if (pane.connection.isLocal) {
	            await netcattyBridge.get()?.deleteLocalFile?.(fullPath);
	          } else {
	            const sftpId = sftpSessionsRef.current.get(pane.connection.id);
	            if (!sftpId) {
	              handleSessionError(side, new Error("SFTP session not found"));
	              return;
	            }
	            await netcattyBridge.get()?.deleteSftp?.(sftpId, fullPath);
	          }
	        }
	        await refresh(side);
      } catch (err) {
        if (isSessionError(err)) {
          handleSessionError(side, err as Error);
          return;
        }
        throw err;
      }
    },
    [getActivePane, refresh, handleSessionError],
  );

  // Rename file
  const renameFile = useCallback(
    async (side: "left" | "right", oldName: string, newName: string) => {
      const pane = getActivePane(side);
      if (!pane?.connection) return;

      const oldPath = joinPath(pane.connection.currentPath, oldName);
      const newPath = joinPath(pane.connection.currentPath, newName);

	      try {
	        if (pane.connection.isLocal) {
	          await netcattyBridge.get()?.renameLocalFile?.(oldPath, newPath);
	        } else {
	          const sftpId = sftpSessionsRef.current.get(pane.connection.id);
	          if (!sftpId) {
	            handleSessionError(side, new Error("SFTP session not found"));
	            return;
	          }
	          await netcattyBridge.get()?.renameSftp?.(sftpId, oldPath, newPath);
	        }
	        await refresh(side);
      } catch (err) {
        if (isSessionError(err)) {
          handleSessionError(side, err as Error);
          return;
        }
        throw err;
      }
    },
    [getActivePane, refresh, handleSessionError],
  );

  // Transfer files
  const startTransfer = useCallback(
    async (
      sourceFiles: { name: string; isDirectory: boolean }[],
      sourceSide: "left" | "right",
      targetSide: "left" | "right",
    ) => {
      const sourcePane = getActivePane(sourceSide);
      const targetPane = getActivePane(targetSide);

      if (!sourcePane?.connection || !targetPane?.connection) return;

      const sourcePath = sourcePane.connection.currentPath;
      const targetPath = targetPane.connection.currentPath;

      // Get SFTP session ID if remote
      const sourceSftpId = sourcePane.connection.isLocal
        ? null
        : sftpSessionsRef.current.get(sourcePane.connection.id);

      // Create transfer tasks with actual file sizes
      const newTasks: TransferTask[] = [];

      for (const file of sourceFiles) {
        const direction: TransferDirection =
          sourcePane.connection!.isLocal && !targetPane.connection!.isLocal
            ? "upload"
            : !sourcePane.connection!.isLocal && targetPane.connection!.isLocal
              ? "download"
              : "remote-to-remote";

        // Get actual file size from source
        let fileSize = 0;
        if (!file.isDirectory) {
          try {
	            const fullPath = joinPath(sourcePath, file.name);
	            if (sourcePane.connection!.isLocal) {
	              const stat = await netcattyBridge.get()?.statLocal?.(fullPath);
	              if (stat) fileSize = stat.size;
	            } else if (sourceSftpId) {
	              const stat = await netcattyBridge.get()?.statSftp?.(
	                sourceSftpId,
	                fullPath,
	              );
	              if (stat) fileSize = stat.size;
	            }
          } catch {
            // If stat fails, we'll use estimate later
          }
        }

        newTasks.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          sourcePath: joinPath(sourcePath, file.name),
          targetPath: joinPath(targetPath, file.name),
          sourceConnectionId: sourcePane.connection!.id,
          targetConnectionId: targetPane.connection!.id,
          direction,
          status: "pending" as TransferStatus,
          totalBytes: fileSize,
          transferredBytes: 0,
          speed: 0,
          startTime: Date.now(),
          isDirectory: file.isDirectory,
        });
      }

      setTransfers((prev) => [...prev, ...newTasks]);

      // Process transfers
      for (const task of newTasks) {
        await processTransfer(task, sourcePane, targetPane);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- processTransfer is defined inline, not a dependency
    [getActivePane],
  );

  // Process a single transfer
  const processTransfer = async (
    task: TransferTask,
    sourcePane: SftpPane,
    targetPane: SftpPane,
  ) => {
    const updateTask = (updates: Partial<TransferTask>) => {
      setTransfers((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, ...updates } : t)),
      );
    };

    // Get actual file size if not already known
    let actualFileSize = task.totalBytes;
    if (!task.isDirectory && actualFileSize === 0) {
      try {
	        const sourceSftpId = sourcePane.connection?.isLocal
	          ? null
	          : sftpSessionsRef.current.get(sourcePane.connection!.id);

	        if (sourcePane.connection?.isLocal) {
	          const stat = await netcattyBridge.get()?.statLocal?.(task.sourcePath);
	          if (stat) actualFileSize = stat.size;
	        } else if (sourceSftpId) {
	          const stat = await netcattyBridge.get()?.statSftp?.(
	            sourceSftpId,
	            task.sourcePath,
	          );
	          if (stat) actualFileSize = stat.size;
	        }
      } catch {
        // Ignore stat errors, use estimate
      }
    }

    // Estimate file size for progress simulation (use a reasonable default if unknown)
	    const estimatedSize =
      actualFileSize > 0
        ? actualFileSize
        : task.isDirectory
          ? 1024 * 1024 // 1MB estimate for directories
          : 256 * 1024; // 256KB default for files

	    // Check if streaming transfer is available (will provide real progress)
	    const hasStreamingTransfer = !!netcattyBridge.get()?.startStreamTransfer;

    updateTask({
      status: "transferring",
      totalBytes: estimatedSize,
      transferredBytes: 0,
      startTime: Date.now(),
    });

    // Only use simulated progress for directories or when streaming is not available
    const useSimulatedProgress = task.isDirectory || !hasStreamingTransfer;
    if (useSimulatedProgress) {
      startProgressSimulation(task.id, estimatedSize);
    }

    try {
      const sourceSftpId = sourcePane.connection?.isLocal
        ? null
        : sftpSessionsRef.current.get(sourcePane.connection!.id);
      const targetSftpId = targetPane.connection?.isLocal
        ? null
        : sftpSessionsRef.current.get(targetPane.connection!.id);

      // Check if file already exists at target (conflict detection)
      // Skip if user already resolved conflict with replace/duplicate
      if (!task.isDirectory && !task.skipConflictCheck) {
        let targetExists = false;
        let existingStat: { size: number; mtime: number } | null = null;
        let sourceStat: { size: number; mtime: number } | null = null;

        // Get source file stat for accurate size and mtime
	        try {
	          if (sourcePane.connection?.isLocal) {
	            const stat = await netcattyBridge.get()?.statLocal?.(task.sourcePath);
	            if (stat) {
	              sourceStat = {
	                size: stat.size,
	                mtime: stat.lastModified || Date.now(),
	              };
	            }
	          } else if (sourceSftpId && netcattyBridge.get()?.statSftp) {
	            const stat = await netcattyBridge.get()!.statSftp!(
	              sourceSftpId,
	              task.sourcePath,
	            );
	            if (stat) {
	              sourceStat = {
                size: stat.size,
                mtime: stat.lastModified || Date.now(),
              };
            }
          }
        } catch {
          // Use estimated size if stat fails
        }

        // Get target file stat to check for conflict
	        try {
	          if (targetPane.connection?.isLocal) {
	            const stat = await netcattyBridge.get()?.statLocal?.(task.targetPath);
	            if (stat) {
	              targetExists = true;
	              existingStat = {
	                size: stat.size,
	                mtime: stat.lastModified || Date.now(),
	              };
	            }
	          } else if (targetSftpId && netcattyBridge.get()?.statSftp) {
	            const stat = await netcattyBridge.get()!.statSftp!(
	              targetSftpId,
	              task.targetPath,
	            );
	            if (stat) {
	              targetExists = true;
	              existingStat = {
                size: stat.size,
                mtime: stat.lastModified || Date.now(),
              };
            }
          }
        } catch {
          // File doesn't exist, no conflict
        }

        if (targetExists && existingStat) {
          // Stop progress simulation while waiting for user decision
          stopProgressSimulation(task.id);

          // Add conflict for user to resolve
          const newConflict: FileConflict = {
            transferId: task.id,
            fileName: task.fileName,
            sourcePath: task.sourcePath,
            targetPath: task.targetPath,
            existingSize: existingStat.size,
            newSize: sourceStat?.size || estimatedSize, // Use actual source size
            existingModified: existingStat.mtime,
            newModified: sourceStat?.mtime || Date.now(), // Use actual source mtime
          };
          setConflicts((prev) => [...prev, newConflict]);
          updateTask({
            status: "pending",
            totalBytes: sourceStat?.size || estimatedSize,
          }); // Wait for user decision
          return;
        }
      }

      if (task.isDirectory) {
        // Handle directory transfer recursively
        await transferDirectory(
          task,
          sourceSftpId,
          targetSftpId,
          sourcePane.connection!.isLocal,
          targetPane.connection!.isLocal,
        );
      } else {
        // Handle file transfer
        await transferFile(
          task,
          sourceSftpId,
          targetSftpId,
          sourcePane.connection!.isLocal,
          targetPane.connection!.isLocal,
        );
      }

      // Stop progress simulation (only if it was started)
      if (useSimulatedProgress) {
        stopProgressSimulation(task.id);
      }

      // Get the current state of the task to use accurate totalBytes
      setTransfers((prev) =>
        prev.map((t) => {
          if (t.id !== task.id) return t;
          return {
            ...t,
            status: "completed" as TransferStatus,
            endTime: Date.now(),
            transferredBytes: t.totalBytes, // Use actual totalBytes from state
            speed: 0,
          };
        }),
      );

      // Refresh target pane
      const targetSide = targetPane === leftPane ? "left" : "right";
      await refresh(targetSide as "left" | "right");
    } catch (err) {
      // Stop progress simulation on failure (only if it was started)
      if (useSimulatedProgress) {
        stopProgressSimulation(task.id);
      }
      updateTask({
        status: "failed",
        error: err instanceof Error ? err.message : "Transfer failed",
        endTime: Date.now(),
        speed: 0,
      });
    }
  };

  // Transfer a single file using streaming with real progress
  const transferFile = async (
    task: TransferTask,
    sourceSftpId: string | null,
    targetSftpId: string | null,
    sourceIsLocal: boolean,
    targetIsLocal: boolean,
	  ): Promise<void> => {
	    // Try to use streaming transfer if available
	    if (netcattyBridge.get()?.startStreamTransfer) {
	      return new Promise((resolve, reject) => {
	        const options = {
	          transferId: task.id,
          sourcePath: task.sourcePath,
          targetPath: task.targetPath,
          sourceType: sourceIsLocal ? ("local" as const) : ("sftp" as const),
          targetType: targetIsLocal ? ("local" as const) : ("sftp" as const),
          sourceSftpId: sourceSftpId || undefined,
          targetSftpId: targetSftpId || undefined,
          totalBytes: task.totalBytes || undefined,
        };

        const onProgress = (
          transferred: number,
          total: number,
          speed: number,
        ) => {
          setTransfers((prev) =>
            prev.map((t) => {
              if (t.id !== task.id) return t;
              // Check if cancelled
              if (t.status === "cancelled") return t;
              return {
                ...t,
                transferredBytes: transferred,
                totalBytes: total || t.totalBytes,
                speed,
              };
            }),
          );
        };

        const onComplete = () => {
          resolve();
        };

	        const onError = (error: string) => {
	          reject(new Error(error));
	        };

	        netcattyBridge.require().startStreamTransfer!(
	          options,
	          onProgress,
	          onComplete,
	          onError,
	        ).catch(reject);
	      });
	    }

    // Fallback to legacy transfer (read all then write all)
    let content: ArrayBuffer | string;

	    // Read from source
	    if (sourceIsLocal) {
	      content =
	        (await netcattyBridge.get()?.readLocalFile?.(task.sourcePath)) ||
	        new ArrayBuffer(0);
	    } else if (sourceSftpId) {
	      if (netcattyBridge.get()?.readSftpBinary) {
	        content = await netcattyBridge.get()!.readSftpBinary!(
	          sourceSftpId,
	          task.sourcePath,
	        );
	      } else {
	        content =
	          (await netcattyBridge.get()?.readSftp(sourceSftpId, task.sourcePath)) || "";
	      }
	    } else {
	      throw new Error("No source connection");
	    }

	    // Write to target
	    if (targetIsLocal) {
	      if (content instanceof ArrayBuffer) {
	        await netcattyBridge.get()?.writeLocalFile?.(task.targetPath, content);
	      } else {
	        const encoder = new TextEncoder();
	        await netcattyBridge.get()?.writeLocalFile?.(
	          task.targetPath,
	          encoder.encode(content).buffer,
	        );
	      }
	    } else if (targetSftpId) {
	      if (content instanceof ArrayBuffer && netcattyBridge.get()?.writeSftpBinary) {
	        await netcattyBridge.get()!.writeSftpBinary!(
	          targetSftpId,
	          task.targetPath,
	          content,
	        );
	      } else {
	        const text =
	          content instanceof ArrayBuffer
	            ? new TextDecoder().decode(content)
	            : content;
	        await netcattyBridge.get()?.writeSftp(targetSftpId, task.targetPath, text);
	      }
	    } else {
	      throw new Error("No target connection");
	    }
	  };

  // Transfer a directory
  const transferDirectory = async (
    task: TransferTask,
    sourceSftpId: string | null,
    targetSftpId: string | null,
    sourceIsLocal: boolean,
    targetIsLocal: boolean,
  ) => {
	    // Create target directory
	    if (targetIsLocal) {
	      await netcattyBridge.get()?.mkdirLocal?.(task.targetPath);
	    } else if (targetSftpId) {
	      await netcattyBridge.get()?.mkdirSftp(targetSftpId, task.targetPath);
	    }

    // List source directory
    let files: SftpFileEntry[];
    if (sourceIsLocal) {
      files = await listLocalFiles(task.sourcePath);
    } else if (sourceSftpId) {
      files = await listRemoteFiles(sourceSftpId, task.sourcePath);
    } else {
      throw new Error("No source connection");
    }

    // Transfer each item
    for (const file of files) {
      if (file.name === "..") continue;

      const childTask: TransferTask = {
        ...task,
        id: crypto.randomUUID(),
        fileName: file.name,
        sourcePath: joinPath(task.sourcePath, file.name),
        targetPath: joinPath(task.targetPath, file.name),
        isDirectory: file.type === "directory",
        parentTaskId: task.id,
      };

      if (file.type === "directory") {
        await transferDirectory(
          childTask,
          sourceSftpId,
          targetSftpId,
          sourceIsLocal,
          targetIsLocal,
        );
      } else {
        await transferFile(
          childTask,
          sourceSftpId,
          targetSftpId,
          sourceIsLocal,
          targetIsLocal,
        );
      }
    }
  };

  // Cancel transfer
  // This will stop the streaming transfer at the backend level if supported
  const cancelTransfer = useCallback(
    async (transferId: string) => {
      // Stop progress simulation (for directory transfers or fallback mode)
      stopProgressSimulation(transferId);

      // Mark as cancelled
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === transferId
            ? {
                ...t,
                status: "cancelled" as TransferStatus,
                endTime: Date.now(),
              }
            : t,
        ),
      );

      // Remove from conflicts if present
      setConflicts((prev) => prev.filter((c) => c.transferId !== transferId));

	      // Cancel at backend level if streaming transfer is in progress
	      if (netcattyBridge.get()?.cancelTransfer) {
	        try {
	          await netcattyBridge.get()!.cancelTransfer!(transferId);
	        } catch (err) {
	          logger.warn("Failed to cancel transfer at backend:", err);
	        }
	      }
    },
    [stopProgressSimulation],
  );

  // Retry failed transfer
  const retryTransfer = useCallback(
    async (transferId: string) => {
      const task = transfers.find((t) => t.id === transferId);
      if (!task) return;

      const sourceSide = task.sourceConnectionId.startsWith("left") ? "left" : "right";
      const targetSide = task.targetConnectionId.startsWith("left") ? "left" : "right";
      const sourcePane = getActivePane(sourceSide as "left" | "right");
      const targetPane = getActivePane(targetSide as "left" | "right");

      if (sourcePane?.connection && targetPane?.connection) {
        setTransfers((prev) =>
          prev.map((t) =>
            t.id === transferId
              ? { ...t, status: "pending" as TransferStatus, error: undefined }
              : t,
          ),
        );
        await processTransfer(task, sourcePane, targetPane);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- processTransfer is defined inline, not a dependency
    [transfers, getActivePane],
  );

  // Clear completed transfers
  const clearCompletedTransfers = useCallback(() => {
    setTransfers((prev) =>
      prev.filter((t) => t.status !== "completed" && t.status !== "cancelled"),
    );
  }, []);

  // Dismiss transfer
  const dismissTransfer = useCallback((transferId: string) => {
    setTransfers((prev) => prev.filter((t) => t.id !== transferId));
  }, []);

  // Handle file conflict
  const resolveConflict = useCallback(
    async (conflictId: string, action: "replace" | "skip" | "duplicate") => {
      const conflict = conflicts.find((c) => c.transferId === conflictId);
      if (!conflict) return;

      // Remove from conflicts list
      setConflicts((prev) => prev.filter((c) => c.transferId !== conflictId));

      // Find the task
      const task = transfers.find((t) => t.id === conflictId);
      if (!task) return;

      if (action === "skip") {
        // Mark as cancelled
        setTransfers((prev) =>
          prev.map((t) =>
            t.id === conflictId
              ? { ...t, status: "cancelled" as TransferStatus }
              : t,
          ),
        );
        return;
      }

      // For replace or duplicate, we need to update the task and re-process
      let updatedTask = { ...task };

      if (action === "duplicate") {
        // Generate new name and update task
        const ext = task.fileName.includes(".")
          ? "." + task.fileName.split(".").pop()
          : "";
        const baseName = task.fileName.includes(".")
          ? task.fileName.slice(0, task.fileName.lastIndexOf("."))
          : task.fileName;
        const newName = `${baseName} (copy)${ext}`;
        const newTargetPath = task.targetPath.replace(task.fileName, newName);
        updatedTask = {
          ...task,
          fileName: newName,
          targetPath: newTargetPath,
          skipConflictCheck: true, // Skip check for new name
        };
      } else if (action === "replace") {
        // For replace, we just need to skip the conflict check
        updatedTask = {
          ...task,
          skipConflictCheck: true, // User explicitly chose to replace
        };
      }

      // Update task status and re-process
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === conflictId
            ? { ...updatedTask, status: "pending" as TransferStatus }
            : t,
        ),
      );

      // Find source and target panes and re-process transfer
      const sourceSide = updatedTask.sourceConnectionId.startsWith("left") ? "left" : "right";
      const targetSide = updatedTask.targetConnectionId.startsWith("left") ? "left" : "right";
      const sourcePane = getActivePane(sourceSide as "left" | "right");
      const targetPane = getActivePane(targetSide as "left" | "right");

      if (sourcePane?.connection && targetPane?.connection) {
        // Small delay to ensure state is updated
        setTimeout(async () => {
          await processTransfer(updatedTask, sourcePane, targetPane);
        }, 100);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- processTransfer is defined inline, not a dependency
    [conflicts, transfers, getActivePane],
  );

  // Get filtered files
  const getFilteredFiles = useCallback((pane: SftpPane): SftpFileEntry[] => {
    const term = pane.filter.trim().toLowerCase();
    if (!term) return pane.files;
    return pane.files.filter(
      (f) => f.name === ".." || f.name.toLowerCase().includes(term),
    );
  }, []);

  // Get active transfers count
  const activeTransfersCount = useMemo(() => transfers.filter(
    (t) => t.status === "pending" || t.status === "transferring",
  ).length, [transfers]);

  // Change file permissions (SFTP only)
  const changePermissions = useCallback(
    async (
      side: "left" | "right",
      filePath: string,
      mode: string, // octal string like "755"
    ) => {
      const pane = getActivePane(side);
      if (!pane?.connection || pane.connection.isLocal) {
        logger.warn("Cannot change permissions on local files");
        return;
	      }
	
	      const sftpId = sftpSessionsRef.current.get(pane.connection.id);
	      if (!sftpId || !netcattyBridge.get()?.chmodSftp) {
	        handleSessionError(side, new Error("SFTP session not found"));
	        return;
	      }
	
	      try {
	        await netcattyBridge.get()!.chmodSftp!(sftpId, filePath, mode);
	        await refresh(side);
	      } catch (err) {
        if (isSessionError(err)) {
          handleSessionError(side, err as Error);
          return;
        }
        logger.error("Failed to change permissions:", err);
      }
    },
    [getActivePane, refresh, handleSessionError],
  );

  // Read text file content
  const readTextFile = useCallback(
    async (side: "left" | "right", filePath: string): Promise<string> => {
      const pane = getActivePane(side);
      if (!pane?.connection) {
        throw new Error("No connection available");
      }

      if (pane.connection.isLocal) {
        const bridge = netcattyBridge.get();
        if (bridge?.readLocalFile) {
          const buffer = await bridge.readLocalFile(filePath);
          return new TextDecoder().decode(buffer);
        }
        throw new Error("Local file reading not supported");
      }

      const sftpId = sftpSessionsRef.current.get(pane.connection.id);
      if (!sftpId) {
        throw new Error("SFTP session not found");
      }

      const bridge = netcattyBridge.get();
      if (!bridge) {
        throw new Error("Bridge not available");
      }

      return await bridge.readSftp(sftpId, filePath);
    },
    [getActivePane],
  );

  // Read binary file content
  const readBinaryFile = useCallback(
    async (side: "left" | "right", filePath: string): Promise<ArrayBuffer> => {
      const pane = getActivePane(side);
      if (!pane?.connection) {
        throw new Error("No connection available");
      }

      if (pane.connection.isLocal) {
        const bridge = netcattyBridge.get();
        if (bridge?.readLocalFile) {
          return await bridge.readLocalFile(filePath);
        }
        throw new Error("Local file reading not supported");
      }

      const sftpId = sftpSessionsRef.current.get(pane.connection.id);
      if (!sftpId) {
        throw new Error("SFTP session not found");
      }

      const bridge = netcattyBridge.get();
      if (!bridge?.readSftpBinary) {
        throw new Error("Binary file reading not supported");
      }

      return await bridge.readSftpBinary(sftpId, filePath);
    },
    [getActivePane],
  );

  // Write text file content
  const writeTextFile = useCallback(
    async (side: "left" | "right", filePath: string, content: string): Promise<void> => {
      const pane = getActivePane(side);
      if (!pane?.connection) {
        throw new Error("No connection available");
      }

      if (pane.connection.isLocal) {
        const bridge = netcattyBridge.get();
        if (bridge?.writeLocalFile) {
          const data = new TextEncoder().encode(content);
          await bridge.writeLocalFile(filePath, data.buffer);
          return;
        }
        throw new Error("Local file writing not supported");
      }

      const sftpId = sftpSessionsRef.current.get(pane.connection.id);
      if (!sftpId) {
        throw new Error("SFTP session not found");
      }

      const bridge = netcattyBridge.get();
      if (!bridge) {
        throw new Error("Bridge not available");
      }

      await bridge.writeSftp(sftpId, filePath, content);
    },
    [getActivePane],
  );

  // Download file to temp directory and open with external application
  // If enableWatch is true and the file is remote, starts watching the temp file for changes
  // Returns { localTempPath, watchId } if watch was started, otherwise just { localTempPath }
  const downloadToTempAndOpen = useCallback(
    async (
      side: "left" | "right",
      remotePath: string,
      fileName: string,
      appPath: string,
      options?: { enableWatch?: boolean }
    ): Promise<{ localTempPath: string; watchId?: string }> => {
      const pane = getActivePane(side);
      if (!pane?.connection) {
        throw new Error("No connection available");
      }

      const bridge = netcattyBridge.get();
      if (!bridge?.downloadSftpToTemp || !bridge?.openWithApplication) {
        throw new Error("System app opening not supported");
      }

      if (pane.connection.isLocal) {
        // For local files, just open directly (no watching needed)
        await bridge.openWithApplication(remotePath, appPath);
        return { localTempPath: remotePath };
      }

      const sftpId = sftpSessionsRef.current.get(pane.connection.id);
      if (!sftpId) {
        throw new Error("SFTP session not found");
      }

      // Download to temp directory
      console.log("[SFTP] Downloading file to temp", { sftpId, remotePath, fileName });
      const localTempPath = await bridge.downloadSftpToTemp(sftpId, remotePath, fileName);
      console.log("[SFTP] File downloaded to temp", { localTempPath });
      
      // Register temp file for cleanup when SFTP session closes (regardless of auto-sync setting)
      if (bridge.registerTempFile) {
        try {
          await bridge.registerTempFile(sftpId, localTempPath);
        } catch (err) {
          console.warn("[SFTP] Failed to register temp file for cleanup:", err);
        }
      }
      
      // Open with the selected application
      console.log("[SFTP] Opening with application", { localTempPath, appPath });
      await bridge.openWithApplication(localTempPath, appPath);
      console.log("[SFTP] Application launched");
      
      // Start file watching if enabled
      let watchId: string | undefined;
      console.log("[SFTP] Auto-sync enabled check", { enableWatch: options?.enableWatch, hasStartFileWatch: !!bridge.startFileWatch });
      if (options?.enableWatch && bridge.startFileWatch) {
        try {
          console.log("[SFTP] Starting file watch", { localTempPath, remotePath, sftpId });
          const result = await bridge.startFileWatch(localTempPath, remotePath, sftpId);
          watchId = result.watchId;
          console.log("[SFTP] File watch started successfully", { watchId, localTempPath, remotePath });
        } catch (err) {
          console.warn("[SFTP] Failed to start file watch:", err);
          // Don't fail the operation if watching fails
        }
      } else {
        console.log("[SFTP] File watching not enabled or not available");
      }
      
      return { localTempPath, watchId };
    },
    [getActivePane],
  );

  // Upload external files dropped from OS
  const uploadExternalFiles = useCallback(
    async (side: "left" | "right", files: FileList) => {
      const pane = getActivePane(side);
      if (!pane?.connection) {
        throw new Error("No active connection");
      }

      const bridge = netcattyBridge.get();
      if (!bridge) {
        throw new Error("Bridge not available");
      }

      const results: { fileName: string; success: boolean; error?: string }[] = [];

      for (const file of Array.from(files)) {
        const targetPath = joinPath(pane.connection.currentPath, file.name);
        
        try {
          const arrayBuffer = await file.arrayBuffer();
          
          if (pane.connection.isLocal) {
            // Upload to local filesystem
            if (!bridge.writeLocalFile) {
              throw new Error("writeLocalFile not available");
            }
            await bridge.writeLocalFile(targetPath, arrayBuffer);
          } else {
            // Upload to remote via SFTP
            const sftpId = sftpSessionsRef.current.get(pane.connection.id);
            if (!sftpId) {
              throw new Error("SFTP session not found");
            }
            
            // Try progress API first, fallback to basic binary write
            if (bridge.writeSftpBinaryWithProgress) {
              const result = await bridge.writeSftpBinaryWithProgress(
                sftpId,
                targetPath,
                arrayBuffer,
                crypto.randomUUID(),
                // Progress callbacks not needed for simple drag-drop upload
                undefined, // onProgress
                undefined, // onComplete
                undefined, // onError
              );
              
              // Check if progress API explicitly reported failure
              // If result is undefined/null or success is false, fallback to basic API
              if (!result || result.success === false) {
                if (bridge.writeSftpBinary) {
                  await bridge.writeSftpBinary(sftpId, targetPath, arrayBuffer);
                } else {
                  throw new Error("Upload failed and no fallback method available");
                }
              }
            } else if (bridge.writeSftpBinary) {
              // Progress API not available, use basic API
              await bridge.writeSftpBinary(sftpId, targetPath, arrayBuffer);
            } else {
              throw new Error("No SFTP write method available");
            }
          }
          
          results.push({ fileName: file.name, success: true });
        } catch (error) {
          logger.error(`Failed to upload ${file.name}:`, error);
          results.push({
            fileName: file.name,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      
      // Refresh the file list to show new files
      await refresh(side);
      
      return results;
    },
    [getActivePane, refresh],
  );

  // Select an application from system file picker
  const selectApplication = useCallback(
    async (): Promise<{ path: string; name: string } | null> => {
      const bridge = netcattyBridge.get();
      if (!bridge?.selectApplication) {
        return null;
      }
      return await bridge.selectApplication();
    },
    [],
  );

  // Store methods in a ref to create stable wrapper functions
  // This prevents callback reference changes from causing re-renders in consumers
  const methodsRef = useRef({
    getFilteredFiles,
    addTab,
    closeTab,
    selectTab,
    reorderTabs,
    moveTabToOtherSide,
    getTabsInfo,
    getActiveTabId,
    getActivePane,
    connect,
    disconnect,
    navigateTo,
    navigateUp,
    refresh,
    openEntry,
    toggleSelection,
    rangeSelect,
    clearSelection,
    selectAll,
    setFilter,
    createDirectory,
    deleteFiles,
    renameFile,
    changePermissions,
    readTextFile,
    readBinaryFile,
    writeTextFile,
    downloadToTempAndOpen,
    uploadExternalFiles,
    selectApplication,
    startTransfer,
    cancelTransfer,
    retryTransfer,
    clearCompletedTransfers,
    dismissTransfer,
    resolveConflict,
  });
  methodsRef.current = {
    getFilteredFiles,
    addTab,
    closeTab,
    selectTab,
    reorderTabs,
    moveTabToOtherSide,
    getTabsInfo,
    getActiveTabId,
    getActivePane,
    connect,
    disconnect,
    navigateTo,
    navigateUp,
    refresh,
    openEntry,
    toggleSelection,
    rangeSelect,
    clearSelection,
    selectAll,
    setFilter,
    createDirectory,
    deleteFiles,
    renameFile,
    changePermissions,
    readTextFile,
    readBinaryFile,
    writeTextFile,
    downloadToTempAndOpen,
    uploadExternalFiles,
    selectApplication,
    startTransfer,
    cancelTransfer,
    retryTransfer,
    clearCompletedTransfers,
    dismissTransfer,
    resolveConflict,
  };

  // Create stable method wrappers that call through methodsRef
  // These are created once and never change reference
  const stableMethods = useMemo(() => ({
    getFilteredFiles: (...args: Parameters<typeof getFilteredFiles>) => methodsRef.current.getFilteredFiles(...args),
    addTab: (...args: Parameters<typeof addTab>) => methodsRef.current.addTab(...args),
    closeTab: (...args: Parameters<typeof closeTab>) => methodsRef.current.closeTab(...args),
    selectTab: (...args: Parameters<typeof selectTab>) => methodsRef.current.selectTab(...args),
    reorderTabs: (...args: Parameters<typeof reorderTabs>) => methodsRef.current.reorderTabs(...args),
    moveTabToOtherSide: (...args: Parameters<typeof moveTabToOtherSide>) => methodsRef.current.moveTabToOtherSide(...args),
    getTabsInfo: (...args: Parameters<typeof getTabsInfo>) => methodsRef.current.getTabsInfo(...args),
    getActiveTabId: (...args: Parameters<typeof getActiveTabId>) => methodsRef.current.getActiveTabId(...args),
    getActivePane: (...args: Parameters<typeof getActivePane>) => methodsRef.current.getActivePane(...args),
    connect: (...args: Parameters<typeof connect>) => methodsRef.current.connect(...args),
    disconnect: (...args: Parameters<typeof disconnect>) => methodsRef.current.disconnect(...args),
    navigateTo: (...args: Parameters<typeof navigateTo>) => methodsRef.current.navigateTo(...args),
    navigateUp: (...args: Parameters<typeof navigateUp>) => methodsRef.current.navigateUp(...args),
    refresh: (...args: Parameters<typeof refresh>) => methodsRef.current.refresh(...args),
    openEntry: (...args: Parameters<typeof openEntry>) => methodsRef.current.openEntry(...args),
    toggleSelection: (...args: Parameters<typeof toggleSelection>) => methodsRef.current.toggleSelection(...args),
    rangeSelect: (...args: Parameters<typeof rangeSelect>) => methodsRef.current.rangeSelect(...args),
    clearSelection: (...args: Parameters<typeof clearSelection>) => methodsRef.current.clearSelection(...args),
    selectAll: (...args: Parameters<typeof selectAll>) => methodsRef.current.selectAll(...args),
    setFilter: (...args: Parameters<typeof setFilter>) => methodsRef.current.setFilter(...args),
    createDirectory: (...args: Parameters<typeof createDirectory>) => methodsRef.current.createDirectory(...args),
    deleteFiles: (...args: Parameters<typeof deleteFiles>) => methodsRef.current.deleteFiles(...args),
    renameFile: (...args: Parameters<typeof renameFile>) => methodsRef.current.renameFile(...args),
    changePermissions: (...args: Parameters<typeof changePermissions>) => methodsRef.current.changePermissions(...args),
    readTextFile: (...args: Parameters<typeof readTextFile>) => methodsRef.current.readTextFile(...args),
    readBinaryFile: (...args: Parameters<typeof readBinaryFile>) => methodsRef.current.readBinaryFile(...args),
    writeTextFile: (...args: Parameters<typeof writeTextFile>) => methodsRef.current.writeTextFile(...args),
    downloadToTempAndOpen: (...args: Parameters<typeof downloadToTempAndOpen>) => methodsRef.current.downloadToTempAndOpen(...args),
    uploadExternalFiles: (...args: Parameters<typeof uploadExternalFiles>) => methodsRef.current.uploadExternalFiles(...args),
    selectApplication: () => methodsRef.current.selectApplication(),
    startTransfer: (...args: Parameters<typeof startTransfer>) => methodsRef.current.startTransfer(...args),
    cancelTransfer: (...args: Parameters<typeof cancelTransfer>) => methodsRef.current.cancelTransfer(...args),
    retryTransfer: (...args: Parameters<typeof retryTransfer>) => methodsRef.current.retryTransfer(...args),
    clearCompletedTransfers: () => methodsRef.current.clearCompletedTransfers(),
    dismissTransfer: (...args: Parameters<typeof dismissTransfer>) => methodsRef.current.dismissTransfer(...args),
    resolveConflict: (...args: Parameters<typeof resolveConflict>) => methodsRef.current.resolveConflict(...args),
  }), []); // Empty deps - these wrappers never change

  // Return object with stable method references but reactive state
  // State changes will cause re-renders, but method references stay stable
  return useMemo(() => ({
    // Reactive state - changes trigger re-renders
    leftPane,
    rightPane,
    leftTabs,
    rightTabs,
    transfers,
    activeTransfersCount,
    conflicts,

    // Stable methods - never change reference
    ...stableMethods,

    // Pure helper functions (these are defined at module level, always stable)
    formatFileSize,
    formatDate,
    getFileExtension,
    joinPath,
    getParentPath,
    getFileName,
  }), [
    // Only state in deps - methods come from stableMethods which is stable
    leftPane,
    rightPane,
    leftTabs,
    rightTabs,
    transfers,
    activeTransfersCount,
    conflicts,
    stableMethods,
  ]);
};

