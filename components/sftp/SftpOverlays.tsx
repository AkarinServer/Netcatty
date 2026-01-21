import React from "react";
import type { Host, SftpFileEntry } from "../../types";
import type { FileOpenerType, SystemAppInfo } from "../../lib/sftpFileUtils";
import type { useSftpState } from "../../application/state/useSftpState";
import { Button } from "../ui/button";
import FileOpenerDialog from "../FileOpenerDialog";
import TextEditorModal from "../TextEditorModal";
import { SftpConflictDialog, SftpHostPicker, SftpPermissionsDialog, SftpTransferItem } from "./index";

type SftpState = ReturnType<typeof useSftpState>;

interface SftpOverlaysProps {
  hosts: Host[];
  sftp: SftpState;
  visibleTransfers: SftpState["transfers"];
  showHostPickerLeft: boolean;
  showHostPickerRight: boolean;
  hostSearchLeft: string;
  hostSearchRight: string;
  setShowHostPickerLeft: (open: boolean) => void;
  setShowHostPickerRight: (open: boolean) => void;
  setHostSearchLeft: (value: string) => void;
  setHostSearchRight: (value: string) => void;
  handleHostSelectLeft: (host: Host | "local") => void;
  handleHostSelectRight: (host: Host | "local") => void;
  permissionsState: { file: SftpFileEntry; side: "left" | "right" } | null;
  setPermissionsState: (state: { file: SftpFileEntry; side: "left" | "right" } | null) => void;
  showTextEditor: boolean;
  setShowTextEditor: (open: boolean) => void;
  textEditorTarget: { file: SftpFileEntry; side: "left" | "right"; fullPath: string } | null;
  setTextEditorTarget: (target: { file: SftpFileEntry; side: "left" | "right"; fullPath: string } | null) => void;
  textEditorContent: string;
  setTextEditorContent: (content: string) => void;
  handleSaveTextFile: (content: string) => Promise<void>;
  showFileOpenerDialog: boolean;
  setShowFileOpenerDialog: (open: boolean) => void;
  fileOpenerTarget: { file: SftpFileEntry; side: "left" | "right"; fullPath: string } | null;
  setFileOpenerTarget: (target: { file: SftpFileEntry; side: "left" | "right"; fullPath: string } | null) => void;
  handleFileOpenerSelect: (openerType: FileOpenerType, setAsDefault: boolean, systemApp?: SystemAppInfo) => void;
  handleSelectSystemApp: (systemApp: { path: string; name: string }) => void;
}

export const SftpOverlays: React.FC<SftpOverlaysProps> = ({
  hosts,
  sftp,
  visibleTransfers,
  showHostPickerLeft,
  showHostPickerRight,
  hostSearchLeft,
  hostSearchRight,
  setShowHostPickerLeft,
  setShowHostPickerRight,
  setHostSearchLeft,
  setHostSearchRight,
  handleHostSelectLeft,
  handleHostSelectRight,
  permissionsState,
  setPermissionsState,
  showTextEditor,
  setShowTextEditor,
  textEditorTarget,
  setTextEditorTarget,
  textEditorContent,
  setTextEditorContent,
  handleSaveTextFile,
  showFileOpenerDialog,
  setShowFileOpenerDialog,
  fileOpenerTarget,
  setFileOpenerTarget,
  handleFileOpenerSelect,
  handleSelectSystemApp,
}) => {
  return (
    <>
      {/* Host pickers for adding new tabs */}
      <SftpHostPicker
        open={showHostPickerLeft}
        onOpenChange={setShowHostPickerLeft}
        hosts={hosts}
        side="left"
        hostSearch={hostSearchLeft}
        onHostSearchChange={setHostSearchLeft}
        onSelectLocal={() => handleHostSelectLeft("local")}
        onSelectHost={handleHostSelectLeft}
      />
      <SftpHostPicker
        open={showHostPickerRight}
        onOpenChange={setShowHostPickerRight}
        hosts={hosts}
        side="right"
        hostSearch={hostSearchRight}
        onHostSearchChange={setHostSearchRight}
        onSelectLocal={() => handleHostSelectRight("local")}
        onSelectHost={handleHostSelectRight}
      />

      {/* Transfer status area - shows folder uploads and file transfers */}
      {sftp.transfers.length > 0 && (
        <div className="border-t border-border/70 bg-secondary/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground border-b border-border/40">
            <span className="font-medium">
              Transfers
              {sftp.activeTransfersCount > 0 && (
                <span className="ml-2 text-primary">
                  ({sftp.activeTransfersCount} active)
                </span>
              )}
            </span>
            {sftp.transfers.some(
              (t) => t.status === "completed" || t.status === "cancelled",
            ) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={sftp.clearCompletedTransfers}
                >
                  Clear completed
                </Button>
              )}
          </div>
          <div className="max-h-40 overflow-auto">
            {visibleTransfers.map((task) => (
              <SftpTransferItem
                key={task.id}
                task={task}
                onCancel={() => {
                  // External uploads use a different cancel mechanism
                  if (task.sourceConnectionId === "external") {
                    sftp.cancelExternalUpload();
                  }
                  sftp.cancelTransfer(task.id);
                }}
                onRetry={() => sftp.retryTransfer(task.id)}
                onDismiss={() => sftp.dismissTransfer(task.id)}
              />
            ))}
          </div>
        </div>
      )}

      <SftpConflictDialog
        conflicts={sftp.conflicts}
        onResolve={sftp.resolveConflict}
        formatFileSize={sftp.formatFileSize}
      />

      <SftpPermissionsDialog
        open={!!permissionsState}
        onOpenChange={(open) => !open && setPermissionsState(null)}
        file={permissionsState?.file ?? null}
        onSave={(file, permissions) => {
          if (permissionsState) {
            const fullPath = sftp.joinPath(
              permissionsState.side === "left"
                ? sftp.leftPane.connection?.currentPath || ""
                : sftp.rightPane.connection?.currentPath || "",
              file.name,
            );
            sftp.changePermissions(
              permissionsState.side,
              fullPath,
              permissions,
            );
          }
          setPermissionsState(null);
        }}
      />

      {/* Text Editor Modal */}
      <TextEditorModal
        open={showTextEditor}
        onClose={() => {
          setShowTextEditor(false);
          setTextEditorTarget(null);
          setTextEditorContent("");
        }}
        fileName={textEditorTarget?.file.name || ""}
        initialContent={textEditorContent}
        onSave={handleSaveTextFile}
      />

      {/* File Opener Dialog */}
      <FileOpenerDialog
        open={showFileOpenerDialog}
        onClose={() => {
          setShowFileOpenerDialog(false);
          setFileOpenerTarget(null);
        }}
        fileName={fileOpenerTarget?.file.name || ""}
        onSelect={handleFileOpenerSelect}
        onSelectSystemApp={handleSelectSystemApp}
      />
    </>
  );
};
