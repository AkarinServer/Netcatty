import React, { useCallback, useState, useRef, useMemo } from "react";
import type { RemoteFile } from "../../../types";
import { toast } from "../../ui/toast";
import {
  UploadController,
  uploadFromDataTransfer,
  uploadFromFileList,
  UploadBridge,
  UploadCallbacks,
  UploadTaskInfo,
  UploadProgress,
} from "../../../lib/uploadService";

interface UploadTask {
  id: string;
  fileName: string;
  status: "pending" | "uploading" | "completed" | "failed" | "cancelled";
  progress: number;
  totalBytes: number;
  transferredBytes: number;
  speed: number;
  startTime: number;
  error?: string;
  isDirectory?: boolean;
  fileCount?: number;
  completedCount?: number;
}

interface UseSftpModalTransfersParams {
  currentPath: string;
  isLocalSession: boolean;
  joinPath: (base: string, name: string) => string;
  ensureSftp: () => Promise<string>;
  loadFiles: (path: string, options?: { force?: boolean }) => Promise<void>;
  readLocalFile: (path: string) => Promise<ArrayBuffer>;
  readSftp: (sftpId: string, path: string) => Promise<string>;
  writeLocalFile: (path: string, data: ArrayBuffer) => Promise<void>;
  writeSftpBinaryWithProgress: (
    sftpId: string,
    path: string,
    data: ArrayBuffer,
    taskId: string,
    onProgress: (transferred: number, total: number, speed: number) => void,
    onComplete: () => void,
    onError: (error: string) => void,
  ) => Promise<boolean>;
  writeSftpBinary: (sftpId: string, path: string, data: ArrayBuffer) => Promise<void>;
  writeSftp: (sftpId: string, path: string, data: string) => Promise<void>;
  mkdirLocal: (path: string) => Promise<void>;
  mkdirSftp: (sftpId: string, path: string) => Promise<void>;
  cancelSftpUpload?: (taskId: string) => Promise<unknown>;
  setLoading: (loading: boolean) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

interface UseSftpModalTransfersResult {
  uploading: boolean;
  uploadTasks: UploadTask[];
  dragActive: boolean;
  handleDownload: (file: RemoteFile) => Promise<void>;
  handleUploadMultiple: (fileList: FileList) => Promise<void>;
  handleUploadFromDrop: (dataTransfer: DataTransfer) => Promise<void>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  cancelUpload: () => Promise<void>;
  dismissTask: (taskId: string) => void;
}

export const useSftpModalTransfers = ({
  currentPath,
  isLocalSession,
  joinPath,
  ensureSftp,
  loadFiles,
  readLocalFile,
  readSftp,
  writeLocalFile,
  writeSftpBinaryWithProgress,
  writeSftpBinary,
  mkdirLocal,
  mkdirSftp,
  cancelSftpUpload,
  setLoading,
  t,
}: UseSftpModalTransfersParams): UseSftpModalTransfersResult => {
  const [uploading, setUploading] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Upload controller for cancellation support
  const uploadControllerRef = useRef<UploadController | null>(null);

  // Cached SFTP ID to avoid multiple calls to ensureSftp
  const cachedSftpIdRef = useRef<string | null>(null);

  // Track cancelled transfer IDs to detect cancellation in bridge wrapper
  const cancelledTransferIdsRef = useRef<Set<string>>(new Set());

  const handleDownload = useCallback(
    async (file: RemoteFile) => {
      try {
        const fullPath = joinPath(currentPath, file.name);
        setLoading(true);
        const content = isLocalSession
          ? await readLocalFile(fullPath)
          : await readSftp(await ensureSftp(), fullPath);
        const blob = new Blob([content], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : t("sftp.error.downloadFailed"),
          "SFTP",
        );
      } finally {
        setLoading(false);
      }
    },
    [currentPath, ensureSftp, isLocalSession, joinPath, readLocalFile, readSftp, setLoading, t],
  );

  // Create upload bridge that adapts the modal's functions to the service interface
  const createUploadBridge = useMemo((): UploadBridge => {
    return {
      writeLocalFile,
      mkdirLocal,
      mkdirSftp: async (sftpId: string, path: string) => {
        await mkdirSftp(sftpId, path);
      },
      writeSftpBinary: async (sftpId: string, path: string, data: ArrayBuffer) => {
        await writeSftpBinary(sftpId, path, data);
      },
      writeSftpBinaryWithProgress: async (
        sftpId: string,
        path: string,
        data: ArrayBuffer,
        taskId: string,
        onProgress: (transferred: number, total: number, speed: number) => void,
        _onComplete?: () => void,
        _onError?: (error: string) => void
      ) => {
        try {
          const result = await writeSftpBinaryWithProgress(
            sftpId,
            path,
            data,
            taskId,
            onProgress,
            () => { },
            () => { }
          );
          // Check if this transfer was cancelled
          const wasCancelled = cancelledTransferIdsRef.current.has(taskId);
          if (wasCancelled) {
            cancelledTransferIdsRef.current.delete(taskId);
          }
          return { success: result, cancelled: wasCancelled };
        } catch (error) {
          // Check for fatal errors like session not found
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes("session not found") || errorMessage.includes("SFTP session")) {
            // Mark as cancelled to stop the upload loop
            cancelledTransferIdsRef.current.add(taskId);
            return { success: false, cancelled: true };
          }
          throw error;
        }
      },
      cancelSftpUpload,
    };
  }, [writeLocalFile, mkdirLocal, mkdirSftp, writeSftpBinary, writeSftpBinaryWithProgress, cancelSftpUpload]);

