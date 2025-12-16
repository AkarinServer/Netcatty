import React, { useCallback } from "react";
import type { Host, Snippet, SSHKey } from "../../../domain/models";
import type { SyncPayload } from "../../../domain/sync";
import { CloudSyncSettings } from "../../CloudSyncSettings";
import { SettingsTabContent } from "../settings-ui";

export default function SettingsSyncTab(props: {
  hosts: Host[];
  keys: SSHKey[];
  snippets: Snippet[];
  importDataFromString: (data: string) => void;
}) {
  const { hosts, keys, snippets, importDataFromString } = props;

  const buildSyncPayload = useCallback((): SyncPayload => {
    return {
      hosts,
      keys,
      snippets,
      customGroups: [],
      syncedAt: Date.now(),
    };
  }, [hosts, keys, snippets]);

  const applySyncPayload = useCallback(
    (payload: SyncPayload) => {
      importDataFromString(
        JSON.stringify({
          hosts: payload.hosts,
          keys: payload.keys,
          snippets: payload.snippets,
          customGroups: payload.customGroups,
        }),
      );
    },
    [importDataFromString],
  );

  return (
    <SettingsTabContent value="sync">
      <CloudSyncSettings onBuildPayload={buildSyncPayload} onApplyPayload={applySyncPayload} />
    </SettingsTabContent>
  );
}

