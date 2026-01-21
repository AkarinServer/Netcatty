import React from "react";
import { ArrowUp, ChevronRight, Home, MoreHorizontal, Plus, RefreshCw, Upload } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Host, SftpFilenameEncoding } from "../../types";
import { DistroAvatar } from "../DistroAvatar";
import { Button } from "../ui/button";
import { DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

interface BreadcrumbPart {
  part: string;
  originalIndex: number;
}

interface SftpModalHeaderProps {
  t: (key: string, params?: Record<string, unknown>) => string;
  host: Host;
  credentials: { username?: string; hostname: string; port?: number };
  showEncoding: boolean;
  filenameEncoding: SftpFilenameEncoding;
  onFilenameEncodingChange: (encoding: SftpFilenameEncoding) => void;
  currentPath: string;
  isEditingPath: boolean;
  editingPathValue: string;
  setEditingPathValue: (value: string) => void;
  handlePathSubmit: () => void;
  handlePathKeyDown: (e: React.KeyboardEvent) => void;
  handlePathDoubleClick: () => void;
  isAtRoot: boolean;
  rootLabel: string;
  isRefreshing: boolean;
  onUp: () => void;
  onHome: () => void;
  onRefresh: () => void;
  visibleBreadcrumbs: BreadcrumbPart[];
  hiddenBreadcrumbs: BreadcrumbPart[];
  needsBreadcrumbTruncation: boolean;
  breadcrumbs: string[];
  onBreadcrumbSelect: (index: number) => void;
  onRootSelect: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  pathInputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  onTriggerUpload: () => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const SftpModalHeader: React.FC<SftpModalHeaderProps> = ({
  t,
  host,
  credentials,
  showEncoding,
  filenameEncoding,
  onFilenameEncodingChange,
  currentPath,
  isEditingPath,
  editingPathValue,
  setEditingPathValue,
  handlePathSubmit,
  handlePathKeyDown,
  handlePathDoubleClick,
  isAtRoot,
  rootLabel,
  isRefreshing,
  onUp,
  onHome,
  onRefresh,
  visibleBreadcrumbs,
  hiddenBreadcrumbs,
  needsBreadcrumbTruncation,
  breadcrumbs,
  onBreadcrumbSelect,
  onRootSelect,
  inputRef,
  pathInputRef,
  uploading,
  onTriggerUpload,
  onCreateFolder,
  onCreateFile,
  onFileSelect,
}) => (
  <>
    <DialogHeader className="px-4 py-3 border-b border-border/60 flex-shrink-0">
      <div className="flex items-center gap-3 pr-8">
        <DistroAvatar
          host={host}
          fallback={host.label.slice(0, 2).toUpperCase()}
          className="h-8 w-8"
        />
        <div className="flex-1 min-w-0">
          <DialogTitle className="text-sm font-semibold">
            {host.label}
          </DialogTitle>
          <div className="text-xs text-muted-foreground font-mono">
            {credentials.username || "root"}@{credentials.hostname}:
            {credentials.port || 22}
          </div>
        </div>
      </div>
    </DialogHeader>

    <div className="px-4 py-2 border-b border-border/60 flex items-center gap-2 flex-shrink-0 bg-muted/30">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onUp}
        disabled={isAtRoot}
      >
        <ArrowUp size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onHome}
      >
        <Home size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={onRefresh}
      >
        <RefreshCw
          size={14}
          className={cn(isRefreshing && "animate-spin")}
        />
      </Button>
      {showEncoding && (
        <Select
          value={filenameEncoding}
          onValueChange={(value) => onFilenameEncodingChange(value as SftpFilenameEncoding)}
        >
          <SelectTrigger className="h-7 w-[130px] text-xs" title={t("sftp.encoding.label")}>
            <SelectValue placeholder={t("sftp.encoding.label")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t("sftp.encoding.auto")}</SelectItem>
            <SelectItem value="utf-8">{t("sftp.encoding.utf8")}</SelectItem>
            <SelectItem value="gb18030">{t("sftp.encoding.gb18030")}</SelectItem>
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-1 text-sm flex-1 min-w-0 overflow-hidden">
        {isEditingPath ? (
          <Input
            ref={pathInputRef}
            value={editingPathValue}
            onChange={(e) => setEditingPathValue(e.target.value)}
            onBlur={handlePathSubmit}
            onKeyDown={handlePathKeyDown}
            className="h-7 text-sm bg-background"
            autoFocus
          />
        ) : (
          <div
            className="flex items-center gap-1 flex-1 min-w-0 cursor-text hover:bg-secondary/50 rounded px-1 py-0.5 transition-colors"
            onDoubleClick={handlePathDoubleClick}
            title={currentPath}
          >
            <button
              className="text-muted-foreground hover:text-foreground px-1 shrink-0"
              onClick={onRootSelect}
            >
              {rootLabel}
            </button>
            {visibleBreadcrumbs.map(({ part, originalIndex }, displayIdx) => {
              const isLast = originalIndex === breadcrumbs.length - 1;
              const showEllipsisBefore =
                needsBreadcrumbTruncation && displayIdx === 1;

              return (
                <React.Fragment key={originalIndex}>
                  {showEllipsisBefore && (
                    <>
                      <ChevronRight
                        size={12}
                        className="text-muted-foreground flex-shrink-0"
                      />
                      <span
                        className="text-muted-foreground px-1 shrink-0 flex items-center cursor-default"
                        title={`${t("sftp.showHiddenPaths")}: ${hiddenBreadcrumbs
                          .map((h) => h.part)
                          .join(" > ")}`}
                      >
                        <MoreHorizontal size={14} />
                      </span>
                    </>
                  )}
                  <ChevronRight
                    size={12}
                    className="text-muted-foreground flex-shrink-0"
                  />
                  <button
                    className={cn(
                      "text-muted-foreground hover:text-foreground truncate px-1 max-w-[100px]",
                      isLast && "text-foreground font-medium",
                    )}
                    onClick={() => onBreadcrumbSelect(originalIndex)}
                    title={part}
                  >
                    {part}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={onTriggerUpload}
          disabled={uploading}
        >
          <Upload size={14} className="mr-1.5" /> {t("sftp.upload")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={onCreateFolder}
        >
          <Plus size={14} className="mr-1.5" /> {t("sftp.newFolder")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7"
          onClick={onCreateFile}
        >
          <Plus size={14} className="mr-1.5" /> {t("sftp.newFile")}
        </Button>
        <input
          type="file"
          className="hidden"
          ref={inputRef}
          onChange={onFileSelect}
          multiple
        />
      </div>
    </div>
  </>
);
