import React, { useCallback, useRef, useState } from "react";
import { FileSymlink, Import } from "lucide-react";
import { useI18n } from "../../application/i18n/I18nProvider";
import { getVaultCsvTemplate } from "../../domain/vaultImport";
import type { VaultImportFormat } from "../../domain/vaultImport";
import { cn } from "../../lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

type ImportOption = {
  format: VaultImportFormat;
  label: string;
  iconSrc: string;
  accept: string;
};

const OPTIONS: ImportOption[] = [
  {
    format: "putty",
    label: "PuTTY",
    iconSrc: "/import/putty.png",
    accept: ".reg,.txt,.ini",
  },
  {
    format: "mobaxterm",
    label: "MobaXterm",
    iconSrc: "/import/moba.jpg",
    accept: ".ini,.mxtsessions,.txt",
  },
  {
    format: "csv",
    label: "CSV",
    iconSrc: "/import/csv.png",
    accept: ".csv,.txt",
  },
  {
    format: "securecrt",
    label: "SecureCRT",
    iconSrc: "/import/securecrt.png",
    accept: ".ini,.txt",
  },
  {
    format: "ssh_config",
    label: "ssh_config",
    iconSrc: "/import/file.png",
    accept: "*",
  },
];

export type ImportOptions = {
  managed?: boolean;
  filePath?: string;
};

export type ImportVaultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelected: (format: VaultImportFormat, file: File, options?: ImportOptions) => void;
};

export const ImportVaultDialog: React.FC<ImportVaultDialogProps> = ({
  open,
  onOpenChange,
  onFileSelected,
}) => {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFormatRef = useRef<VaultImportFormat | null>(null);
  const pendingOptionsRef = useRef<ImportOptions | undefined>(undefined);
  const [showManagedChoice, setShowManagedChoice] = useState(false);

  const downloadCsvTemplate = useCallback(() => {
    const csv = getVaultCsvTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "netcatty-vault-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const pickFile = useCallback(
    (format: VaultImportFormat, accept: string, options?: ImportOptions) => {
      const input = fileInputRef.current;
      if (!input) return;
      pendingFormatRef.current = format;
      pendingOptionsRef.current = options;
      input.accept = accept;
      input.value = "";
      input.click();
    },
    [],
  );

  const handleFormatClick = useCallback(
    (opt: ImportOption) => {
      if (opt.format === "ssh_config") {
        setShowManagedChoice(true);
      } else {
        pickFile(opt.format, opt.accept);
      }
    },
    [pickFile],
  );

  const handleManagedChoice = useCallback(
    (managed: boolean) => {
      setShowManagedChoice(false);
      pickFile("ssh_config", "*", { managed });
    },
    [pickFile],
  );

  const onChangeFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const format = pendingFormatRef.current;
      const options = pendingOptionsRef.current;
      if (!file || !format) return;
      onFileSelected(format, file, options);
      e.target.value = "";
      pendingOptionsRef.current = undefined;
    },
    [onFileSelected],
  );

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setShowManagedChoice(false);
      }
      onOpenChange(newOpen);
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center">
            <img
              src="/import/file.png"
              alt=""
              className="h-8 w-8 object-contain"
            />
          </div>
          <DialogTitle className="text-xl">{t("vault.import.title")}</DialogTitle>
          <DialogDescription className="mx-auto max-w-xl">
            {showManagedChoice
              ? t("vault.import.sshConfig.chooseMode")
              : t("vault.import.desc")}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={onChangeFile}
        />

        <div className="flex flex-col gap-4">
          {showManagedChoice ? (
            <>
              <div className="text-sm font-medium text-center text-muted-foreground">
                {t("vault.import.sshConfig.modeQuestion")}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  className={cn(
                    "group rounded-2xl border border-border/60 bg-background",
                    "px-4 py-6 hover:bg-muted/30 hover:border-border transition-colors",
                    "flex flex-col items-center gap-3",
                  )}
                  onClick={() => handleManagedChoice(false)}
                >
                  <div className="h-12 w-12 rounded-xl bg-muted/60 flex items-center justify-center">
                    <Import className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {t("vault.import.sshConfig.importOnly")}
                  </div>
                  <div className="text-xs text-muted-foreground text-center">
                    {t("vault.import.sshConfig.importOnlyDesc")}
                  </div>
                </button>
                <button
                  type="button"
                  className={cn(
                    "group rounded-2xl border border-primary/60 bg-primary/5",
                    "px-4 py-6 hover:bg-primary/10 hover:border-primary transition-colors",
                    "flex flex-col items-center gap-3",
                  )}
                  onClick={() => handleManagedChoice(true)}
                >
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FileSymlink className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {t("vault.import.sshConfig.managed")}
                  </div>
                  <div className="text-xs text-muted-foreground text-center">
                    {t("vault.import.sshConfig.managedDesc")}
                  </div>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowManagedChoice(false)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t("common.back")}
              </button>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-center text-muted-foreground">
                {t("vault.import.chooseFormat")}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {OPTIONS.map((opt) => (
                  <button
                    key={opt.format}
                    type="button"
                    className={cn(
                      "group rounded-2xl border border-border/60 bg-background",
                      "px-3 py-4 hover:bg-muted/30 hover:border-border transition-colors",
                      "flex flex-col items-center gap-3",
                    )}
                    onClick={() => handleFormatClick(opt)}
                  >
                    <div className="h-16 flex items-center justify-center">
                      <img
                        src={opt.iconSrc}
                        alt=""
                        className={cn(
                          "max-h-12 w-14 object-contain",
                          opt.format === "mobaxterm" && "w-16",
                        )}
                      />
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {opt.label}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/60">
                <div className="text-xs text-muted-foreground">
                  {t("vault.import.csv.tip")}
                </div>
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="text-xs text-primary hover:underline"
                >
                  {t("vault.import.csv.downloadTemplate")}
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
