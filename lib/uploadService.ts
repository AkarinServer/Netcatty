/**
 * Shared Upload Service
 *
 * Provides core upload logic for both SftpView and SftpModal components.
 * Handles bundled folder uploads with aggregate progress tracking,
 * cancellation support, and works for both local and remote (SFTP) uploads.
 */

import { extractDropEntries, DropEntry, getPathForFile } from "./sftpFileUtils";

// ============================================================================
// Types
// ============================================================================

export interface UploadProgress {
  transferred: number;
  total: number;
  speed: number;
  /** Percentage (0-100) */
  percent: number;
}

export interface UploadTaskInfo {
  id: string;
  fileName: string;
  /** Display name for bundled tasks (e.g., "folder (5 files)") */
  displayName: string;
  isDirectory: boolean;
  totalBytes: number;
  transferredBytes: number;
  speed: number;
  fileCount: number;
  completedCount: number;
}

export interface UploadResult {
  fileName: string;
  success: boolean;
  error?: string;
  cancelled?: boolean;
}

export interface UploadCallbacks {
  /** Called when a new task is created (for bundled folders or standalone files) */
  onTaskCreated?: (task: UploadTaskInfo) => void;
  /** Called when task progress is updated */
  onTaskProgress?: (taskId: string, progress: UploadProgress) => void;
  /** Called when a task is completed */
  onTaskCompleted?: (taskId: string, totalBytes: number) => void;
  /** Called when a task fails */
  onTaskFailed?: (taskId: string, error: string) => void;
  /** Called when a task is cancelled */
  onTaskCancelled?: (taskId: string) => void;
  /** Called when scanning starts (for showing placeholder) */
  onScanningStart?: (taskId: string) => void;
  /** Called when scanning ends */
  onScanningEnd?: (taskId: string) => void;
}

export interface UploadBridge {
  writeLocalFile?: (path: string, data: ArrayBuffer) => Promise<void>;
  mkdirLocal?: (path: string) => Promise<void>;
  mkdirSftp: (sftpId: string, path: string) => Promise<void>;
  writeSftpBinary?: (sftpId: string, path: string, data: ArrayBuffer) => Promise<void>;
  writeSftpBinaryWithProgress?: (
    sftpId: string,
    path: string,
    data: ArrayBuffer,
    taskId: string,
    onProgress: (transferred: number, total: number, speed: number) => void,
    onComplete?: () => void,
    onError?: (error: string) => void
  ) => Promise<{ success: boolean; cancelled?: boolean } | undefined>;
  cancelSftpUpload?: (taskId: string) => Promise<unknown>;
  /** Stream transfer using local file path (avoids loading file into memory) */
  startStreamTransfer?: (
    options: {
      transferId: string;
      sourcePath: string;
      targetPath: string;
      sourceType: 'local' | 'sftp';
      targetType: 'local' | 'sftp';
      sourceSftpId?: string;
      targetSftpId?: string;
      totalBytes?: number;
    },
    onProgress?: (transferred: number, total: number, speed: number) => void,
    onComplete?: () => void,
    onError?: (error: string) => void
  ) => Promise<{ transferId: string; totalBytes?: number; error?: string; cancelled?: boolean }>;
  cancelTransfer?: (transferId: string) => Promise<void>;
}

export interface UploadConfig {
  /** Target directory path */
  targetPath: string;
  /** SFTP session ID (null for local) */
  sftpId: string | null;
  /** Is this a local file system upload? */
  isLocal: boolean;
  /** The bridge for file operations */
  bridge: UploadBridge;
  /** Path joining function */
  joinPath: (base: string, name: string) => string;
  /** Callbacks for progress updates */
  callbacks?: UploadCallbacks;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect root folders from drop entries for bundled task creation
 */
export function detectRootFolders(entries: DropEntry[]): Map<string, DropEntry[]> {
  const rootFolders = new Map<string, DropEntry[]>();

  for (const entry of entries) {
    const parts = entry.relativePath.split('/');
    const rootName = parts[0];

    // Group if there's more than one part (from a folder) or the entry is a directory
    if (parts.length > 1 || entry.isDirectory) {
      if (!rootFolders.has(rootName)) {
        rootFolders.set(rootName, []);
      }
      rootFolders.get(rootName)!.push(entry);
    } else {
      // Standalone file - use its name as key with special prefix
      const key = `__file__${entry.relativePath}`;
      rootFolders.set(key, [entry]);
    }
  }

  return rootFolders;
}

/**
 * Sort entries: directories first, then by path depth
 */
export function sortEntries(entries: DropEntry[]): DropEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    const aDepth = a.relativePath.split('/').length;
    const bDepth = b.relativePath.split('/').length;
    return aDepth - bDepth;
  });
}

