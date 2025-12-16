import { useCallback } from "react";
import { netcattyBridge } from "../../infrastructure/services/netcattyBridge";

export type ApplicationInfo = {
  name: string;
  version: string;
  platform: string;
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

  return { openExternal, getApplicationInfo };
};