  // Create upload callbacks
  const createUploadCallbacks = useCallback((): UploadCallbacks => {
    return {
      onScanningStart: (taskId: string) => {
        const scanningTask: UploadTask = {
          id: taskId,
          fileName: "Scanning files...",
          status: "pending",
          progress: 0,
          totalBytes: 0,
          transferredBytes: 0,
          speed: 0,
          startTime: Date.now(),
          isDirectory: true,
        };
        setUploadTasks(prev => [...prev, scanningTask]);
      },
      onScanningEnd: (taskId: string) => {
        setUploadTasks(prev => prev.filter(t => t.id !== taskId));
      },
      onTaskCreated: (task: UploadTaskInfo) => {
        const uploadTask: UploadTask = {
          id: task.id,
          fileName: task.displayName,
          status: "uploading",
          progress: 0,
          totalBytes: task.totalBytes,
          transferredBytes: 0,
          speed: 0,
          startTime: Date.now(),
          isDirectory: task.isDirectory,
          fileCount: task.fileCount,
          completedCount: 0,
        };
        setUploadTasks(prev => [...prev, uploadTask]);
      },
      onTaskProgress: (taskId: string, progress: UploadProgress) => {
        setUploadTasks(prev =>
          prev.map(task =>
            task.id === taskId && task.status === "uploading"
              ? {
                ...task,
                transferredBytes: progress.transferred,
                progress: progress.percent,
                speed: progress.speed,
              }
              : task
          )
        );
      },
      onTaskCompleted: (taskId: string, totalBytes: number) => {
        setUploadTasks(prev =>
          prev.map(task =>
            task.id === taskId
              ? {
                ...task,
                status: "completed" as const,
                progress: 100,
                transferredBytes: totalBytes,
                speed: 0,
              }
              : task
          )
        );
      },
      onTaskFailed: (taskId: string, error: string) => {
        // Check if this is a fatal session error - mark as cancelled instead
        const isFatalError = error.includes("session not found") ||
          error.includes("SFTP session") ||
          error.includes("connection") ||
          error.includes("disconnected");

        setUploadTasks(prev =>
          prev.map(task =>
            task.id === taskId
              ? {
                ...task,
                status: isFatalError ? "cancelled" as const : "failed" as const,
                error: isFatalError ? t("sftp.error.sessionLost") : error,
                speed: 0,
              }
              : task
          )
        );

        // Auto-clear failed/cancelled tasks after 3 seconds
        setTimeout(() => {
          setUploadTasks(prev => prev.filter(t => t.id !== taskId));
        }, 3000);
      },
      onTaskCancelled: (taskId: string) => {
        setUploadTasks(prev =>
          prev.map(task =>
            task.id === taskId
              ? {
                ...task,
                status: "cancelled" as const,
                speed: 0,
              }
              : task
          )
        );
        // Auto-clear cancelled tasks after 2 seconds
        setTimeout(() => {
          setUploadTasks(prev => prev.filter(t => t.id !== taskId));
        }, 2000);
      },
    };
  }, [t]);