// ============================================================================
// Upload Controller
// ============================================================================

/**
 * Controller for managing upload operations with cancellation support
 */
export class UploadController {
  private cancelled = false;
  private activeFileTransferIds = new Set<string>();
  private currentTransferId = "";
  private bridge: UploadBridge | null = null;

  /**
   * Cancel all active uploads
   */
  async cancel(): Promise<void> {
    this.cancelled = true;
    console.log('[UploadController] Cancelling uploads, active IDs:', Array.from(this.activeFileTransferIds));

    // Cancel all active file uploads
    const activeIds = Array.from(this.activeFileTransferIds);
    for (const transferId of activeIds) {
      try {
        // Try cancelTransfer first (for stream transfers)
        if (this.bridge?.cancelTransfer) {
          console.log('[UploadController] Calling cancelTransfer for:', transferId);
          await this.bridge.cancelTransfer(transferId);
        }
        // Also try cancelSftpUpload (for legacy uploads)
        if (this.bridge?.cancelSftpUpload) {
          console.log('[UploadController] Calling cancelSftpUpload for:', transferId);
          await this.bridge.cancelSftpUpload(transferId);
        }
      } catch (e) {
        console.log('[UploadController] Cancel error:', e);
        // Ignore cancel errors
      }
    }

    // Also cancel current one if not in the set
    if (this.currentTransferId && !activeIds.includes(this.currentTransferId)) {
      try {
        if (this.bridge?.cancelTransfer) {
          console.log('[UploadController] Calling cancelTransfer for current:', this.currentTransferId);
          await this.bridge.cancelTransfer(this.currentTransferId);
        }
        if (this.bridge?.cancelSftpUpload) {
          console.log('[UploadController] Calling cancelSftpUpload for current:', this.currentTransferId);
          await this.bridge.cancelSftpUpload(this.currentTransferId);
        }
      } catch (e) {
        console.log('[UploadController] Cancel current error:', e);
        // Ignore cancel errors
      }
    }
  }

  /**
   * Check if upload was cancelled
   */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Get all active transfer IDs
   */
  getActiveTransferIds(): string[] {
    const ids = Array.from(this.activeFileTransferIds);
    if (this.currentTransferId && !ids.includes(this.currentTransferId)) {
      ids.push(this.currentTransferId);
    }
    return ids;
  }

  /**
   * Reset controller state for new upload
   */
  reset(): void {
    this.cancelled = false;
    this.activeFileTransferIds.clear();
    this.currentTransferId = "";
  }

  /**
   * Set the bridge for cancellation
   */
  setBridge(bridge: UploadBridge): void {
    this.bridge = bridge;
  }

  /**
   * Track a file transfer ID
   */
  addActiveTransfer(id: string): void {
    this.activeFileTransferIds.add(id);
    this.currentTransferId = id;
  }

  /**
   * Remove a tracked file transfer ID
   */
  removeActiveTransfer(id: string): void {
    this.activeFileTransferIds.delete(id);
    if (this.currentTransferId === id) {
      this.currentTransferId = "";
    }
  }

  /**
   * Clear current transfer ID
   */
  clearCurrentTransfer(): void {
    this.currentTransferId = "";
  }
}

// ============================================================================
// Core Upload Function
// ============================================================================

