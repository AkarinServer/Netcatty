import React, { useCallback, useEffect, useMemo } from "react";
import { Button } from "./ui/button";
import { useSessionState } from "../application/state/useSessionState";
import { usePortForwardingState } from "../application/state/usePortForwardingState";
import { useVaultState } from "../application/state/useVaultState";
import { toast } from "./ui/toast";
import { cn } from "../lib/utils";
import { useI18n } from "../application/i18n/I18nProvider";
import { I18nProvider } from "../application/i18n/I18nProvider";
import { useSettingsState } from "../application/state/useSettingsState";
import { useTrayPanelBackend } from "../application/state/useTrayPanelBackend";
import { useActiveTabId } from "../application/state/activeTabStore";

const StatusDot: React.FC<{ status: "success" | "warning" | "error" | "neutral"; spinning?: boolean }> = ({
  status,
  spinning,
}) => {
  const color =
    status === "success"
      ? "bg-emerald-500"
      : status === "warning"
        ? "bg-amber-500"
        : status === "error"
          ? "bg-rose-500"
          : "bg-zinc-500";

  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        color,
        spinning ? "animate-spin" : "",
      )}
    />
  );
};

const TrayPanelContent: React.FC = () => {
  // debug
  console.log("[TrayPanel] render", JSON.stringify({ hash: window.location.hash }));
  const { t } = useI18n();
  const { hideTrayPanel, openMainWindow, onTrayPanelCloseRequest, onTrayPanelRefresh } = useTrayPanelBackend();

  const { hosts, keys } = useVaultState();
  const { sessions, setActiveTabId, connectToHost } = useSessionState();
  const { rules: portForwardingRules, startTunnel, stopTunnel } = usePortForwardingState();
  const activeTabId = useActiveTabId();

  const jumpableSessions = useMemo(
    () => sessions.filter((s) => s.status === "connected" || s.status === "connecting"),
    [sessions],
  );

  const recentHosts = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ hostId: string; label: string }> = [];
    for (let i = sessions.length - 1; i >= 0; i -= 1) {
      const s = sessions[i];
      if (!s.hostId) continue;
      if (s.hostId.startsWith("local-") || s.hostId.startsWith("serial-")) continue;
      if (seen.has(s.hostId)) continue;
      const host = hosts.find((h) => h.id === s.hostId);
      if (!host) continue;
      seen.add(s.hostId);
      result.push({ hostId: host.id, label: host.label || host.hostname });
      if (result.length >= 5) break;
    }
    return result;
  }, [hosts, sessions]);

  // debug
  console.log(
    "[TrayPanel] data",
    JSON.stringify({
      sessions: sessions.map((s) => ({ id: s.id, status: s.status, hostId: s.hostId, hostLabel: s.hostLabel })),
      jumpableCount: jumpableSessions.length,
      recentHosts,
      hostsCount: hosts.length,
      pfrCount: portForwardingRules.length,
    }),
  );

  useEffect(() => {
    const unsubscribe = onTrayPanelRefresh?.(() => {
      try {
        window.dispatchEvent(new Event("storage"));
      } catch {
        // ignore
      }
    });
    return () => unsubscribe?.();
  }, [onTrayPanelRefresh]);

  const keysForPf = useMemo(
    () => keys.map((k) => ({ id: k.id, privateKey: k.privateKey })),
    [keys],
  );

  const handleClose = useCallback(() => {
    void hideTrayPanel();
  }, [hideTrayPanel]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (document.body && !document.body.contains(target)) return;
      // Clicking on background should close panel
      const root = document.getElementById("tray-panel-root");
      if (root && !root.contains(target)) {
        handleClose();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [handleClose]);

  useEffect(() => {
    const unsubscribe = onTrayPanelCloseRequest(() => {
      handleClose();
    });
    return () => unsubscribe?.();
  }, [handleClose, onTrayPanelCloseRequest]);

  const handleOpenMain = useCallback(() => {
    void openMainWindow();
  }, [openMainWindow]);

  return (
    <div id="tray-panel-root" className="w-full h-full bg-background/95 backdrop-blur border border-border/60 rounded-lg shadow-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between app-no-drag">
        <div className="text-sm font-medium">Netcatty</div>
        <button
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={handleClose}
        >
          Esc
        </button>
      </div>

      <div className="p-2 space-y-3 text-sm">
        <button
          onClick={handleOpenMain}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-muted"
        >
          {t("tray.openMainWindow")}
        </button>

        {jumpableSessions.length > 0 && (
          <div>
            <div className="px-2 py-1 text-xs text-muted-foreground">{t("tray.sessions")}</div>
            <div className="space-y-1">
              {jumpableSessions.map((s) => (
                <button
                  key={s.id}
                  title={s.hostLabel || s.hostname}
                  onClick={() => {
                    setActiveTabId(s.id);
                    void openMainWindow();
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded hover:bg-muted",
                    s.status === "connected" ? "" : "text-muted-foreground",
                    activeTabId === s.id ? "bg-muted" : "",
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <StatusDot
                      status={s.status === "connected" ? "success" : s.status === "connecting" ? "warning" : "error"}
                      spinning={s.status === "connecting"}
                    />
                    <span className="truncate">{s.hostLabel || s.hostname}</span>
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">{t(`tray.status.${s.status}`)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {recentHosts.length > 0 && (
          <div>
            <div className="px-2 py-1 text-xs text-muted-foreground">{t("tray.recentHosts")}</div>
            <div className="space-y-1">
              {recentHosts.map((rh) => (
                <Button
                  key={rh.hostId}
                  variant="ghost"
                  className="w-full justify-start px-2 h-8"
                  title={rh.label}
                  onClick={() => {
                    const host = hosts.find((h) => h.id === rh.hostId);
                    if (!host) return;
                    connectToHost(host);
                    void openMainWindow();
                  }}
                >
                  <span className="truncate">{rh.label}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {portForwardingRules.length > 0 && (
          <div>
            <div className="px-2 py-1 text-xs text-muted-foreground">{t("tray.portForwarding")}</div>
            <div className="space-y-1">
              {portForwardingRules.map((rule) => {
                const isConnecting = rule.status === "connecting";
                const isActive = rule.status === "active";
                const label = rule.label || (rule.type === "dynamic"
                  ? `SOCKS:${rule.localPort}`
                  : `${rule.localPort} → ${rule.remoteHost}:${rule.remotePort}`);

                return (
                  <button
                    key={rule.id}
                    disabled={isConnecting}
                    title={label}
                    onClick={() => {
                      const host = rule.hostId ? hosts.find((h) => h.id === rule.hostId) : undefined;
                      if (!host) {
                        toast.error(t("pf.error.hostNotFound"));
                        return;
                      }
                      if (isActive) {
                        void stopTunnel(rule.id);
                      } else {
                        void startTunnel(rule, host, keysForPf, (status, error) => {
                          if (status === "error" && error) toast.error(error);
                        }, rule.autoStart);
                      }
                    }}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded hover:bg-muted flex items-center justify-between",
                      isConnecting ? "opacity-60" : "",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <StatusDot
                        status={
                          rule.status === "active"
                            ? "success"
                            : rule.status === "connecting"
                              ? "warning"
                              : rule.status === "error"
                                ? "error"
                                : "neutral"
                        }
                        spinning={rule.status === "connecting"}
                      />
                      <span className="truncate">{label}</span>
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t(`tray.status.${rule.status}`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TrayPanel: React.FC = () => {
  const settings = useSettingsState();
  return (
    <I18nProvider locale={settings.uiLanguage}>
      <TrayPanelContent />
    </I18nProvider>
  );
};

export default TrayPanel;