  const handleUploadMultiple = useCallback(
    async (fileList: FileList) => {
      if (fileList.length === 0) return;

      setUploading(true);

      // Get SFTP ID for remote sessions
      let sftpId: string | null = null;
      if (!isLocalSession) {
        sftpId = await ensureSftp();
        cachedSftpIdRef.current = sftpId;
      }

      // Create controller for cancellation
      const controller = new UploadController();
      uploadControllerRef.current = controller;

      const callbacks = createUploadCallbacks();

      try {
        await uploadFromFileList(
          fileList,
          {
            targetPath: currentPath,
            sftpId,
            isLocal: isLocalSession,
            bridge: createUploadBridge,
            joinPath,
            callbacks,
          },
          controller
        );

        await loadFiles(currentPath, { force: true });

        // Auto-clear completed tasks after 3 seconds
        setTimeout(() => {
          setUploadTasks(prev => prev.filter(t => t.status !== "completed"));
        }, 3000);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("sftp.error.uploadFailed"),
          "SFTP"
        );
      } finally {
        setUploading(false);
        uploadControllerRef.current = null;
        cachedSftpIdRef.current = null;
      }
    },
    [currentPath, createUploadBridge, createUploadCallbacks, ensureSftp, isLocalSession, joinPath, loadFiles, t],
  );

  const handleUploadFromDrop = useCallback(
    async (dataTransfer: DataTransfer) => {
      setUploading(true);

      // Get SFTP ID for remote sessions
      let sftpId: string | null = null;
      if (!isLocalSession) {
        sftpId = await ensureSftp();
        cachedSftpIdRef.current = sftpId;
      }

      // Create controller for cancellation
      const controller = new UploadController();
      uploadControllerRef.current = controller;

      const callbacks = createUploadCallbacks();

      try {
        await uploadFromDataTransfer(
          dataTransfer,
          {
            targetPath: currentPath,
            sftpId,
            isLocal: isLocalSession,
            bridge: createUploadBridge,
            joinPath,
            callbacks,
          },
          controller
        );

        await loadFiles(currentPath, { force: true });

        // Auto-clear completed tasks after 3 seconds
        setTimeout(() => {
          setUploadTasks(prev => prev.filter(t => t.status !== "completed"));
        }, 3000);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("sftp.error.uploadFailed"),
          "SFTP"
        );
      } finally {
        setUploading(false);
        uploadControllerRef.current = null;
        cachedSftpIdRef.current = null;
      }
    },
    [currentPath, createUploadBridge, createUploadCallbacks, ensureSftp, isLocalSession, joinPath, loadFiles, t],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        void handleUploadMultiple(e.target.files);
      }
      e.target.value = "";
    },
    [handleUploadMultiple],
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        void handleUploadFromDrop(e.dataTransfer);
      }
    },
    [handleUploadFromDrop],
  );

  const cancelUpload = useCallback(async () => {
    const controller = uploadControllerRef.current;
    if (controller) {
      // Mark all active transfer IDs as cancelled before calling cancel
      const activeIds = controller.getActiveTransferIds();
      for (const id of activeIds) {
        cancelledTransferIdsRef.current.add(id);
      }
      await controller.cancel();
    }

    // Always clear all uploading/pending tasks immediately, even without controller
    setUploadTasks(prev => {
      const hasActiveTasks = prev.some(t => t.status === "uploading" || t.status === "pending");
      if (!hasActiveTasks) return prev;

      return prev.map(task =>
        task.status === "uploading" || task.status === "pending"
          ? { ...task, status: "cancelled" as const, speed: 0 }
          : task
      );
    });

    // Auto-clear cancelled tasks after 2 seconds
    setTimeout(() => {
      setUploadTasks(prev => prev.filter(t => t.status !== "cancelled"));
    }, 2000);

    // Also reset uploading state
    setUploading(false);
  }, []);

  const dismissTask = useCallback((taskId: string) => {
    setUploadTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  return {
    uploading,
    uploadTasks,
    dragActive,
    handleDownload,
    handleUploadMultiple,
    handleUploadFromDrop,
    handleFileSelect,
    handleDrag,
    handleDrop,
    cancelUpload,
    dismissTask,
  };
};