/**
 * Upload files from a DataTransfer object with bundled folder support
 *
 * @param dataTransfer - The DataTransfer object from a drop event
 * @param config - Upload configuration
 * @param controller - Optional upload controller for cancellation
 * @returns Array of upload results
 */
export async function uploadFromDataTransfer(
  dataTransfer: DataTransfer,
  config: UploadConfig,
  controller?: UploadController
): Promise<UploadResult[]> {
  const { targetPath, sftpId, isLocal, bridge, joinPath, callbacks } = config;

  // Reset controller if provided
  if (controller) {
    controller.reset();
    controller.setBridge(bridge);
  }

  // Create scanning placeholder
  const scanningTaskId = crypto.randomUUID();
  callbacks?.onScanningStart?.(scanningTaskId);

  let entries: DropEntry[];
  try {
    entries = await extractDropEntries(dataTransfer);
  } finally {
    callbacks?.onScanningEnd?.(scanningTaskId);
  }

  if (entries.length === 0) {
    return [];
  }

  return uploadEntries(entries, targetPath, sftpId, isLocal, bridge, joinPath, callbacks, controller);
}

/**
 * Upload a FileList or File array with bundled folder support
 */
export async function uploadFromFileList(
  fileList: FileList | File[],
  config: UploadConfig,
  controller?: UploadController
): Promise<UploadResult[]> {
  console.log('[uploadFromFileList] Called with', fileList.length, 'files');
  const { targetPath, sftpId, isLocal, bridge, joinPath, callbacks } = config;
  console.log('[uploadFromFileList] Config:', { targetPath, sftpId, isLocal });

  if (controller) {
    controller.reset();
    controller.setBridge(bridge);
  }

  // Convert FileList to DropEntry array (simple files, no folders)
  // Use getPathForFile to get the local file path for stream transfer
  const entries: DropEntry[] = Array.from(fileList).map(file => {
    const localPath = getPathForFile(file);
    console.log('[uploadFromFileList] File:', { name: file.name, size: file.size, localPath });
    if (localPath) {
      // Set the path property on the file for stream transfer
      (file as File & { path?: string }).path = localPath;
    }
    return {
      file,
      relativePath: file.name,
      isDirectory: false,
    };
  });

  console.log('[uploadFromFileList] Created', entries.length, 'entries');

  if (entries.length === 0) {
    console.log('[uploadFromFileList] No entries, returning empty');
    return [];
  }

  console.log('[uploadFromFileList] Calling uploadEntries');
  return uploadEntries(entries, targetPath, sftpId, isLocal, bridge, joinPath, callbacks, controller);
}

/**
 * Core upload logic for entries
 */
