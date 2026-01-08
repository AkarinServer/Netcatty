/**
 * Hook for auto-starting port forwarding rules on app launch.
 * This should be used at the App level to ensure auto-start happens
 * when the application starts, not when the user navigates to the port forwarding page.
 */
import { useEffect, useRef } from "react";
import { Host, PortForwardingRule } from "../../domain/models";
import { STORAGE_KEY_PORT_FORWARDING } from "../../infrastructure/config/storageKeys";
import { localStorageAdapter } from "../../infrastructure/persistence/localStorageAdapter";
import {
  getActiveConnection,
  setReconnectCallback,
  startPortForward,
  syncWithBackend,
} from "../../infrastructure/services/portForwardingService";
import { logger } from "../../lib/logger";

export interface UsePortForwardingAutoStartOptions {
  hosts: Host[];
  keys: { id: string; privateKey: string }[];
}

/**
 * Auto-starts port forwarding rules that have autoStart enabled.
 * This hook should be called at the App level to run on app launch.
 */
export const usePortForwardingAutoStart = ({
  hosts,
  keys,
}: UsePortForwardingAutoStartOptions): void => {
  const autoStartExecutedRef = useRef(false);
  const hostsRef = useRef<Host[]>(hosts);
  const keysRef = useRef<{ id: string; privateKey: string }[]>(keys);

  // Keep refs in sync
  useEffect(() => {
    hostsRef.current = hosts;
  }, [hosts]);

  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);

  // Set up the reconnect callback
  useEffect(() => {
    const handleReconnect = async (
      ruleId: string,
      onStatusChange: (status: PortForwardingRule["status"], error?: string) => void,
    ) => {
      // Load the current rules from storage
      const rules = localStorageAdapter.read<PortForwardingRule[]>(
        STORAGE_KEY_PORT_FORWARDING,
      ) ?? [];
      
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule || !rule.hostId) {
        return { success: false, error: "Rule or host not found" };
      }

      const host = hostsRef.current.find((h) => h.id === rule.hostId);
      if (!host) {
        return { success: false, error: "Host not found" };
      }

      return startPortForward(rule, host, keysRef.current, onStatusChange, true);
    };

    setReconnectCallback(handleReconnect);
    return () => {
      setReconnectCallback(null);
    };
  }, []);

  // Auto-start rules on app launch
  useEffect(() => {
    if (autoStartExecutedRef.current) return;
    if (hosts.length === 0) return;

    const runAutoStart = async () => {
      // First sync with backend to get any active tunnels
      await syncWithBackend();
      
      // Load rules from storage
      const rules = localStorageAdapter.read<PortForwardingRule[]>(
        STORAGE_KEY_PORT_FORWARDING,
      ) ?? [];

      // Only start rules that are not already active
      const autoStartRules = rules.filter((r) => {
        if (!r.autoStart || !r.hostId) return false;
        // Check if there's an active connection for this rule
        const conn = getActiveConnection(r.id);
        // Only start if not already connecting or active
        return !conn || conn.status === 'inactive' || conn.status === 'error';
      });

      if (autoStartRules.length === 0) return;

      autoStartExecutedRef.current = true;
      logger.info(`[PortForwardingAutoStart] Starting ${autoStartRules.length} auto-start rules`);

      // Start each auto-start rule
      for (const rule of autoStartRules) {
        const host = hosts.find((h) => h.id === rule.hostId);
        if (host) {
          void startPortForward(
            rule,
            host,
            keys,
            (status, error) => {
              // Update the rule status in storage
              const currentRules = localStorageAdapter.read<PortForwardingRule[]>(
                STORAGE_KEY_PORT_FORWARDING,
              ) ?? [];
              
              const updatedRules = currentRules.map((r) =>
                r.id === rule.id
                  ? {
                      ...r,
                      status,
                      error,
                      lastUsedAt: status === "active" ? Date.now() : r.lastUsedAt,
                    }
                  : r,
              );
              
              localStorageAdapter.write(STORAGE_KEY_PORT_FORWARDING, updatedRules);
            },
            true, // Enable reconnect for auto-start rules
          );
        }
      }
    };

    void runAutoStart();
  }, [hosts, keys]);
};
