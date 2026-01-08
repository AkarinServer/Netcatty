import { useCallback, useEffect, useMemo, useState } from "react";
import { Host, PortForwardingRule } from "../../domain/models";
import {
  STORAGE_KEY_PF_PREFER_FORM_MODE,
  STORAGE_KEY_PF_VIEW_MODE,
  STORAGE_KEY_PORT_FORWARDING,
} from "../../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";
import {
  clearReconnectTimer,
  getActiveConnection,
  getActiveRuleIds,
  startPortForward,
  stopPortForward,
  syncWithBackend,
} from "../../infrastructure/services/portForwardingService";
import { useStoredViewMode, ViewMode } from "./useStoredViewMode";

export type { ViewMode };

export type SortMode = "az" | "za" | "newest" | "oldest";

export interface UsePortForwardingStateResult {
  rules: PortForwardingRule[];
  selectedRuleId: string | null;
  viewMode: ViewMode;
  sortMode: SortMode;
  search: string;
  preferFormMode: boolean;

  setSelectedRuleId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSortMode: (mode: SortMode) => void;
  setSearch: (query: string) => void;
  setPreferFormMode: (prefer: boolean) => void;

  addRule: (
    rule: Omit<PortForwardingRule, "id" | "createdAt" | "status">,
  ) => PortForwardingRule;
  updateRule: (id: string, updates: Partial<PortForwardingRule>) => void;
  deleteRule: (id: string) => void;
  duplicateRule: (id: string) => void;

  setRuleStatus: (
    id: string,
    status: PortForwardingRule["status"],
    error?: string,
  ) => void;

