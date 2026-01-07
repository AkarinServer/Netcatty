/**
 * SftpView - SFTP File Browser (Refactored)
 *
 * This is the main SFTP view component that provides a dual-pane file browser
 * for transferring files between local and remote systems.
 *
 * Components have been extracted to:
 * - components/sftp/utils.ts - Utility functions
 * - components/sftp/SftpBreadcrumb.tsx - Path navigation
 * - components/sftp/SftpFileRow.tsx - File list row
 * - components/sftp/SftpTransferItem.tsx - Transfer queue item
 * - components/sftp/SftpConflictDialog.tsx - Conflict resolution
 * - components/sftp/SftpPermissionsDialog.tsx - Permissions editor
 * - components/sftp/SftpHostPicker.tsx - Host selection dialog
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import { useIsSftpActive } from "../application/state/activeTabStore";
import { SftpPane, useSftpState } from "../application/state/useSftpState";
import { useSettingsState } from "../application/state/useSettingsState";
import { logger } from "../lib/logger";
import { isKnownBinaryFile, getFileExtension, FileOpenerType, SystemAppInfo } from "../lib/sftpFileUtils";
import { useRenderTracker } from "../lib/useRenderTracker";
import { cn } from "../lib/utils";
import { Host, Identity, SftpFileEntry, SSHKey } from "../types";
import { useSftpFileAssociations } from "../application/state/useSftpFileAssociations";
import FileOpenerDialog from "./FileOpenerDialog";
import TextEditorModal from "./TextEditorModal";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// Import extracted components
import {
  ColumnWidths,
  isNavigableDirectory,
  SftpBreadcrumb,
  SftpConflictDialog,
  SftpFileRow,
  SftpHostPicker,
  SftpPermissionsDialog,
  SftpTabBar,
  SftpTransferItem,
  SortField,
  SortOrder,
} from "./sftp";

import {
  AlertCircle,
  ArrowDown,
  ChevronLeft,
  Copy,
  Edit2,
  ExternalLink,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  X,
} from "lucide-react";

// Import context hooks
import {
  SftpContextProvider,
  useSftpPaneCallbacks,
  useSftpDrag,
  useSftpHosts,
  useActiveTabId,
  activeTabStore,
  type SftpPaneCallbacks,
  type SftpDragCallbacks,
} from "./sftp";

// Wrapper component that subscribes to activeTabId for CSS visibility
// This isolates the activeTabId subscription - only this component re-renders on tab switch
// Uses visibility:hidden pattern from App.tsx for smooth tab switching
interface SftpPaneWrapperProps {
  side: "left" | "right";
  paneId: string;
  isFirstPane: boolean;
  children: React.ReactNode;
}

const SftpPaneWrapper = memo<SftpPaneWrapperProps>(({ side, paneId, isFirstPane, children }) => {
  const activeTabId = useActiveTabId(side);
  // Active if: this pane's id matches activeTabId, or no activeTabId and this is first pane
  const isActive = activeTabId ? paneId === activeTabId : isFirstPane;

  // Use same visibility pattern as VaultViewContainer in App.tsx
  const containerStyle: React.CSSProperties = isActive
    ? {}
    : { visibility: 'hidden', pointerEvents: 'none' };

  return (
    <div
      className={cn("absolute inset-0", isActive ? "z-10" : "z-0")}
      style={containerStyle}
    >
      {children}
    </div>
  );
});
SftpPaneWrapper.displayName = "SftpPaneWrapper";

// SFTP Pane component - simplified props, callbacks from context
// Does NOT subscribe to activeTabId - visibility is controlled by SftpPaneWrapper
interface SftpPaneViewProps {
  side: "left" | "right";
  pane: SftpPane;
  showHeader?: boolean;
  showEmptyHeader?: boolean;
}

const SftpPaneViewInner: React.FC<SftpPaneViewProps> = ({
  side,
  pane,
  showHeader = true,
  showEmptyHeader = true,
}) => {
  // NOTE: We don't subscribe to activeTabId here!
  // Visibility is controlled by parent SftpPaneWrapper via CSS (visibility: hidden)
  // This component never re-renders on tab switch
  // We assume isActive=true because hidden components don't trigger keyboard events anyway
  const isActive = true;

  // Get callbacks from context - stable references
  const callbacks = useSftpPaneCallbacks(side);
  const { draggedFiles, onDragStart, onDragEnd } = useSftpDrag();
  const hosts = useSftpHosts();

  // Destructure for easier use
  const {
    onConnect,
    onDisconnect,
    onNavigateTo,
    onNavigateUp,
    onRefresh,
    onOpenEntry,
    onToggleSelection,
    onRangeSelect,
    onClearSelection,
    onSetFilter,
    onCreateDirectory,
    onDeleteFiles,
    onRenameFile,
    onCopyToOtherPane,
    onReceiveFromOtherPane,
    onEditPermissions,
    onEditFile,
    onOpenFile,
    onOpenFileWith,
  } = callbacks;

  // 渲染追踪 - 只追踪数据 props（回调来自 context，引用稳定）
  // Note: isActive is always true here, visibility is controlled by CSS
  useRenderTracker(`SftpPaneView[${side}]`, {
    side,
    paneId: pane.id,
    paneConnected: pane.connected,
    panePath: pane.currentPath,
    showHeader,
    draggedFilesCount: draggedFiles?.length ?? 0,
  });

  const { t } = useI18n();
  const [, startTransition] = useTransition();
  // Dialog states
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [hostSearch, setHostSearch] = useState("");
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Drag states
  const [dragOverEntry, setDragOverEntry] = useState<string | null>(null);
  const [isDragOverPane, setIsDragOverPane] = useState(false);
  const paneContainerRef = useRef<HTMLDivElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const lastSelectedIndexRef = useRef<number | null>(null);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Column widths (percentages)
  const [columnWidths, setColumnWidths] = useState<ColumnWidths>({
    name: 45,
    modified: 25,
    size: 15,
    type: 15,
  });
  const resizingRef = useRef<{
    field: keyof ColumnWidths;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Editable path state
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [editingPathValue, setEditingPathValue] = useState("");
  const [showPathSuggestions, setShowPathSuggestions] = useState(false);
  const [pathSuggestionIndex, setPathSuggestionIndex] = useState(-1);
  const pathInputRef = useRef<HTMLInputElement>(null);
  const pathDropdownRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const scrollFrameRef = useRef<number | null>(null);

  const filteredFiles = useMemo(() => {
    const term = pane.filter.trim().toLowerCase();
    if (!term) return pane.files;
    return pane.files.filter(
      (f) => f.name === ".." || f.name.toLowerCase().includes(term),
    );
  }, [pane.files, pane.filter]);

  // Path suggestions
  const pathSuggestions = useMemo(() => {
    if (!isEditingPath || !pane.connection) return [];
    const currentValue = editingPathValue.trim().toLowerCase();
    const suggestions: { path: string; type: "folder" | "history" }[] = [];

    // Include both directories and symlinks pointing to directories
    const folders = filteredFiles.filter(
      (f) => isNavigableDirectory(f) && f.name !== "..",
    );
    folders.forEach((f) => {
      const fullPath =
        pane.connection?.currentPath === "/"
          ? `/${f.name}`
          : `${pane.connection?.currentPath}/${f.name}`;
      if (
        !currentValue ||
        fullPath.toLowerCase().includes(currentValue) ||
        f.name.toLowerCase().includes(currentValue)
      ) {
        suggestions.push({ path: fullPath, type: "folder" });
      }
    });

    const quickPaths = [
      "/home",
      "/var",
      "/etc",
      "/tmp",
      "/usr",
      "/opt",
      "/root",
    ];
    quickPaths.forEach((qp) => {
      if (!currentValue || qp.toLowerCase().includes(currentValue)) {
        if (!suggestions.some((s) => s.path === qp)) {
          suggestions.push({ path: qp, type: "history" });
        }
      }
    });

    return suggestions.slice(0, 8);
  }, [isEditingPath, editingPathValue, filteredFiles, pane.connection]);

  // Display files with parent entry
  const displayFiles = useMemo(() => {
    if (!pane.connection) return [];
    const isRootPath =
      pane.connection.currentPath === "/" ||
      /^[A-Za-z]:[\\/]?$/.test(pane.connection.currentPath);
    if (isRootPath) return filteredFiles;
    const parentEntry: SftpFileEntry = {
      name: "..",
      type: "directory",
      size: 0,
      sizeFormatted: "--",
      lastModified: 0,
      lastModifiedFormatted: "--",
    };
    return [parentEntry, ...filteredFiles.filter((f) => f.name !== "..")];
  }, [pane.connection, filteredFiles]);

  // Sorted files
  const sortedDisplayFiles = useMemo(() => {
    if (!displayFiles.length) return displayFiles;

    const parentEntry = displayFiles.find((f) => f.name === "..");
    const otherFiles = displayFiles.filter((f) => f.name !== "..");

    const sorted = [...otherFiles].sort((a, b) => {
      if (sortField !== "type") {
        if (a.type === "directory" && b.type !== "directory") return -1;
        if (a.type !== "directory" && b.type === "directory") return 1;
      }

      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "size":
          cmp = (a.size || 0) - (b.size || 0);
          break;
        case "modified":
          cmp = (a.lastModified || 0) - (b.lastModified || 0);
          break;
        case "type": {
          const extA =
            a.type === "directory"
              ? "folder"
              : a.name.split(".").pop()?.toLowerCase() || "";
          const extB =
            b.type === "directory"
              ? "folder"
              : b.name.split(".").pop()?.toLowerCase() || "";
          cmp = extA.localeCompare(extB);
          break;
        }
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return parentEntry ? [parentEntry, ...sorted] : sorted;
  }, [displayFiles, sortField, sortOrder]);

  const selectedFilesRef = useRef(pane.selectedFiles);
  const sortedFilesRef = useRef(sortedDisplayFiles);

  useEffect(() => {
    selectedFilesRef.current = pane.selectedFiles;
  }, [pane.selectedFiles]);

  useEffect(() => {
    sortedFilesRef.current = sortedDisplayFiles;
  }, [sortedDisplayFiles]);

  useEffect(() => {
    logger.debug("SftpPaneView active state", {
      side,
      paneId: pane.id,
      isActive,
    });
  }, [isActive, pane.id, side]);

  useLayoutEffect(() => {
    const container = fileListRef.current;
    if (!container || !isActive) return;
    const update = () => setViewportHeight(container.clientHeight);
    update();
    const raf1 = window.requestAnimationFrame(update);
    const raf2 = window.requestAnimationFrame(update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [isActive, sortedDisplayFiles.length]);

  useLayoutEffect(() => {
    const container = fileListRef.current;
    if (!container || !isActive || sortedDisplayFiles.length === 0) return;
    const raf = window.requestAnimationFrame(() => {
      const rowElement = container.querySelector(
        '[data-sftp-row="true"]',
      ) as HTMLElement | null;
      if (!rowElement) return;
      const nextHeight = Math.round(rowElement.getBoundingClientRect().height);
      if (nextHeight && Math.abs(nextHeight - rowHeight) > 1) {
        setRowHeight(nextHeight);
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [isActive, sortedDisplayFiles.length, rowHeight]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const handleSort = (field: SortField) => {
    startTransition(() => {
      if (sortField === field) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortOrder("asc");
      }
    });
  };

  // Column resize handlers
  const handleResizeStart = (
    field: keyof ColumnWidths,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      field,
      startX: e.clientX,
      startWidth: columnWidths[field],
    };
    document.addEventListener("mousemove", handleResizeMove);
    document.addEventListener("mouseup", handleResizeEnd);
  };

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const diff = e.clientX - resizingRef.current.startX;
    const newWidth = Math.max(
      10,
      Math.min(60, resizingRef.current.startWidth + diff / 5),
    );
    setColumnWidths((prev) => ({
      ...prev,
      [resizingRef.current!.field]: newWidth,
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
  }, [handleResizeMove]);

  // Path editing handlers
  const handlePathDoubleClick = () => {
    if (!pane.connection) return;
    setEditingPathValue(pane.connection.currentPath);
    setIsEditingPath(true);
    setShowPathSuggestions(true);
    setPathSuggestionIndex(-1);
    setTimeout(() => pathInputRef.current?.select(), 0);
  };

  const handlePathSubmit = (pathOverride?: string) => {
    const newPath = (pathOverride ?? editingPathValue).trim() || "/";
    setIsEditingPath(false);
    setShowPathSuggestions(false);
    setPathSuggestionIndex(-1);
    if (pane.connection && newPath !== pane.connection.currentPath) {
      // Check if it's a Windows path (starts with drive letter like C: or D:)
      const isWindowsPath = /^[A-Za-z]:/.test(newPath);
      if (isWindowsPath) {
        // For Windows paths, normalize drive root to have trailing backslash
        // Handle cases like "C:", "C:/", "C:\" - all should become "C:\"
        let normalizedPath = newPath;
        if (/^[A-Za-z]:[\\/]?$/.test(newPath)) {
          // This is a drive root (e.g., "C:", "C:/", "C:\")
          normalizedPath = newPath.charAt(0).toUpperCase() + ":\\";
        }
        onNavigateTo(normalizedPath);
      } else {
        // For Unix paths, ensure leading slash
        onNavigateTo(newPath.startsWith("/") ? newPath : `/${newPath}`);
      }
    }
  };

  const handlePathKeyDown = (e: React.KeyboardEvent) => {
    if (showPathSuggestions && pathSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPathSuggestionIndex((prev) =>
          prev < pathSuggestions.length - 1 ? prev + 1 : 0,
        );
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setPathSuggestionIndex((prev) =>
          prev > 0 ? prev - 1 : pathSuggestions.length - 1,
        );
        return;
      } else if (e.key === "Tab" && pathSuggestionIndex >= 0) {
        e.preventDefault();
        setEditingPathValue(pathSuggestions[pathSuggestionIndex].path);
        return;
      }
    }
    if (e.key === "Enter") {
      if (pathSuggestionIndex >= 0 && pathSuggestions[pathSuggestionIndex]) {
        handlePathSubmit(pathSuggestions[pathSuggestionIndex].path);
      } else {
        handlePathSubmit();
      }
    } else if (e.key === "Escape") {
      setIsEditingPath(false);
      setShowPathSuggestions(false);
      setPathSuggestionIndex(-1);
    }
  };

  const handlePathBlur = () => {
    setTimeout(() => {
      if (!pathDropdownRef.current?.contains(document.activeElement)) {
        handlePathSubmit();
      }
    }, 150);
  };

  // File operations
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || isCreating) return;
    setIsCreating(true);
    try {
      await onCreateDirectory(newFolderName.trim());
      setShowNewFolderDialog(false);
      setNewFolderName("");
    } catch {
      /* Error handling */
    } finally {
      setIsCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameName.trim() || isRenaming) return;
    setIsRenaming(true);
    try {
      await onRenameFile(renameTarget, renameName.trim());
      setShowRenameDialog(false);
      setRenameTarget(null);
      setRenameName("");
    } catch {
      /* Error handling */
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTargets.length === 0 || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteFiles(deleteTargets);
      setShowDeleteConfirm(false);
      setDeleteTargets([]);
      onClearSelection();
    } catch {
      /* Error handling */
    } finally {
      setIsDeleting(false);
    }
  };

  // Drag handlers
  const handlePaneDragOver = (e: React.DragEvent) => {
    if (!draggedFiles || draggedFiles[0]?.side === side) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOverPane(true);
  };

  const handlePaneDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    if (relatedTarget && paneContainerRef.current?.contains(relatedTarget))
      return;
    setIsDragOverPane(false);
    setDragOverEntry(null);
  };

  const handlePaneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOverPane(false);
    setDragOverEntry(null);
    if (!draggedFiles || draggedFiles[0]?.side === side) return;
    onReceiveFromOtherPane(
      draggedFiles.map((f) => ({ name: f.name, isDirectory: f.isDirectory })),
    );
  };

  const handleFileDragStart = useCallback(
    (entry: SftpFileEntry, e: React.DragEvent) => {
      if (entry.name === "..") {
        e.preventDefault();
        return;
      }
      const selectedNames = Array.from(selectedFilesRef.current);
      const files = selectedNames.includes(entry.name)
        ? sortedFilesRef.current
          .filter((f) => selectedNames.includes(f.name))
          .map((f) => ({
            name: f.name,
            isDirectory: isNavigableDirectory(f),
            side,
          }))
        : [
          {
            name: entry.name,
            isDirectory: isNavigableDirectory(entry),
            side,
          },
        ];
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("text/plain", files.map((f) => f.name).join("\n"));
      onDragStart(files, side);
    },
    [onDragStart, side],
  );

  const handleEntryDragOver = useCallback(
    (entry: SftpFileEntry, e: React.DragEvent) => {
      if (!draggedFiles || draggedFiles[0]?.side === side) return;
      // Allow drag over for directories and symlinks pointing to directories
      if (isNavigableDirectory(entry) && entry.name !== "..") {
        e.preventDefault();
        e.stopPropagation();
        setDragOverEntry(entry.name);
      }
    },
    [draggedFiles, side],
  );

  const handleEntryDrop = useCallback(
    (entry: SftpFileEntry, e: React.DragEvent) => {
      if (!draggedFiles || draggedFiles[0]?.side === side) return;
      // Allow drop on directories and symlinks pointing to directories
      if (isNavigableDirectory(entry) && entry.name !== "..") {
        e.preventDefault();
        e.stopPropagation();
        setDragOverEntry(null);
        setIsDragOverPane(false);
        onReceiveFromOtherPane(
          draggedFiles.map((f) => ({ name: f.name, isDirectory: f.isDirectory })),
        );
      }
    },
    [draggedFiles, onReceiveFromOtherPane, side],
  );

  const handleFileListScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!isActive) return;
      const nextTop = e.currentTarget.scrollTop;
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        setScrollTop(nextTop);
      });
    },
    [isActive],
  );

  const openRenameDialog = useCallback((name: string) => {
    setRenameTarget(name);
    setRenameName(name);
    setShowRenameDialog(true);
  }, []);

  const openDeleteConfirm = useCallback((names: string[]) => {
    setDeleteTargets(names);
    setShowDeleteConfirm(true);
  }, []);

  const handleRowSelect = useCallback(
    (entry: SftpFileEntry, index: number, e: React.MouseEvent) => {
      if (entry.name === "..") return;
      if (e.shiftKey && lastSelectedIndexRef.current !== null) {
        const start = Math.min(lastSelectedIndexRef.current, index);
        const end = Math.max(lastSelectedIndexRef.current, index);
        const selectedFileNames = sortedDisplayFiles
          .slice(start, end + 1)
          .filter((f) => f.name !== "..")
          .map((f) => f.name);
        onRangeSelect(selectedFileNames);
      } else {
        onToggleSelection(entry.name, e.ctrlKey || e.metaKey);
        lastSelectedIndexRef.current = index;
      }
    },
    [onRangeSelect, onToggleSelection, sortedDisplayFiles],
  );

  const handleRowOpen = useCallback(
    (entry: SftpFileEntry) => {
      onOpenEntry(entry);
    },
    [onOpenEntry],
  );

  const handleRowDragLeave = useCallback(() => {
    setDragOverEntry(null);
  }, []);

  const filesByName = useMemo(() => {
    const map = new Map<string, SftpFileEntry>();
    sortedDisplayFiles.forEach((entry) => {
      map.set(entry.name, entry);
    });
    return map;
  }, [sortedDisplayFiles]);

  const canVirtualize = isActive && viewportHeight > 0 && rowHeight > 0;
  const shouldVirtualize = canVirtualize && sortedDisplayFiles.length > 0;
  const overscan = 6;
  const totalHeight = shouldVirtualize
    ? sortedDisplayFiles.length * rowHeight
    : 0;
  const startIndex = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    : 0;
  const endIndex = shouldVirtualize
    ? Math.min(
      sortedDisplayFiles.length - 1,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
    )
    : sortedDisplayFiles.length - 1;
  const visibleRows = shouldVirtualize
    ? sortedDisplayFiles
      .slice(startIndex, endIndex + 1)
      .map((entry, idx) => ({
        entry,
        index: startIndex + idx,
        top: (startIndex + idx) * rowHeight,
      }))
    : sortedDisplayFiles.map((entry, index) => ({
      entry,
      index,
      top: 0,
    }));

  useEffect(() => {
    logger.debug("SftpPaneView virtualization", {
      side,
      paneId: pane.id,
      enabled: shouldVirtualize,
      rows: sortedDisplayFiles.length,
      viewportHeight,
      rowHeight,
    });
  }, [
    pane.id,
    rowHeight,
    shouldVirtualize,
    side,
    sortedDisplayFiles.length,
    viewportHeight,
  ]);

  const renderRow = useCallback(
    (entry: SftpFileEntry, index: number) => (
      <ContextMenu>
        <ContextMenuTrigger>
          <SftpFileRow
            entry={entry}
            index={index}
            isSelected={pane.selectedFiles.has(entry.name)}
            isDragOver={dragOverEntry === entry.name}
            columnWidths={columnWidths}
            onSelect={handleRowSelect}
            onOpen={handleRowOpen}
            onDragStart={handleFileDragStart}
            onDragEnd={onDragEnd}
            onDragOver={handleEntryDragOver}
            onDragLeave={handleRowDragLeave}
            onDrop={handleEntryDrop}
          />
        </ContextMenuTrigger>
        {entry.name !== ".." && (
          <ContextMenuContent>
            <ContextMenuItem onClick={() => handleRowOpen(entry)}>
              {isNavigableDirectory(entry)
                ? t("sftp.context.open")
                : t("sftp.context.download")}
            </ContextMenuItem>
            {/* File operations - only for files, not directories */}
            {!isNavigableDirectory(entry) && onOpenFile && (
              <ContextMenuItem onClick={() => onOpenFile(entry)}>
                <ExternalLink size={14} className="mr-2" />{" "}
                {t("sftp.context.open")}
              </ContextMenuItem>
            )}
            {!isNavigableDirectory(entry) && onOpenFileWith && (
              <ContextMenuItem onClick={() => onOpenFileWith(entry)}>
                <ExternalLink size={14} className="mr-2" />{" "}
                {t("sftp.context.openWith")}
              </ContextMenuItem>
            )}
            {!isNavigableDirectory(entry) && !isKnownBinaryFile(entry.name) && onEditFile && (
              <ContextMenuItem onClick={() => onEditFile(entry)}>
                <Edit2 size={14} className="mr-2" />{" "}
                {t("sftp.context.edit")}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => {
                const files = pane.selectedFiles.has(entry.name)
                  ? Array.from(pane.selectedFiles)
                  : [entry.name];
                const fileData = files.map((name) => {
                  const fileName = String(name);
                  const file = filesByName.get(fileName);
                  return {
                    name: fileName,
                    isDirectory: file ? isNavigableDirectory(file) : false,
                  };
                });
                onCopyToOtherPane(fileData);
              }}
            >
              <Copy size={14} className="mr-2" />{" "}
              {t("sftp.context.copyToOtherPane")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => openRenameDialog(entry.name)}>
              <Pencil size={14} className="mr-2" /> {t("common.rename")}
            </ContextMenuItem>
            {onEditPermissions && pane.connection && !pane.connection.isLocal && (
              <ContextMenuItem onClick={() => onEditPermissions(entry)}>
                <Shield size={14} className="mr-2" />{" "}
                {t("sftp.context.permissions")}
              </ContextMenuItem>
            )}
            <ContextMenuItem
              className="text-destructive"
              onClick={() => {
                const files = pane.selectedFiles.has(entry.name)
                  ? Array.from(pane.selectedFiles)
                  : [entry.name];
                openDeleteConfirm(files);
              }}
            >
              <Trash2 size={14} className="mr-2" /> {t("action.delete")}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onRefresh}>
              <RefreshCw size={14} className="mr-2" /> {t("common.refresh")}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setShowNewFolderDialog(true)}>
              <FolderPlus size={14} className="mr-2" /> {t("sftp.newFolder")}
            </ContextMenuItem>
          </ContextMenuContent>
        )}
      </ContextMenu>
    ),
    [
      columnWidths,
      dragOverEntry,
      filesByName,
      handleEntryDragOver,
      handleEntryDrop,
      handleFileDragStart,
      handleRowDragLeave,
      handleRowOpen,
      handleRowSelect,
      onCopyToOtherPane,
      onDragEnd,
      onEditFile,
      onEditPermissions,
      onOpenFile,
      onOpenFileWith,
      onRefresh,
      openDeleteConfirm,
      openRenameDialog,
      pane.connection,
      pane.selectedFiles,
      setShowNewFolderDialog,
      t,
    ],
  );

  const fileRows = useMemo(
    () =>
      shouldVirtualize
        ? visibleRows.map(({ entry, index, top }) => (
          <div
            key={entry.name}
            className="absolute left-0 right-0 border-b border-border/30"
            style={{ top, height: rowHeight }}
          >
            {renderRow(entry, index)}
          </div>
        ))
        : sortedDisplayFiles.map((entry, index) => (
          <React.Fragment key={entry.name}>
            {renderRow(entry, index)}
          </React.Fragment>
        )),
    [
      renderRow,
      rowHeight,
      shouldVirtualize,
      sortedDisplayFiles,
      visibleRows,
    ],
  );

  // No connection state
  if (!pane.connection) {
    return (
      <div className="absolute inset-0 flex flex-col">
        {showEmptyHeader && (
          <div className="h-12 px-4 border-b border-border/60 flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              {side === "left" ? <Monitor size={14} /> : <HardDrive size={14} />}
              <span>
                {side === "left" ? t("sftp.pane.local") : t("sftp.pane.remote")}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              onClick={() => setShowHostPicker(true)}
            >
              <Plus size={14} className="mr-2" /> {t("sftp.pane.selectHost")}
            </Button>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 p-6">
          <div className="h-14 w-14 rounded-xl bg-secondary/60 text-primary flex items-center justify-center">
            {side === "left" ? <Monitor size={24} /> : <HardDrive size={24} />}
          </div>
          <div>
            <div className="text-sm font-semibold mb-1">
              {t("sftp.pane.selectHostToStart")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("sftp.pane.chooseFilesystem")}
            </div>
          </div>
          <Button onClick={() => setShowHostPicker(true)}>
            <Plus size={14} className="mr-2" /> {t("sftp.pane.selectHost")}
          </Button>
        </div>

        <SftpHostPicker
          open={showHostPicker}
          onOpenChange={setShowHostPicker}
          hosts={hosts}
          side={side}
          hostSearch={hostSearch}
          onHostSearchChange={setHostSearch}
          onSelectLocal={() => onConnect("local")}
          onSelectHost={onConnect}
        />
      </div>
    );
  }

  return (
    <div
      ref={paneContainerRef}
      className={cn(
        "absolute inset-0 flex flex-col transition-colors",
        isDragOverPane && "bg-primary/5",
      )}
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
    >
      {/* Header - compact version - only show when showHeader is true */}
      {showHeader && (
        <div className="h-8 px-3 border-b border-border/60 flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {pane.connection.isLocal ? (
              <Monitor size={12} />
            ) : (
              <HardDrive size={12} />
            )}
            <span>{pane.connection.hostLabel}</span>
            {(pane.connection.status === "connecting" || pane.reconnecting) && (
              <Loader2 size={10} className="animate-spin text-muted-foreground" />
            )}
            {pane.reconnecting && (
              <span className="text-[10px] text-muted-foreground">
                Reconnecting...
              </span>
            )}
            {pane.connection.status === "error" && !pane.reconnecting && (
              <AlertCircle size={10} className="text-destructive" />
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={pane.filter}
                onChange={(e) =>
                  startTransition(() => onSetFilter(e.target.value))
                }
                placeholder="Filter..."
                className="h-6 w-28 pl-6 pr-5 text-[10px] bg-secondary/40"
              />
              {pane.filter && (
                <button
                  onClick={() => startTransition(() => onSetFilter(""))}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={10} />
                </button>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onRefresh}
              title={t("common.refresh")}
            >
              <RefreshCw
                size={12}
                className={
                  pane.loading || pane.reconnecting ? "animate-spin" : ""
                }
              />
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar - compact - only show when showHeader is true */}
      {showHeader && (
        <div className="h-7 px-2 flex items-center gap-1 border-b border-border/40 bg-secondary/20">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={onNavigateUp}
            title={t("sftp.goUp")}
          >
            <ChevronLeft size={12} />
          </Button>

          {/* Editable Breadcrumb with autocomplete */}
          {isEditingPath ? (
            <div className="relative flex-1">
              <Input
                ref={pathInputRef}
                value={editingPathValue}
                onChange={(e) => {
                  setEditingPathValue(e.target.value);
                  setShowPathSuggestions(true);
                  setPathSuggestionIndex(-1);
                }}
                onBlur={handlePathBlur}
                onKeyDown={handlePathKeyDown}
                onFocus={() => setShowPathSuggestions(true)}
                className="h-5 w-full text-[10px] bg-background"
                autoFocus
              />
              {showPathSuggestions && pathSuggestions.length > 0 && (
                <div
                  ref={pathDropdownRef}
                  className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 max-h-48 overflow-auto"
                >
                  {pathSuggestions.map((suggestion, idx) => (
                    <button
                      key={suggestion.path}
                      type="button"
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-secondary/60 transition-colors",
                        idx === pathSuggestionIndex && "bg-secondary/80",
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handlePathSubmit(suggestion.path);
                      }}
                    >
                      {suggestion.type === "folder" ? (
                        <Folder size={12} className="text-primary shrink-0" />
                      ) : (
                        <Home
                          size={12}
                          className="text-muted-foreground shrink-0"
                        />
                      )}
                      <span className="truncate font-mono">
                        {suggestion.path}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex-1 cursor-text hover:bg-secondary/50 rounded px-1 transition-colors"
              onDoubleClick={handlePathDoubleClick}
              title={t("sftp.path.doubleClickToEdit")}
            >
              <SftpBreadcrumb
                path={pane.connection.currentPath}
                onNavigate={onNavigateTo}
                onHome={() =>
                  pane.connection?.homeDir &&
                  onNavigateTo(pane.connection.homeDir)
                }
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowNewFolderDialog(true)}
            >
              <FolderPlus size={12} className="mr-1" /> {t("sftp.newFolder")}
            </Button>
          </div>
        </div>
      )}

      {/* File list header */}
      <div
        className="text-[11px] uppercase tracking-wide text-muted-foreground px-4 py-2 border-b border-border/40 bg-secondary/10 select-none"
        style={{
          display: "grid",
          gridTemplateColumns: `${columnWidths.name}% ${columnWidths.modified}% ${columnWidths.size}% ${columnWidths.type}%`,
        }}
      >
        <div
          className="flex items-center gap-1 cursor-pointer hover:text-foreground relative pr-2"
          onClick={() => handleSort("name")}
        >
          <span>{t("sftp.columns.name")}</span>
          {sortField === "name" && (
            <span className="text-primary">
              {sortOrder === "asc" ? "↑" : "↓"}
            </span>
          )}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
            onMouseDown={(e) => handleResizeStart("name", e)}
          />
        </div>
        <div
          className="flex items-center gap-1 cursor-pointer hover:text-foreground relative pr-2"
          onClick={() => handleSort("modified")}
        >
          <span>{t("sftp.columns.modified")}</span>
          {sortField === "modified" && (
            <span className="text-primary">
              {sortOrder === "asc" ? "↑" : "↓"}
            </span>
          )}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
            onMouseDown={(e) => handleResizeStart("modified", e)}
          />
        </div>
        <div
          className="flex items-center gap-1 cursor-pointer hover:text-foreground relative pr-2 justify-end"
          onClick={() => handleSort("size")}
        >
          {sortField === "size" && (
            <span className="text-primary">
              {sortOrder === "asc" ? "↑" : "↓"}
            </span>
          )}
          <span>{t("sftp.columns.size")}</span>
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
            onMouseDown={(e) => handleResizeStart("size", e)}
          />
        </div>
        <div
          className="flex items-center gap-1 cursor-pointer hover:text-foreground justify-end"
          onClick={() => handleSort("type")}
        >
          {sortField === "type" && (
            <span className="text-primary">
              {sortOrder === "asc" ? "↑" : "↓"}
            </span>
          )}
          <span>{t("sftp.columns.kind")}</span>
        </div>
      </div>

      {/* File list */}
      <div
        ref={fileListRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto relative",
          isDragOverPane && "ring-2 ring-primary/30 ring-inset",
        )}
        onScroll={handleFileListScroll}
      >
        {pane.loading && sortedDisplayFiles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : pane.error ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-destructive">
            <AlertCircle size={24} />
            <span className="text-sm">{pane.error}</span>
            <Button variant="outline" size="sm" onClick={onRefresh}>
              {t("sftp.retry")}
            </Button>
          </div>
        ) : sortedDisplayFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Folder size={32} className="mb-2 opacity-50" />
            <span className="text-sm">{t("sftp.emptyDirectory")}</span>
          </div>
        ) : (
          <div
            className={cn(
              shouldVirtualize ? "relative" : "divide-y divide-border/30",
            )}
            style={shouldVirtualize ? { height: totalHeight } : undefined}
          >
            {fileRows}
          </div>
        )}

        {pane.loading && sortedDisplayFiles.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px] pointer-events-none">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Drop overlay */}
        {isDragOverPane && draggedFiles && draggedFiles[0]?.side !== side && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/5 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary">
              <ArrowDown size={32} />
              <span className="text-sm font-medium">{t("sftp.dropFilesHere")}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="h-9 shrink-0 px-4 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 bg-secondary/30">
        <span>
          {t("sftp.itemsCount", {
            count: sortedDisplayFiles.filter((f) => f.name !== "..").length,
          })}
          {pane.selectedFiles.size > 0 &&
            ` - ${t("sftp.selectedCount", { count: pane.selectedFiles.size })}`}
        </span>
        <span className="truncate max-w-[200px]">
          {pane.connection.currentPath}
        </span>
      </div>

      {/* Dialogs */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sftp.newFolder")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("sftp.folderName")}</Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t("sftp.folderName.placeholder")}
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewFolderDialog(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || isCreating}
            >
              {isCreating && (
                <Loader2 size={14} className="mr-2 animate-spin" />
              )}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("sftp.rename.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("sftp.rename.newName")}</Label>
              <Input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder={t("sftp.rename.placeholder")}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleRename}
              disabled={!renameName.trim() || isRenaming}
            >
              {isRenaming && (
                <Loader2 size={14} className="mr-2 animate-spin" />
              )}
              {t("common.rename")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t("sftp.deleteConfirm.title", { count: deleteTargets.length })}
            </DialogTitle>
            <DialogDescription>
              {t("sftp.deleteConfirm.desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-32 overflow-auto text-sm space-y-1">
            {deleteTargets.map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <Trash2 size={12} />
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && (
                <Loader2 size={14} className="mr-2 animate-spin" />
              )}
              {t("action.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SftpHostPicker
        open={showHostPicker}
        onOpenChange={setShowHostPicker}
        hosts={hosts}
        side={side}
        hostSearch={hostSearch}
        onHostSearchChange={setHostSearch}
        onSelectLocal={() => {
          onDisconnect();
          onConnect("local");
        }}
        onSelectHost={(host) => {
          onDisconnect();
          onConnect(host);
        }}
      />
    </div>
  );
};

// Custom comparison for SftpPaneView - simplified since callbacks come from context
// isActive is now managed by SftpPaneWrapper, not passed as prop
const sftpPaneViewAreEqual = (
  prev: SftpPaneViewProps,
  next: SftpPaneViewProps,
): boolean => {
  // Check essential props only
  if (prev.pane !== next.pane) return false;
  if (prev.side !== next.side) return false;
  if (prev.showHeader !== next.showHeader) return false;
  if (prev.showEmptyHeader !== next.showEmptyHeader) return false;

  return true;
};

const SftpPaneView = memo(SftpPaneViewInner, sftpPaneViewAreEqual);
SftpPaneView.displayName = "SftpPaneView";

// Main SftpView component
interface SftpViewProps {
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
}

const SftpViewInner: React.FC<SftpViewProps> = ({ hosts, keys, identities }) => {
  const isActive = useIsSftpActive();
  const sftp = useSftpState(hosts, keys, identities);
  const { sftpDoubleClickBehavior } = useSettingsState();

  // Store sftp in a ref so callbacks can access the latest instance
  // without needing to re-create when sftp changes
  const sftpRef = useRef(sftp);
  sftpRef.current = sftp;
  
  // Store behavior setting in ref for stable callbacks
  const behaviorRef = useRef(sftpDoubleClickBehavior);
  behaviorRef.current = sftpDoubleClickBehavior;

  // Sync activeTabId to external store (allows child components to subscribe without parent re-render)
  // Using useLayoutEffect to sync before paint
  useLayoutEffect(() => {
    activeTabStore.setActiveTabId("left", sftp.leftTabs.activeTabId);
  }, [sftp.leftTabs.activeTabId]);

  useLayoutEffect(() => {
    activeTabStore.setActiveTabId("right", sftp.rightTabs.activeTabId);
  }, [sftp.rightTabs.activeTabId]);

  // 渲染追踪 - 不追踪 activeTabId（现在通过 store 订阅）
  useRenderTracker("SftpViewInner", {
    isActive,
    hostsCount: hosts.length,
    leftTabsCount: sftp.leftTabs.tabs.length,
    rightTabsCount: sftp.rightTabs.tabs.length,
  });
  const [permissionsState, setPermissionsState] = useState<{
    file: SftpFileEntry;
    side: "left" | "right";
  } | null>(null);
  const [draggedFiles, setDraggedFiles] = useState<
    { name: string; isDirectory: boolean; side: "left" | "right" }[] | null
  >(null);

  // File operations state
  const { getOpenerForFile, setOpenerForExtension } = useSftpFileAssociations();

  // Store getOpenerForFile in a ref so callbacks can access the latest version
  // without needing to re-create when associations change
  const getOpenerForFileRef = useRef(getOpenerForFile);
  getOpenerForFileRef.current = getOpenerForFile;

  const [showTextEditor, setShowTextEditor] = useState(false);
  const [textEditorTarget, setTextEditorTarget] = useState<{
    file: SftpFileEntry;
    side: "left" | "right";
    fullPath: string;
  } | null>(null);
  const [textEditorContent, setTextEditorContent] = useState("");

  const [showFileOpenerDialog, setShowFileOpenerDialog] = useState(false);
  const [fileOpenerTarget, setFileOpenerTarget] = useState<{
    file: SftpFileEntry;
    side: "left" | "right";
    fullPath: string;
  } | null>(null);

  // Memoized callbacks
  const handleDragStart = useCallback(
    (
      files: { name: string; isDirectory: boolean }[],
      side: "left" | "right",
    ) => {
      setDraggedFiles(files.map((f) => ({ ...f, side })));
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedFiles(null);
  }, []);

  // All callbacks use sftpRef.current to access latest sftp instance
  // This keeps callback references stable (empty dependency arrays)
  const handleCopyToOtherPaneLeft = useCallback(
    (files: { name: string; isDirectory: boolean }[]) =>
      sftpRef.current.startTransfer(files, "left", "right"),
    [],
  );
  const handleCopyToOtherPaneRight = useCallback(
    (files: { name: string; isDirectory: boolean }[]) =>
      sftpRef.current.startTransfer(files, "right", "left"),
    [],
  );
  const handleReceiveFromOtherPaneLeft = useCallback(
    (files: { name: string; isDirectory: boolean }[]) =>
      sftpRef.current.startTransfer(files, "right", "left"),
    [],
  );
  const handleReceiveFromOtherPaneRight = useCallback(
    (files: { name: string; isDirectory: boolean }[]) =>
      sftpRef.current.startTransfer(files, "left", "right"),
    [],
  );

  const handleConnectLeft = useCallback(
    (host: Host) => sftpRef.current.connect("left", host),
    [],
  );
  const handleConnectRight = useCallback(
    (host: Host) => sftpRef.current.connect("right", host),
    [],
  );
  const handleDisconnectLeft = useCallback(
    () => sftpRef.current.disconnect("left"),
    [],
  );
  const handleDisconnectRight = useCallback(
    () => sftpRef.current.disconnect("right"),
    [],
  );
  const handleNavigateToLeft = useCallback(
    (path: string) => sftpRef.current.navigateTo("left", path),
    [],
  );
  const handleNavigateToRight = useCallback(
    (path: string) => sftpRef.current.navigateTo("right", path),
    [],
  );
  const handleNavigateUpLeft = useCallback(
    () => sftpRef.current.navigateUp("left"),
    [],
  );
  const handleNavigateUpRight = useCallback(
    () => sftpRef.current.navigateUp("right"),
    [],
  );
  const handleRefreshLeft = useCallback(
    () => sftpRef.current.refresh("left"),
    [],
  );
  const handleRefreshRight = useCallback(
    () => sftpRef.current.refresh("right"),
    [],
  );
  const handleToggleSelectionLeft = useCallback(
    (name: string, multi: boolean) => sftpRef.current.toggleSelection("left", name, multi),
    [],
  );
  const handleToggleSelectionRight = useCallback(
    (name: string, multi: boolean) =>
      sftpRef.current.toggleSelection("right", name, multi),
    [],
  );
  const handleRangeSelectLeft = useCallback(
    (fileNames: string[]) => sftpRef.current.rangeSelect("left", fileNames),
    [],
  );
  const handleRangeSelectRight = useCallback(
    (fileNames: string[]) => sftpRef.current.rangeSelect("right", fileNames),
    [],
  );
  const handleClearSelectionLeft = useCallback(
    () => sftpRef.current.clearSelection("left"),
    [],
  );
  const handleClearSelectionRight = useCallback(
    () => sftpRef.current.clearSelection("right"),
    [],
  );
  const handleSetFilterLeft = useCallback(
    (filter: string) => sftpRef.current.setFilter("left", filter),
    [],
  );
  const handleSetFilterRight = useCallback(
    (filter: string) => sftpRef.current.setFilter("right", filter),
    [],
  );
  const handleCreateDirectoryLeft = useCallback(
    (name: string) => sftpRef.current.createDirectory("left", name),
    [],
  );
  const handleCreateDirectoryRight = useCallback(
    (name: string) => sftpRef.current.createDirectory("right", name),
    [],
  );
  const handleDeleteFilesLeft = useCallback(
    (names: string[]) => sftpRef.current.deleteFiles("left", names),
    [],
  );
  const handleDeleteFilesRight = useCallback(
    (names: string[]) => sftpRef.current.deleteFiles("right", names),
    [],
  );
  const handleRenameFileLeft = useCallback(
    (old: string, newName: string) => sftpRef.current.renameFile("left", old, newName),
    [],
  );
  const handleRenameFileRight = useCallback(
    (old: string, newName: string) => sftpRef.current.renameFile("right", old, newName),
    [],
  );

  const handleEditPermissionsLeft = useCallback(
    (file: SftpFileEntry) => setPermissionsState({ file, side: "left" }),
    [],
  );
  const handleEditPermissionsRight = useCallback(
    (file: SftpFileEntry) => setPermissionsState({ file, side: "right" }),
    [],
  );

  // File operation callbacks
  const handleEditFileForSide = useCallback(
    async (side: "left" | "right", file: SftpFileEntry) => {
      const pane = side === "left" ? sftpRef.current.leftPane : sftpRef.current.rightPane;
      if (!pane.connection) return;

      const fullPath = sftpRef.current.joinPath(pane.connection.currentPath, file.name);

      try {
        setTextEditorTarget({ file, side, fullPath });

        // Read file as text - if it's binary, user will see garbled content
        // but it won't cause any harm unless they save it
        const content = await sftpRef.current.readTextFile(side, fullPath);

        setTextEditorContent(content);
        setShowTextEditor(true);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Failed to load file",
          "SFTP"
        );
        setTextEditorTarget(null);
      }
    },
    [],
  );

  const handleOpenFileForSide = useCallback(
    async (side: "left" | "right", file: SftpFileEntry) => {
      const pane = side === "left" ? sftpRef.current.leftPane : sftpRef.current.rightPane;
      if (!pane.connection) return;

      const fullPath = sftpRef.current.joinPath(pane.connection.currentPath, file.name);
      // Use ref to get the latest associations (avoids stale closure)
      const savedOpener = getOpenerForFileRef.current(file.name);

      console.log('[SftpView] handleOpenFileForSide called', {
        fileName: file.name,
        savedOpener,
        fullPath
      });

      if (savedOpener && savedOpener.openerType) {
        if (savedOpener.openerType === 'builtin-editor') {
          handleEditFileForSide(side, file);
          return;
        } else if (savedOpener.openerType === 'system-app' && savedOpener.systemApp) {
          // Open with saved system application
          try {
            await sftpRef.current.downloadToTempAndOpen(
              side,
              fullPath,
              file.name,
              savedOpener.systemApp.path
            );
          } catch (e) {
            toast.error(
              e instanceof Error ? e.message : "Failed to open file",
              "SFTP"
            );
          }
          return;
        }
        // Fall through: savedOpener exists but openerType is invalid or missing systemApp
        console.log('[SftpView] savedOpener exists but invalid, showing dialog', savedOpener);
      }

      // Show opener dialog
      setFileOpenerTarget({ file, side, fullPath });
      setShowFileOpenerDialog(true);
    },
    [handleEditFileForSide],
  );

  const handleFileOpenerSelect = useCallback(
    async (openerType: FileOpenerType, setAsDefault: boolean, systemApp?: SystemAppInfo) => {
      if (!fileOpenerTarget) return;

      if (setAsDefault) {
        const ext = getFileExtension(fileOpenerTarget.file.name);
        console.log('[SftpView] Saving file association for extension:', ext, 'openerType:', openerType, 'systemApp:', systemApp);
        setOpenerForExtension(ext, openerType, systemApp);
      }

      setShowFileOpenerDialog(false);

      if (openerType === 'builtin-editor') {
        handleEditFileForSide(fileOpenerTarget.side, fileOpenerTarget.file);
      } else if (openerType === 'system-app' && systemApp) {
        // Download and open with system application
        try {
          await sftpRef.current.downloadToTempAndOpen(
            fileOpenerTarget.side,
            fileOpenerTarget.fullPath,
            fileOpenerTarget.file.name,
            systemApp.path
          );
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Failed to open file",
            "SFTP"
          );
        }
      }

      setFileOpenerTarget(null);
    },
    [fileOpenerTarget, setOpenerForExtension, handleEditFileForSide],
  );

  // Callback for FileOpenerDialog to select a system application
  const handleSelectSystemApp = useCallback(async (): Promise<SystemAppInfo | null> => {
    const result = await sftpRef.current.selectApplication();
    if (result) {
      return { path: result.path, name: result.name };
    }
    return null;
  }, []);

  const handleSaveTextFile = useCallback(
    async (content: string) => {
      if (!textEditorTarget) return;

      await sftpRef.current.writeTextFile(
        textEditorTarget.side,
        textEditorTarget.fullPath,
        content
      );
    },
    [textEditorTarget],
  );

  const handleEditFileLeft = useCallback(
    (file: SftpFileEntry) => handleEditFileForSide("left", file),
    [handleEditFileForSide],
  );
  const handleEditFileRight = useCallback(
    (file: SftpFileEntry) => handleEditFileForSide("right", file),
    [handleEditFileForSide],
  );
  const handleOpenFileLeft = useCallback(
    (file: SftpFileEntry) => handleOpenFileForSide("left", file),
    [handleOpenFileForSide],
  );
  const handleOpenFileRight = useCallback(
    (file: SftpFileEntry) => handleOpenFileForSide("right", file),
    [handleOpenFileForSide],
  );

  // Open With - always show the opener dialog
  const handleOpenFileWithForSide = useCallback(
    (side: "left" | "right", file: SftpFileEntry) => {
      const pane = side === "left" ? sftpRef.current.leftPane : sftpRef.current.rightPane;
      if (!pane.connection) return;

      const fullPath = sftpRef.current.joinPath(pane.connection.currentPath, file.name);
      // Always show the opener dialog
      setFileOpenerTarget({ file, side, fullPath });
      setShowFileOpenerDialog(true);
    },
    [],
  );

  const handleOpenFileWithLeft = useCallback(
    (file: SftpFileEntry) => handleOpenFileWithForSide("left", file),
    [handleOpenFileWithForSide],
  );
  const handleOpenFileWithRight = useCallback(
    (file: SftpFileEntry) => handleOpenFileWithForSide("right", file),
    [handleOpenFileWithForSide],
  );

  // Custom handleOpenEntry callbacks that check the double-click behavior setting
  const handleOpenEntryLeft = useCallback(
    (entry: SftpFileEntry) => {
      const isDir = isNavigableDirectory(entry);
      
      // Always navigate into directories
      if (entry.name === ".." || isDir) {
        sftpRef.current.openEntry("left", entry);
        return;
      }
      
      // For files, check the behavior setting
      if (behaviorRef.current === 'transfer') {
        // Transfer to other pane
        const fileData = [{
          name: entry.name,
          isDirectory: isDir
        }];
        sftpRef.current.startTransfer(fileData, "left", "right");
      } else {
        // Default: open the file
        handleOpenFileLeft(entry);
      }
    },
    [handleOpenFileLeft],
  );
  
  const handleOpenEntryRight = useCallback(
    (entry: SftpFileEntry) => {
      const isDir = isNavigableDirectory(entry);
      
      // Always navigate into directories
      if (entry.name === ".." || isDir) {
        sftpRef.current.openEntry("right", entry);
        return;
      }
      
      // For files, check the behavior setting
      if (behaviorRef.current === 'transfer') {
        // Transfer to other pane
        const fileData = [{
          name: entry.name,
          isDirectory: isDir
        }];
        sftpRef.current.startTransfer(fileData, "right", "left");
      } else {
        // Default: open the file
        handleOpenFileRight(entry);
      }
    },
    [handleOpenFileRight],
  );

  // Create stable callback objects for context
  // All handlers now use sftpRef, so these objects never change
  /* eslint-disable react-hooks/exhaustive-deps -- Handlers use sftpRef.current internally, so they are stable */
  const leftCallbacks = useMemo<SftpPaneCallbacks>(
    () => ({
      onConnect: handleConnectLeft,
      onDisconnect: handleDisconnectLeft,
      onNavigateTo: handleNavigateToLeft,
      onNavigateUp: handleNavigateUpLeft,
      onRefresh: handleRefreshLeft,
      onOpenEntry: handleOpenEntryLeft,
      onToggleSelection: handleToggleSelectionLeft,
      onRangeSelect: handleRangeSelectLeft,
      onClearSelection: handleClearSelectionLeft,
      onSetFilter: handleSetFilterLeft,
      onCreateDirectory: handleCreateDirectoryLeft,
      onDeleteFiles: handleDeleteFilesLeft,
      onRenameFile: handleRenameFileLeft,
      onCopyToOtherPane: handleCopyToOtherPaneLeft,
      onReceiveFromOtherPane: handleReceiveFromOtherPaneLeft,
      onEditPermissions: handleEditPermissionsLeft,
      onEditFile: handleEditFileLeft,
      onOpenFile: handleOpenFileLeft,
      onOpenFileWith: handleOpenFileWithLeft,
    }),
    [],
  );

  const rightCallbacks = useMemo<SftpPaneCallbacks>(
    () => ({
      onConnect: handleConnectRight,
      onDisconnect: handleDisconnectRight,
      onNavigateTo: handleNavigateToRight,
      onNavigateUp: handleNavigateUpRight,
      onRefresh: handleRefreshRight,
      onOpenEntry: handleOpenEntryRight,
      onToggleSelection: handleToggleSelectionRight,
      onRangeSelect: handleRangeSelectRight,
      onClearSelection: handleClearSelectionRight,
      onSetFilter: handleSetFilterRight,
      onCreateDirectory: handleCreateDirectoryRight,
      onDeleteFiles: handleDeleteFilesRight,
      onRenameFile: handleRenameFileRight,
      onCopyToOtherPane: handleCopyToOtherPaneRight,
      onReceiveFromOtherPane: handleReceiveFromOtherPaneRight,
      onEditPermissions: handleEditPermissionsRight,
      onEditFile: handleEditFileRight,
      onOpenFile: handleOpenFileRight,
      onOpenFileWith: handleOpenFileWithRight,
    }),
    [],
  );

  const dragCallbacks = useMemo<SftpDragCallbacks>(
    () => ({
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
    }),
    [],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const visibleTransfers = useMemo(
    () => sftp.transfers.slice(-5),
    [sftp.transfers],
  );

  const containerStyle: React.CSSProperties = isActive
    ? {}
    : {
      visibility: "hidden",
      pointerEvents: "none",
      position: "absolute",
      zIndex: -1,
    };

  // Tab management callbacks - using sftpRef for stable references
  const [showHostPickerLeft, setShowHostPickerLeft] = useState(false);
  const [showHostPickerRight, setShowHostPickerRight] = useState(false);
  const [hostSearchLeft, setHostSearchLeft] = useState("");
  const [hostSearchRight, setHostSearchRight] = useState("");

  const handleAddTabLeft = useCallback(() => {
    sftpRef.current.addTab("left");
    setShowHostPickerLeft(true);
  }, []);

  const handleAddTabRight = useCallback(() => {
    sftpRef.current.addTab("right");
    setShowHostPickerRight(true);
  }, []);

  const handleCloseTabLeft = useCallback((tabId: string) => {
    sftpRef.current.closeTab("left", tabId);
  }, []);

  const handleCloseTabRight = useCallback((tabId: string) => {
    sftpRef.current.closeTab("right", tabId);
  }, []);

  const handleSelectTabLeft = useCallback((tabId: string) => {
    sftpRef.current.selectTab("left", tabId);
  }, []);

  const handleSelectTabRight = useCallback((tabId: string) => {
    sftpRef.current.selectTab("right", tabId);
  }, []);

  // Don't read activeTabId here - let SftpTabBar and SftpPaneWrapper subscribe to store
  // This prevents SftpViewInner from re-rendering on tab switch

  // Memoize panes arrays to prevent unnecessary re-renders
  const leftPanes = useMemo(() =>
    sftp.leftTabs.tabs.length > 0 ? sftp.leftTabs.tabs : [sftp.leftPane],
    [sftp.leftTabs.tabs, sftp.leftPane]
  );
  const rightPanes = useMemo(() =>
    sftp.rightTabs.tabs.length > 0 ? sftp.rightTabs.tabs : [sftp.rightPane],
    [sftp.rightTabs.tabs, sftp.rightPane]
  );

  // Reorder and cross-pane move handlers - using sftpRef for stable references
  const handleReorderTabsLeft = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      sftpRef.current.reorderTabs("left", draggedId, targetId, position);
    },
    [],
  );

  const handleReorderTabsRight = useCallback(
    (draggedId: string, targetId: string, position: "before" | "after") => {
      sftpRef.current.reorderTabs("right", draggedId, targetId, position);
    },
    [],
  );

  // Cross-pane tab move handlers
  // When dropping on right side, the tab is coming FROM left side
  const handleMoveTabFromLeftToRight = useCallback(
    (tabId: string) => {
      sftpRef.current.moveTabToOtherSide("left", tabId);
    },
    [],
  );

  // When dropping on left side, the tab is coming FROM right side
  const handleMoveTabFromRightToLeft = useCallback(
    (tabId: string) => {
      sftpRef.current.moveTabToOtherSide("right", tabId);
    },
    [],
  );

  const handleHostSelectLeft = useCallback((host: Host | "local") => {
    sftpRef.current.connect("left", host);
    setShowHostPickerLeft(false);
  }, []);

  const handleHostSelectRight = useCallback((host: Host | "local") => {
    sftpRef.current.connect("right", host);
    setShowHostPickerRight(false);
  }, []);

  // Use leftTabs/rightTabs directly for more accurate memoization
  const leftTabsInfo = useMemo(() => {
    return sftp.leftTabs.tabs.map((pane) => ({
      id: pane.id,
      label: pane.connection?.hostLabel || "New Tab",
      isLocal: pane.connection?.isLocal || false,
      hostId: pane.connection?.hostId || null,
    }));
  }, [sftp.leftTabs.tabs]);

  const rightTabsInfo = useMemo(() => {
    return sftp.rightTabs.tabs.map((pane) => ({
      id: pane.id,
      label: pane.connection?.hostLabel || "New Tab",
      isLocal: pane.connection?.isLocal || false,
      hostId: pane.connection?.hostId || null,
    }));
  }, [sftp.rightTabs.tabs]);

  return (
    <SftpContextProvider
      hosts={hosts}
      draggedFiles={draggedFiles}
      dragCallbacks={dragCallbacks}
      leftCallbacks={leftCallbacks}
      rightCallbacks={rightCallbacks}
    >
      <div
        className={cn(
          "absolute inset-0 min-h-0 flex flex-col",
          isActive ? "z-20" : "",
        )}
        style={containerStyle}
      >
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 border-t border-border/70">
          <div className="relative border-r border-border/70 flex flex-col">
            {/* Left side tab bar - only show when there are tabs */}
            {leftTabsInfo.length > 0 && (
              <SftpTabBar
                tabs={leftTabsInfo}
                side="left"
                onSelectTab={handleSelectTabLeft}
                onCloseTab={handleCloseTabLeft}
                onAddTab={handleAddTabLeft}
                onReorderTabs={handleReorderTabsLeft}
                onMoveTabToOtherSide={handleMoveTabFromRightToLeft}
              />
            )}
            <div className="relative flex-1 min-h-0">
              {leftPanes.map((pane, idx) => (
                <SftpPaneWrapper
                  key={pane.id}
                  side="left"
                  paneId={pane.id}
                  isFirstPane={idx === 0}
                >
                  <SftpPaneView
                    side="left"
                    pane={pane}
                    showHeader
                    showEmptyHeader={false}
                  />
                </SftpPaneWrapper>
              ))}
            </div>
          </div>
          <div className="relative flex flex-col">
            {/* Right side tab bar - only show when there are tabs */}
            {rightTabsInfo.length > 0 && (
              <SftpTabBar
                tabs={rightTabsInfo}
                side="right"
                onSelectTab={handleSelectTabRight}
                onCloseTab={handleCloseTabRight}
                onAddTab={handleAddTabRight}
                onReorderTabs={handleReorderTabsRight}
                onMoveTabToOtherSide={handleMoveTabFromLeftToRight}
              />
            )}
            <div className="relative flex-1 min-h-0">
              {rightPanes.map((pane, idx) => (
                <SftpPaneWrapper
                  key={pane.id}
                  side="right"
                  paneId={pane.id}
                  isFirstPane={idx === 0}
                >
                  <SftpPaneView
                    side="right"
                    pane={pane}
                    showHeader
                    showEmptyHeader={false}
                  />
                </SftpPaneWrapper>
              ))}
            </div>
          </div>
        </div>

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
                  onCancel={() => sftp.cancelTransfer(task.id)}
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
      </div>
    </SftpContextProvider>
  );
};

const sftpViewAreEqual = (prev: SftpViewProps, next: SftpViewProps): boolean =>
  prev.hosts === next.hosts && prev.keys === next.keys && prev.identities === next.identities;

export const SftpView = memo(SftpViewInner, sftpViewAreEqual);
SftpView.displayName = "SftpView";
