import React from "react";
import { Loader2, Upload, X, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

interface UploadTask {
  id: string;
  fileName: string;
  totalBytes: number;
  transferredBytes: number;
  progress: number;
  speed: number;
  status: "pending" | "uploading" | "completed" | "failed" | "cancelled";
  error?: string;
}

interface SftpModalUploadTasksProps {
  tasks: UploadTask[];
  t: (key: string, params?: Record<string, unknown>) => string;
  onCancel?: () => void;
  onDismiss?: (taskId: string) => void;
}

export const SftpModalUploadTasks: React.FC<SftpModalUploadTasksProps> = ({ tasks, t, onCancel, onDismiss }) => {
  if (tasks.length === 0) return null;

  return (
    <div className="border-t border-border/60 bg-secondary/50 flex-shrink-0">
      <div className="max-h-40 overflow-y-auto overflow-x-hidden">
        {tasks.map((task) => {
          const formatSpeed = (bytesPerSec: number) => {
            if (bytesPerSec <= 0) return "";
            if (bytesPerSec >= 1024 * 1024)
              return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
            if (bytesPerSec >= 1024)
              return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
            return `${Math.round(bytesPerSec)} B/s`;
          };

          const formatBytes = (bytes: number) => {
            if (bytes === 0) return "0 B";
            if (bytes >= 1024 * 1024)
              return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
            if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${bytes} B`;
          };

          const remainingBytes = task.totalBytes - task.transferredBytes;
          const remainingTime =
            task.speed > 0 ? Math.ceil(remainingBytes / task.speed) : 0;
          const remainingStr =
            remainingTime > 60
              ? `~${Math.ceil(remainingTime / 60)}m left`
              : remainingTime > 0
                ? `~${remainingTime}s left`
                : "";

          return (
            <div
              key={task.id}
              className="px-4 py-2.5 flex items-center gap-3 border-b border-border/30 last:border-b-0"
            >
              <div className="shrink-0">
                {task.status === "uploading" && (
                  <Loader2 size={14} className="animate-spin text-primary" />
                )}
                {task.status === "pending" && (
                  <Upload size={14} className="text-muted-foreground animate-pulse" />
                )}
                {task.status === "completed" && (
                  <Upload size={14} className="text-green-500" />
                )}
                {task.status === "failed" && (
                  <XCircle size={14} className="text-destructive" />
                )}
                {task.status === "cancelled" && (
                  <XCircle size={14} className="text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate">
                    {task.fileName}
                  </span>
                  {task.status === "uploading" && task.speed > 0 && (
                    <span className="text-[10px] text-primary font-mono shrink-0">
                      {formatSpeed(task.speed)}
                    </span>
                  )}
                  {task.status === "uploading" && remainingStr && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {remainingStr}
                    </span>
                  )}
                </div>
                {(task.status === "uploading" || task.status === "pending") && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-150",
                          task.status === "pending"
                            ? "bg-muted-foreground/50 animate-pulse w-full"
                            : "bg-primary",
                        )}
                        style={{
                          width:
                            task.status === "uploading"
                              ? `${task.progress}%`
                              : undefined,
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0 w-8 text-right">
                      {task.status === "uploading" ? `${Math.round(task.progress)}%` : "..."}
                    </span>
                  </div>
                )}
                {task.status === "uploading" && task.totalBytes > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {formatBytes(task.transferredBytes)} / {formatBytes(task.totalBytes)}
                  </div>
                )}
                {task.status === "completed" && (
                  <div className="text-[10px] text-green-600 mt-0.5">
                    Completed - {formatBytes(task.totalBytes)}
                  </div>
                )}
                {task.status === "cancelled" && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Cancelled
                  </div>
                )}
                {task.status === "failed" && task.error && (
                  <div className="text-[10px] text-destructive truncate mt-0.5">
                    {task.error}
                  </div>
                )}
              </div>
              <div className="shrink-0 flex items-center gap-1">
                {task.status === "pending" && (
                  <span className="text-[10px] text-muted-foreground">
                    {t("sftp.task.waiting")}
                  </span>
                )}
                {(task.status === "uploading" || task.status === "pending") && onCancel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={onCancel}
                    title={t("sftp.action.cancel")}
                  >
                    <X size={12} />
                  </Button>
                )}
                {(task.status === "completed" || task.status === "failed" || task.status === "cancelled") && onDismiss && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => onDismiss(task.id)}
                    title={t("sftp.action.dismiss")}
                  >
                    <X size={12} />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