async function uploadEntries(
  entries: DropEntry[],
  targetPath: string,
  sftpId: string | null,
  isLocal: boolean,
  bridge: UploadBridge,
  joinPath: (base: string, name: string) => string,
  callbacks?: UploadCallbacks,
  controller?: UploadController
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  const createdDirs = new Set<string>();

  const ensureDirectory = async (dirPath: string) => {
    if (createdDirs.has(dirPath)) return;

    try {
      if (isLocal) {
        if (bridge.mkdirLocal) {
          await bridge.mkdirLocal(dirPath);
        }
      } else if (sftpId) {
        await bridge.mkdirSftp(sftpId, dirPath);
      }
      createdDirs.add(dirPath);
    } catch {
      createdDirs.add(dirPath);
    }
  };

  // Group entries by root folder
  const rootFolders = detectRootFolders(entries);
  const sortedEntries = sortEntries(entries);

  let wasCancelled = false;
  const yieldToMain = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  // Track bundled task progress
  const bundleProgress = new Map<string, {
    totalBytes: number;
    transferredBytes: number;
    fileCount: number;
    completedCount: number;
    currentSpeed: number;
    completedFilesBytes: number;
  }>();

  // Create bundled tasks for each root folder
  const bundleTaskIds = new Map<string, string>(); // rootName -> bundleTaskId

  for (const [rootName, rootEntries] of rootFolders) {
    const isStandaloneFile = rootName.startsWith("__file__");
    if (isStandaloneFile) continue;

    // Calculate total bytes for this folder
    let totalBytes = 0;
    let fileCount = 0;
    for (const entry of rootEntries) {
      if (!entry.isDirectory && entry.file) {
        totalBytes += entry.file.size;
        fileCount++;
      }
    }

    if (fileCount === 0) continue;

    const bundleTaskId = crypto.randomUUID();
    bundleTaskIds.set(rootName, bundleTaskId);
    bundleProgress.set(bundleTaskId, {
      totalBytes,
      transferredBytes: 0,
      fileCount,
      completedCount: 0,
      currentSpeed: 0,
      completedFilesBytes: 0,
    });

    // Notify task created
    if (callbacks?.onTaskCreated) {
      const displayName = fileCount === 1 ? rootName : `${rootName} (${fileCount} files)`;
      callbacks.onTaskCreated({
        id: bundleTaskId,
        fileName: rootName,
        displayName,
        isDirectory: true,
        totalBytes,
        transferredBytes: 0,
        speed: 0,
        fileCount,
        completedCount: 0,
      });
    }
  }

  // Helper to get bundle task ID for an entry
  const getBundleTaskId = (entry: DropEntry): string | null => {
    const parts = entry.relativePath.split('/');
    const rootName = parts[0];
    if (parts.length > 1 || entry.isDirectory) {
      return bundleTaskIds.get(rootName) || null;
    }
    return null;
  };

  try {
    for (const entry of sortedEntries) {
      await yieldToMain();

      if (controller?.isCancelled()) {
        wasCancelled = true;
        // Mark all created tasks as cancelled before breaking
        for (const [, bundleTaskId] of bundleTaskIds) {
          const progress = bundleProgress.get(bundleTaskId);
          if (progress && progress.completedCount < progress.fileCount) {
            callbacks?.onTaskCancelled?.(bundleTaskId);
          }
        }
        break;
      }

      const entryTargetPath = joinPath(targetPath, entry.relativePath);
      const bundleTaskId = getBundleTaskId(entry);
      let standaloneTransferId = "";
      let fileTotalBytes = 0;

      try {
        if (entry.isDirectory) {
          await ensureDirectory(entryTargetPath);
        } else if (entry.file) {
          fileTotalBytes = entry.file.size;

          // For standalone files (not in a folder), create individual task
          if (!bundleTaskId) {
            standaloneTransferId = crypto.randomUUID();

            if (callbacks?.onTaskCreated) {
              callbacks.onTaskCreated({
                id: standaloneTransferId,
                fileName: entry.relativePath,
                displayName: entry.relativePath,
                isDirectory: false,
                totalBytes: fileTotalBytes,
                transferredBytes: 0,
                speed: 0,
                fileCount: 1,
                completedCount: 0,
              });
            }
          }

          // Ensure parent directories exist
          const pathParts = entry.relativePath.split('/');
          if (pathParts.length > 1) {
            let parentPath = targetPath;
            for (let i = 0; i < pathParts.length - 1; i++) {
              parentPath = joinPath(parentPath, pathParts[i]);
              await ensureDirectory(parentPath);
            }
          }

          // Check if file has a local path (Electron provides file.path for dropped files)
          const localFilePath = (entry.file as File & { path?: string }).path;

          console.log('[UploadService] Processing file:', {
            relativePath: entry.relativePath,
            localFilePath,
            hasStreamTransfer: !!bridge.startStreamTransfer,
            sftpId,
            isLocal,
            fileSize: fileTotalBytes,
          });

          // Use stream transfer if available and we have a local file path (avoids loading file into memory)
          if (localFilePath && bridge.startStreamTransfer && sftpId && !isLocal) {
            console.log('[UploadService] Using stream transfer for:', localFilePath);
            let pendingProgressUpdate: { transferred: number; total: number; speed: number } | null = null;
            let rafScheduled = false;

            const onProgress = (transferred: number, total: number, speed: number) => {
              if (controller?.isCancelled()) return;

              pendingProgressUpdate = { transferred, total, speed };

              if (!rafScheduled) {
                rafScheduled = true;
                requestAnimationFrame(() => {
                  rafScheduled = false;
                  const update = pendingProgressUpdate;
                  pendingProgressUpdate = null;

                  if (update && !controller?.isCancelled() && callbacks?.onTaskProgress) {
                    if (bundleTaskId) {
                      const progress = bundleProgress.get(bundleTaskId);
                      if (progress) {
                        const newTransferred = progress.completedFilesBytes + update.transferred;
                        progress.transferredBytes = newTransferred;
                        progress.currentSpeed = update.speed;
                        callbacks.onTaskProgress(bundleTaskId, {
                          transferred: newTransferred,
                          total: progress.totalBytes,
                          speed: update.speed,
                          percent: progress.totalBytes > 0 ? (newTransferred / progress.totalBytes) * 100 : 0,
                        });
                      }
                    } else if (standaloneTransferId) {
                      callbacks.onTaskProgress(standaloneTransferId, {
                        transferred: update.transferred,
                        total: update.total,
                        speed: update.speed,
                        percent: update.total > 0 ? (update.transferred / update.total) * 100 : 0,
                      });
                    }
                  }
                });
              }
            };

            const fileTransferId = crypto.randomUUID();
            controller?.addActiveTransfer(fileTransferId);

            let streamResult: { transferId: string; totalBytes?: number; error?: string; cancelled?: boolean } | undefined;
            try {
              streamResult = await bridge.startStreamTransfer(
                {
                  transferId: fileTransferId,
                  sourcePath: localFilePath,
                  targetPath: entryTargetPath,
                  sourceType: 'local',
                  targetType: 'sftp',
                  targetSftpId: sftpId,
                  totalBytes: fileTotalBytes,
                },
                onProgress,
                undefined,
                undefined
              );
            } finally {
              controller?.removeActiveTransfer(fileTransferId);
            }

            if (streamResult?.cancelled || streamResult?.error?.includes('cancelled')) {
              wasCancelled = true;
              const taskId = bundleTaskId || standaloneTransferId;
              if (taskId) {
                callbacks?.onTaskCancelled?.(taskId);
              }
              break;
            }

            if (streamResult?.error) {
              throw new Error(streamResult.error);
            }
          } else {
            // Fallback: load file into memory (for small files or when stream transfer is not available)
            console.log('[UploadService] FALLBACK: Loading file into memory:', {
              relativePath: entry.relativePath,
              fileSize: fileTotalBytes,
              reason: !localFilePath ? 'no local path' : !bridge.startStreamTransfer ? 'no stream transfer' : 'other',
            });
            const arrayBuffer = await entry.file.arrayBuffer();

            if (isLocal) {
              if (!bridge.writeLocalFile) {
                throw new Error("writeLocalFile not available");
              }
              await bridge.writeLocalFile(entryTargetPath, arrayBuffer);
            } else if (sftpId) {
              if (bridge.writeSftpBinaryWithProgress) {
                let pendingProgressUpdate: { transferred: number; total: number; speed: number } | null = null;
                let rafScheduled = false;

                const onProgress = (transferred: number, total: number, speed: number) => {
                  if (controller?.isCancelled()) return;

                  pendingProgressUpdate = { transferred, total, speed };

                  if (!rafScheduled) {
                    rafScheduled = true;
                    requestAnimationFrame(() => {
                      rafScheduled = false;
                      const update = pendingProgressUpdate;
                      pendingProgressUpdate = null;

                      if (update && !controller?.isCancelled() && callbacks?.onTaskProgress) {
                        if (bundleTaskId) {
                          const progress = bundleProgress.get(bundleTaskId);
                          if (progress) {
                            const newTransferred = progress.completedFilesBytes + update.transferred;
                            progress.transferredBytes = newTransferred;
                            progress.currentSpeed = update.speed;
                            callbacks.onTaskProgress(bundleTaskId, {
                              transferred: newTransferred,
                              total: progress.totalBytes,
                              speed: update.speed,
                              percent: progress.totalBytes > 0 ? (newTransferred / progress.totalBytes) * 100 : 0,
                            });
                          }
                        } else if (standaloneTransferId) {
                          callbacks.onTaskProgress(standaloneTransferId, {
                            transferred: update.transferred,
                            total: update.total,
                            speed: update.speed,
                            percent: update.total > 0 ? (update.transferred / update.total) * 100 : 0,
                          });
                        }
                      }
                    });
                  }
                };

                // Use unique file transfer ID for backend cancellation tracking
                const fileTransferId = crypto.randomUUID();
                controller?.addActiveTransfer(fileTransferId);

                let result;
                try {
                  result = await bridge.writeSftpBinaryWithProgress(
                    sftpId,
                    entryTargetPath,
                    arrayBuffer,
                    fileTransferId,
                    onProgress,
                    undefined,
                    undefined
                  );
                } finally {
                  controller?.removeActiveTransfer(fileTransferId);
                }

                if (result?.cancelled) {
                  wasCancelled = true;
                  const taskId = bundleTaskId || standaloneTransferId;
                  if (taskId) {
                    callbacks?.onTaskCancelled?.(taskId);
                  }
                  break;
                }

                if (!result || result.success === false) {
                  if (bridge.writeSftpBinary) {
                    await bridge.writeSftpBinary(sftpId, entryTargetPath, arrayBuffer);
                  } else {
                    throw new Error("Upload failed and no fallback method available");
                  }
                }
              } else if (bridge.writeSftpBinary) {
                await bridge.writeSftpBinary(sftpId, entryTargetPath, arrayBuffer);
              } else {
                throw new Error("No SFTP write method available");
              }
            }
          }

          controller?.clearCurrentTransfer();
          results.push({ fileName: entry.relativePath, success: true });

          // Update progress tracking
          if (bundleTaskId) {
            const progress = bundleProgress.get(bundleTaskId);
            if (progress) {
              progress.completedCount++;
              progress.completedFilesBytes += fileTotalBytes;
              progress.transferredBytes = progress.completedFilesBytes;

              if (progress.completedCount >= progress.fileCount) {
                callbacks?.onTaskCompleted?.(bundleTaskId, progress.totalBytes);
              } else if (callbacks?.onTaskProgress) {
                callbacks.onTaskProgress(bundleTaskId, {
                  transferred: progress.completedFilesBytes,
                  total: progress.totalBytes,
                  speed: 0,
                  percent: progress.totalBytes > 0 ? (progress.completedFilesBytes / progress.totalBytes) * 100 : 0,
                });
              }
            }
          } else if (standaloneTransferId) {
            callbacks?.onTaskCompleted?.(standaloneTransferId, fileTotalBytes);
          }
        }
      } catch (error) {
        controller?.clearCurrentTransfer();

        // Check if this was a cancellation
        if (controller?.isCancelled()) {
          wasCancelled = true;
          const taskId = bundleTaskId || standaloneTransferId;
          if (taskId) {
            callbacks?.onTaskCancelled?.(taskId);
          }
          break;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);

        if (!entry.isDirectory) {
          results.push({
            fileName: entry.relativePath,
            success: false,
            error: errorMessage,
          });

          const taskId = bundleTaskId || standaloneTransferId;
          if (taskId) {
            callbacks?.onTaskFailed?.(taskId, errorMessage);
          }
        }

        // Any error stops the entire upload - fail fast approach
        // Note: We don't set wasCancelled here because this is an error, not a cancellation
        break;
      }
    }
  } finally {
    controller?.clearCurrentTransfer();
  }

  if (wasCancelled) {
    results.push({ fileName: "", success: false, cancelled: true });
  }

  return results;
}

/**
 * Upload entries directly (used when entries are already extracted)
 */
export async function uploadEntriesDirect(
  entries: DropEntry[],
  config: UploadConfig,
  controller?: UploadController
): Promise<UploadResult[]> {
  const { targetPath, sftpId, isLocal, bridge, joinPath, callbacks } = config;

  if (controller) {
    controller.reset();
    controller.setBridge(bridge);
  }

  return uploadEntries(entries, targetPath, sftpId, isLocal, bridge, joinPath, callbacks, controller);
}
