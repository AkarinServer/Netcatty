import { useCallback, useEffect, useRef } from "react";
import { Host, ManagedSource } from "../../domain/models";
import { serializeHostsToSshConfig } from "../../domain/sshConfigSerializer";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge";

const MANAGED_BLOCK_BEGIN = "# BEGIN NETCATTY MANAGED - DO NOT EDIT THIS BLOCK";
const MANAGED_BLOCK_END = "# END NETCATTY MANAGED";

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
  // Keep a ref to the latest managedSources to avoid stale closure issues
  const managedSourcesRef = useRef(managedSources);
  managedSourcesRef.current = managedSources;

  const getManagedHostsForSource = useCallback(
    (sourceId: string) => {
      return hosts.filter((h) => h.managedSourceId === sourceId);
    },
    [hosts],
  );

  const readExistingFileContent = useCallback(
    async (filePath: string): Promise<string | null> => {
      const bridge = netcattyBridge.get();
      if (!bridge?.readLocalFile) {
        return null;
      }
      try {
        const buffer = await bridge.readLocalFile(filePath);
        const decoder = new TextDecoder();
        return decoder.decode(buffer);
      } catch {
        // File might not exist yet
        return null;
      }
    },
    [],
  );

  const mergeWithExistingContent = useCallback(
    (existingContent: string | null, managedContent: string): string => {
      if (!existingContent) {
        // No existing file, just wrap the managed content
        return `${MANAGED_BLOCK_BEGIN}\n${managedContent}${MANAGED_BLOCK_END}\n`;
      }

      const beginIndex = existingContent.indexOf(MANAGED_BLOCK_BEGIN);
      const endIndex = existingContent.indexOf(MANAGED_BLOCK_END);

      if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
        // No existing managed block, append at the end
        const trimmed = existingContent.trimEnd();
        return `${trimmed}\n\n${MANAGED_BLOCK_BEGIN}\n${managedContent}${MANAGED_BLOCK_END}\n`;
      }

      // Replace the existing managed block
      const before = existingContent.substring(0, beginIndex);
      const after = existingContent.substring(endIndex + MANAGED_BLOCK_END.length);
      return `${before}${MANAGED_BLOCK_BEGIN}\n${managedContent}${MANAGED_BLOCK_END}${after}`;
    },
    [],
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
        // Read existing file content to preserve non-managed parts
        const existingContent = await readExistingFileContent(source.filePath);

        // Pass all hosts for ProxyJump resolution (jump hosts may be outside this managed source)
        const managedContent = serializeHostsToSshConfig(managedHosts, hosts);
        console.log(`[ManagedSourceSync] Serialized content (${managedContent.length} chars):`, managedContent.substring(0, 200));

        // Merge with existing content, preserving non-managed parts
        const finalContent = mergeWithExistingContent(existingContent, managedContent);

        const encoder = new TextEncoder();
        const buffer = encoder.encode(finalContent);
        console.log(`[ManagedSourceSync] Writing to ${source.filePath}`);

        await bridge.writeLocalFile(source.filePath, buffer.buffer as ArrayBuffer);
        console.log(`[ManagedSourceSync] Write successful`);
        return true;
      } catch (err) {
        console.error("[ManagedSourceSync] Failed to write SSH config:", err);
        return false;
      }
    },
    [readExistingFileContent, mergeWithExistingContent, hosts],
  );

  const syncManagedSource = useCallback(
    async (source: ManagedSource) => {
      const managedHosts = getManagedHostsForSource(source.id);
      const success = await writeSshConfigToFile(source, managedHosts);

      if (success) {
        // Use ref to get the latest managedSources to avoid overwriting concurrent changes
        const currentSources = managedSourcesRef.current;
        // Only update if the source still exists (wasn't removed during sync)
        if (currentSources.some(s => s.id === source.id)) {
          const updatedSources = currentSources.map((s) =>
            s.id === source.id ? { ...s, lastSyncedAt: Date.now() } : s,
          );
          onUpdateManagedSources(updatedSources);
        }
      }

      return success;
    },
    [getManagedHostsForSource, onUpdateManagedSources, writeSshConfigToFile],
  );

  const unmanageSource = useCallback(
    (sourceId: string) => {
      const updatedSources = managedSourcesRef.current.filter((s) => s.id !== sourceId);
      onUpdateManagedSources(updatedSources);
    },
    [onUpdateManagedSources],
  );

  // Clear the managed block in the SSH config file and then remove the source
  // This should be called before deleting a managed group to avoid stale entries
  const clearAndRemoveSource = useCallback(
    async (source: ManagedSource) => {
      console.log(`[ManagedSourceSync] Clearing managed block for ${source.groupName}`);
      // Write empty hosts list to clear the managed block
      const success = await writeSshConfigToFile(source, []);
      if (success) {
        console.log(`[ManagedSourceSync] Managed block cleared, removing source`);
      }
      // Remove the source regardless of write success
      const updatedSources = managedSourcesRef.current.filter((s) => s.id !== source.id);
      onUpdateManagedSources(updatedSources);
      return success;
    },
    [onUpdateManagedSources, writeSshConfigToFile],
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
    clearAndRemoveSource,
    getManagedHostsForSource,
  };
};
