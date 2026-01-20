import { useCallback } from "react";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge";

export type ApplicationInfo = {
  name: string;
  version: string;
  platform: string;
};

export type SshAgentStatus = {
  running: boolean;
  startupType: string | null;
  error: string | null;
};

export const useApplicationBackend = () => {
  const openExternal = useCallback(async (url: string) => {
    try {
      const bridge = netcattyBridge.get();
      if (bridge?.openExternal) {
        await bridge.openExternal(url);
        return;
      }
    } catch {
      // Ignore and fall back below
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const getApplicationInfo = useCallback(async (): Promise<ApplicationInfo | null> => {
    const bridge = netcattyBridge.get();
    const info = await bridge?.getAppInfo?.();
    return info ?? null;
  }, []);

  const checkSshAgent = useCallback(async (): Promise<SshAgentStatus | null> => {
    const bridge = netcattyBridge.get();
    const status = await bridge?.checkSshAgent?.();
    return status ?? null;
  }, []);

  return { openExternal, getApplicationInfo, checkSshAgent };
};

