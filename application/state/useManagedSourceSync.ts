import { useCallback, useEffect, useRef } from "react";
import { Host, ManagedSource } from "../../domain/models";
import { serializeHostsToSshConfig } from "../../domain/sshConfigSerializer";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge";

export interface UseManagedSourceSyncOptions {
  hosts: Host[];
  managedSources: ManagedSource[];
  onUpdateManagedSources: (sources: ManagedSource[]) => void;
}

export const useManagedSourceSync = ({
  hosts,
  managedSources,
  onUpdateManagedSources,
}: UseManagedSourceSyncOptions) => {
  const previousHostsRef = useRef<Host[]>([]);
  const syncInProgressRef = useRef(false);

  const getManagedHostsForSource = useCallback(
    (sourceId: string) => {
      return hosts.filter((h) => h.managedSourceId === sourceId);
    },
    [hosts],
  );

  const writeSshConfigToFile = useCallback(
    async (source: ManagedSource, managedHosts: Host[]) => {
      console.log(`[ManagedSourceSync] writeSshConfigToFile called for ${source.groupName}, hosts:`, managedHosts.length);
      
      const bridge = netcattyBridge.get();
      if (!bridge?.writeLocalFile) {
        console.warn("[ManagedSourceSync] writeLocalFile not available");
        return false;
      }

      try {
        const content = serializeHostsToSshConfig(managedHosts);
        console.log(`[ManagedSourceSync] Serialized content (${content.length} chars):`, content.substring(0, 200));
        
        const encoder = new TextEncoder();
        const buffer = encoder.encode(content);
        console.log(`[ManagedSourceSync] Writing to ${source.filePath}`);
        
        await bridge.writeLocalFile(source.filePath, buffer.buffer as ArrayBuffer);
        console.log(`[ManagedSourceSync] Write successful`);
        return true;
      } catch (err) {
        console.error("[ManagedSourceSync] Failed to write SSH config:", err);
        return false;
      }
    },
    [],
  );

  const syncManagedSource = useCallback(
    async (source: ManagedSource) => {
      const managedHosts = getManagedHostsForSource(source.id);
      const success = await writeSshConfigToFile(source, managedHosts);

      if (success) {
        const updatedSources = managedSources.map((s) =>
          s.id === source.id ? { ...s, lastSyncedAt: Date.now() } : s,
        );
        onUpdateManagedSources(updatedSources);
      }

      return success;
    },
    [getManagedHostsForSource, managedSources, onUpdateManagedSources, writeSshConfigToFile],
  );

  const unmanageSource = useCallback(
    (sourceId: string) => {
      const updatedSources = managedSources.filter((s) => s.id !== sourceId);
      onUpdateManagedSources(updatedSources);
    },
    [managedSources, onUpdateManagedSources],
  );

  const pendingSyncRef = useRef(false);
  const checkAndSyncRef = useRef<() => void>(() => {});

  const checkAndSync = useCallback(() => {
    if (managedSources.length === 0) return;

    const prevHosts = previousHostsRef.current;
    previousHostsRef.current = hosts;

    if (prevHosts.length === 0) return;

    const changedSourceIds = new Set<string>();

    for (const source of managedSources) {
      const prevManaged = prevHosts.filter((h) => h.managedSourceId === source.id);
      const currManaged = hosts.filter((h) => h.managedSourceId === source.id);

      console.log(`[ManagedSourceSync] Source ${source.groupName}: prev=${prevManaged.length}, curr=${currManaged.length}`);

      if (prevManaged.length !== currManaged.length) {
        changedSourceIds.add(source.id);
        continue;
      }

      const prevMap = new Map<string, Host>(prevManaged.map((h) => [h.id, h]));
      for (const curr of currManaged) {
        const prev = prevMap.get(curr.id);
        if (!prev) {
          changedSourceIds.add(source.id);
          break;
        }
        const hasChanged =
          prev.hostname !== curr.hostname ||
          prev.port !== curr.port ||
          prev.username !== curr.username ||
          prev.label !== curr.label ||
          prev.group !== curr.group ||
          prev.protocol !== curr.protocol;
        if (hasChanged) {
          changedSourceIds.add(source.id);
          break;
        }
      }
    }

    if (changedSourceIds.size > 0) {
      console.log(`[ManagedSourceSync] Syncing sources:`, Array.from(changedSourceIds));
      syncInProgressRef.current = true;

      Promise.all(
        managedSources
          .filter((s) => changedSourceIds.has(s.id))
          .map(syncManagedSource),
      ).finally(() => {
        syncInProgressRef.current = false;
        // Check if there were changes during sync that need to be processed
        // Use ref to get the latest checkAndSync to avoid stale closure
        if (pendingSyncRef.current) {
          pendingSyncRef.current = false;
          checkAndSyncRef.current();
        }
      });
    }
  }, [hosts, managedSources, syncManagedSource]);

  // Keep ref updated with the latest checkAndSync
  checkAndSyncRef.current = checkAndSync;

  useEffect(() => {
    if (syncInProgressRef.current) {
      // Mark that we need to re-sync after current sync completes
      pendingSyncRef.current = true;
      return;
    }
    checkAndSync();
  }, [hosts, managedSources, checkAndSync]);

  return {
    syncManagedSource,
    unmanageSource,
    getManagedHostsForSource,
  };
};
