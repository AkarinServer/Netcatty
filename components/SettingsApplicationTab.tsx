import React, { useEffect, useMemo, useState } from "react";
import { Bug, Github, MessageCircle, Newspaper, RefreshCcw } from "lucide-react";
import AppLogo from "./AppLogo";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { useApplicationBackend } from "../application/state/useApplicationBackend";
import { useI18n } from "../application/i18n/I18nProvider";
import { SettingsTabContent } from "./settings/settings-ui";

type AppInfo = {
    name: string;
    version: string;
    platform?: string;
};

const REPO_URL = "https://github.com/binaricat/Netcatty";

const buildIssueUrl = (appInfo: AppInfo) => {
    const title = "Bug: ";
    const bodyLines = [
        "## Describe the problem",
        "",
        "## Steps to reproduce",
        "1.",
        "",
        "## Expected behavior",
        "",
        "## Actual behavior",
        "",
        "## Environment",
        `- App: ${appInfo.name} ${appInfo.version}`,
        `- Platform: ${appInfo.platform || "unknown"}`,
        `- UA: ${typeof navigator !== "undefined" ? navigator.userAgent : "unknown"}`,
    ];
    const params = new URLSearchParams({
        title,
        body: bodyLines.join("\n"),
    });
    return `${REPO_URL}/issues/new?${params.toString()}`;
};

const ActionRow: React.FC<{
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onClick: () => void;
}> = ({ icon, title, subtitle, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            "w-full flex items-center gap-3 rounded-lg px-3 py-3 text-left",
            "hover:bg-muted/50 transition-colors"
        )}
    >
        <div className="shrink-0 text-muted-foreground">{icon}</div>
        <div className="min-w-0">
            <div className="text-sm font-medium leading-tight">{title}</div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</div>
        </div>
    </button>
);

export default function SettingsApplicationTab() {
    const { t } = useI18n();
    const { openExternal, getApplicationInfo } = useApplicationBackend();
    const [appInfo, setAppInfo] = useState<AppInfo>({ name: "Netcatty", version: "" });

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const info = await getApplicationInfo();
                if (!cancelled && info?.name && typeof info?.version === "string") {
                    setAppInfo(info);
                }
            } catch {
                // Ignore: running in browser/dev without Electron bridge
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [getApplicationInfo]);

    const issueUrl = useMemo(() => buildIssueUrl(appInfo), [appInfo]);
    const releasesUrl = `${REPO_URL}/releases`;
  const discussionsUrl = `${REPO_URL}/discussions`;

  return (
    <SettingsTabContent value="application">
      <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
        <div className="lg:w-[320px] shrink-0">
          <div className="flex items-center gap-4">
            <AppLogo className="w-16 h-16" />
            <div>
              <div className="text-3xl font-semibold leading-none">{appInfo.name}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {appInfo.version ? appInfo.version : " "}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Button variant="secondary" className="gap-2" onClick={() => void openExternal(releasesUrl)}>
              <RefreshCcw size={16} />
              {t("settings.application.checkUpdates")}
            </Button>
          </div>
        </div>

        <div className="flex-1">
          <div className="space-y-2">
            <ActionRow
              icon={<Bug size={18} />}
              title={t("settings.application.reportProblem")}
              subtitle={t("settings.application.reportProblem.subtitle")}
              onClick={() => void openExternal(issueUrl)}
            />
            <ActionRow
              icon={<MessageCircle size={18} />}
              title={t("settings.application.community")}
              subtitle={t("settings.application.community.subtitle")}
              onClick={() => void openExternal(discussionsUrl)}
            />
            <ActionRow
              icon={<Github size={18} />}
              title="GitHub"
              subtitle={t("settings.application.github.subtitle")}
              onClick={() => void openExternal(REPO_URL)}
            />
            <ActionRow
              icon={<Newspaper size={18} />}
              title={t("settings.application.whatsNew")}
              subtitle={t("settings.application.whatsNew.subtitle")}
              onClick={() => void openExternal(releasesUrl)}
            />
          </div>
        </div>
      </div>
    </SettingsTabContent>
  );
}