  startTunnel: (
    rule: PortForwardingRule,
    host: Host,
    keys: { id: string; privateKey: string }[],
    onStatusChange?: (status: PortForwardingRule["status"], error?: string) => void,
    enableReconnect?: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  stopTunnel: (
    ruleId: string,
    onStatusChange?: (status: PortForwardingRule["status"]) => void,
  ) => Promise<{ success: boolean; error?: string }>;

  filteredRules: PortForwardingRule[];
  selectedRule: PortForwardingRule | undefined;
}

export const usePortForwardingState = (): UsePortForwardingStateResult => {
  const [rules, setRules] = useState<PortForwardingRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useStoredViewMode(
    STORAGE_KEY_PF_VIEW_MODE,
    "grid",
  );
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [search, setSearch] = useState("");
  const [preferFormMode, setPreferFormModeState] = useState<boolean>(() => {
    return localStorageAdapter.readBoolean(STORAGE_KEY_PF_PREFER_FORM_MODE) ?? false;
  });

  const setPreferFormMode = useCallback((prefer: boolean) => {
    setPreferFormModeState(prefer);
    localStorageAdapter.writeBoolean(STORAGE_KEY_PF_PREFER_FORM_MODE, prefer);
  }, []);

  // Load rules from storage on mount and sync with backend
  useEffect(() => {
    const loadAndSync = async () => {
      // First, sync with backend to get any active tunnels
      await syncWithBackend();
      
      const saved = localStorageAdapter.read<PortForwardingRule[]>(
        STORAGE_KEY_PORT_FORWARDING,
      );
      if (saved && Array.isArray(saved)) {
        // Sync status with active connections in the service layer
        const _activeRuleIds = getActiveRuleIds();
        const withSyncedStatus = saved.map((r) => {
          const conn = getActiveConnection(r.id);
          if (conn) {
            // This rule has an active connection, preserve its status
            return { ...r, status: conn.status, error: conn.error };
          }
          // No active connection, reset to inactive
          return { ...r, status: "inactive" as const, error: undefined };
        });
        setRules(withSyncedStatus);
      }
    };
    
    void loadAndSync();
  }, []);

  // Persist rules to storage whenever they change
  const persistRules = useCallback((updatedRules: PortForwardingRule[]) => {
    localStorageAdapter.write(STORAGE_KEY_PORT_FORWARDING, updatedRules);
  }, []);

  const addRule = useCallback(
    (
      rule: Omit<PortForwardingRule, "id" | "createdAt" | "status">,
    ): PortForwardingRule => {
      const newRule: PortForwardingRule = {
        ...rule,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        status: "inactive",
      };
      setRules((prev) => {
        const updated = [...prev, newRule];
        persistRules(updated);
        return updated;
      });
      setSelectedRuleId(newRule.id);
      return newRule;
    },
    [persistRules],
  );

  const updateRule = useCallback(
    (id: string, updates: Partial<PortForwardingRule>) => {
      setRules((prev) => {
        const updated = prev.map((r) =>
          r.id === id ? { ...r, ...updates } : r,
        );
        persistRules(updated);
        return updated;
      });
    },
    [persistRules],
  );

  const deleteRule = useCallback(
    (id: string) => {
      setRules((prev) => {
        const updated = prev.filter((r) => r.id !== id);
        persistRules(updated);
        return updated;
      });
      if (selectedRuleId === id) {
        setSelectedRuleId(null);
      }
    },
    [selectedRuleId, persistRules],
  );

  const duplicateRule = useCallback(
    (id: string) => {
      const original = rules.find((r) => r.id === id);
      if (!original) return;

      const copy: PortForwardingRule = {
        ...original,
        id: crypto.randomUUID(),
        label: `${original.label} (Copy)`,
        createdAt: Date.now(),
        status: "inactive",
        error: undefined,
        lastUsedAt: undefined,
      };
      setRules((prev) => {
        const updated = [...prev, copy];
        persistRules(updated);
        return updated;
      });
      setSelectedRuleId(copy.id);
    },
    [rules, persistRules],
  );

  const setRuleStatus = useCallback(
    (id: string, status: PortForwardingRule["status"], error?: string) => {
      setRules((prev) => {
        const updated = prev.map((r) => {
          if (r.id !== id) return r;
          return {
            ...r,
            status,
            error,
            lastUsedAt: status === "active" ? Date.now() : r.lastUsedAt,
          };
        });
        persistRules(updated);
        return updated;
      });
    },
    [persistRules],
  );

  const startTunnel = useCallback(
    async (
      rule: PortForwardingRule,
      host: Host,
      keys: { id: string; privateKey: string }[],
      onStatusChange?: (
        status: PortForwardingRule["status"],
        error?: string,
      ) => void,
      enableReconnect = false,
    ) => {
      return startPortForward(rule, host, keys, (status, error) => {
        setRuleStatus(rule.id, status, error);
        onStatusChange?.(status, error ?? undefined);
      }, enableReconnect);
    },
    [setRuleStatus],
  );

  const stopTunnel = useCallback(
    async (
      ruleId: string,
      onStatusChange?: (status: PortForwardingRule["status"]) => void,
    ) => {
      // Clear any pending reconnect timer when manually stopping
      clearReconnectTimer(ruleId);
      return stopPortForward(ruleId, (status) => {
        setRuleStatus(ruleId, status);
        onStatusChange?.(status);
      });
    },
    [setRuleStatus],
  );

  // Filter and sort rules
  const filteredRules = useMemo(() => {
    let result = [...rules];

    // Filter by search
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.label.toLowerCase().includes(s) ||
          r.type.toLowerCase().includes(s) ||
          r.localPort.toString().includes(s) ||
          r.remoteHost?.toLowerCase().includes(s) ||
          r.remotePort?.toString().includes(s),
      );
    }

    // Sort
    switch (sortMode) {
      case "az":
        result.sort((a, b) => a.label.localeCompare(b.label));
        break;
      case "za":
        result.sort((a, b) => b.label.localeCompare(a.label));
        break;
      case "newest":
        result.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "oldest":
        result.sort((a, b) => a.createdAt - b.createdAt);
        break;
    }

    return result;
  }, [rules, search, sortMode]);

  const selectedRule = rules.find((r) => r.id === selectedRuleId);

  return {
    rules,
    selectedRuleId,
    viewMode,
    sortMode,
    search,
    preferFormMode,

    setSelectedRuleId,
    setViewMode,
    setSortMode,
    setSearch,
    setPreferFormMode,

    addRule,
    updateRule,
    deleteRule,
    duplicateRule,

    setRuleStatus,
    startTunnel,
    stopTunnel,

    filteredRules,
    selectedRule,
  };
};
