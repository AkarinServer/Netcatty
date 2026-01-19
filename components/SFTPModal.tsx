import {
  ArrowUp,
  ChevronRight,
  Database,
  Download,
  Edit2,
  ExternalLink,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  Folder,
  FolderOpen,
  Globe,
  Home,
  Key,
  Link,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Terminal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import { useSftpBackend } from "../application/state/useSftpBackend";
import { useSftpFileAssociations } from "../application/state/useSftpFileAssociations";
import { useSettingsState } from "../application/state/useSettingsState";
import { logger } from "../lib/logger";
import { getFileExtension, isKnownBinaryFile, FileOpenerType, SystemAppInfo } from "../lib/sftpFileUtils";
import { cn } from "../lib/utils";
import { Host, RemoteFile } from "../types";
import { filterHiddenFiles } from "./sftp";
import { DistroAvatar } from "./DistroAvatar";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

// Comprehensive file icon helper
const getFileIcon = (fileName: string, isDirectory: boolean, isSymlink?: boolean) => {
  if (isDirectory)
    return (
      <Folder
        size={18}
        fill="currentColor"
        fillOpacity={0.2}
        className="text-blue-400"
      />
    );

  // For symlink files (not directories), show a special symlink icon
  if (isSymlink) {
    return <ExternalLink size={18} className="text-cyan-500" />;
  }

  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const iconClass = "text-muted-foreground";

  // Documents
  if (["doc", "docx", "rtf", "odt"].includes(ext))
    return <FileText size={18} className="text-blue-500" />;
  if (["xls", "xlsx", "csv", "ods"].includes(ext))
    return <FileSpreadsheet size={18} className="text-green-500" />;
  if (["ppt", "pptx", "odp"].includes(ext))
    return <FileType size={18} className="text-orange-500" />;
  if (["pdf"].includes(ext))
    return <FileText size={18} className="text-red-500" />;

  // Code/Scripts
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext))
    return <FileCode size={18} className="text-yellow-500" />;
  if (["py", "pyc", "pyw"].includes(ext))
    return <FileCode size={18} className="text-blue-400" />;
  if (["sh", "bash", "zsh", "fish", "bat", "cmd", "ps1"].includes(ext))
    return <Terminal size={18} className="text-green-400" />;
  if (["c", "cpp", "h", "hpp", "cc", "cxx"].includes(ext))
    return <FileCode size={18} className="text-blue-600" />;
  if (["java", "class", "jar"].includes(ext))
    return <FileCode size={18} className="text-orange-600" />;
  if (["go"].includes(ext))
    return <FileCode size={18} className="text-cyan-500" />;
  if (["rs"].includes(ext))
    return <FileCode size={18} className="text-orange-400" />;
  if (["rb"].includes(ext))
    return <FileCode size={18} className="text-red-400" />;
  if (["php"].includes(ext))
    return <FileCode size={18} className="text-purple-500" />;
  if (["html", "htm", "xhtml"].includes(ext))
    return <Globe size={18} className="text-orange-500" />;
  if (["css", "scss", "sass", "less"].includes(ext))
    return <FileCode size={18} className="text-blue-500" />;
  if (["vue", "svelte"].includes(ext))
    return <FileCode size={18} className="text-green-500" />;

  // Config/Data
  if (["json", "json5"].includes(ext))
    return <FileCode size={18} className="text-yellow-600" />;
  if (["xml", "xsl", "xslt"].includes(ext))
    return <FileCode size={18} className="text-orange-400" />;
  if (["yml", "yaml"].includes(ext))
    return <Settings size={18} className="text-pink-400" />;
  if (["toml", "ini", "conf", "cfg", "config"].includes(ext))
    return <Settings size={18} className="text-gray-400" />;
  if (["env"].includes(ext))
    return <Lock size={18} className="text-yellow-500" />;
  if (["sql", "sqlite", "db"].includes(ext))
    return <Database size={18} className="text-blue-400" />;

  // Images
  if (
    [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "bmp",
      "webp",
      "svg",
      "ico",
      "tiff",
      "tif",
      "heic",
      "heif",
      "avif",
    ].includes(ext)
  )
    return <FileImage size={18} className="text-purple-400" />;

  // Videos
  if (
    [
      "mp4",
      "mkv",
      "avi",
      "mov",
      "wmv",
      "flv",
      "webm",
      "m4v",
      "3gp",
      "mpeg",
      "mpg",
    ].includes(ext)
  )
    return <FileVideo size={18} className="text-pink-500" />;

  // Audio
  if (
    ["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "aiff"].includes(
      ext,
    )
  )
    return <FileAudio size={18} className="text-green-400" />;

  // Archives
  if (
    [
      "zip",
      "rar",
      "7z",
      "tar",
      "gz",
      "bz2",
      "xz",
      "tgz",
      "tbz2",
      "lz",
      "lzma",
      "cab",
      "iso",
      "dmg",
    ].includes(ext)
  )
    return <FileArchive size={18} className="text-amber-500" />;

  // Executables
  if (["exe", "msi", "app", "deb", "rpm", "apk", "ipa"].includes(ext))
    return <File size={18} className="text-red-400" />;
  if (["dll", "so", "dylib"].includes(ext))
    return <File size={18} className="text-gray-500" />;

  // Keys/Certs
  if (["pem", "crt", "cer", "key", "pub", "ppk"].includes(ext))
    return <Key size={18} className="text-yellow-400" />;

  // Text/Markdown
  if (["md", "markdown", "mdx"].includes(ext))
    return <FileText size={18} className="text-gray-400" />;
  if (["txt", "log", "text"].includes(ext))
    return <FileText size={18} className={iconClass} />;

  // Default
  return <File size={18} className={iconClass} />;
};

// Format bytes with appropriate unit (B, KB, MB, GB)
const formatBytes = (bytes: number | string): string => {
  const numBytes = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(numBytes) || numBytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(numBytes) / Math.log(1024));
  const size = numBytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

const formatDate = (dateStr: string | number | undefined, locale?: string): string => {
  if (!dateStr) return "--";
  const date =
    typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr);
  if (isNaN(date.getTime())) return String(dateStr);
  return date.toLocaleString(locale || undefined);
};

interface SFTPModalProps {
  host: Host;
  credentials: {
    username?: string;
    hostname: string;
    port?: number;
    password?: string;
    privateKey?: string;
    certificate?: string;
    passphrase?: string;
    publicKey?: string;
    keyId?: string;
    keySource?: 'generated' | 'imported';
    proxy?: NetcattyProxyConfig;
    jumpHosts?: NetcattyJumpHost[];
  };
  open: boolean;
  onClose: () => void;
  /** Initial path to open in SFTP. If not accessible, falls back to home directory. */
  initialPath?: string;
}

// Sort configuration
type SortField = "name" | "size" | "modified";
type SortOrder = "asc" | "desc";

// Transfer task type for modal
interface UploadTask {
  id: string;
  fileName: string;
  status: "pending" | "uploading" | "completed" | "failed";
  progress: number;
  totalBytes: number;
  transferredBytes: number;
  speed: number; // bytes per second
  startTime: number;
  error?: string;
}

const SFTPModal: React.FC<SFTPModalProps> = ({
  host,
  credentials,
  open,
  onClose,
  initialPath,
}) => {
  const {
    openSftp,
    closeSftp: closeSftpBackend,
    listSftp,
    readSftp,
    writeSftpBinaryWithProgress,
    writeSftpBinary,
    writeSftp,
    deleteSftp,
    mkdirSftp,
    renameSftp,
    chmodSftp,
    statSftp,
    listLocalDir,
    readLocalFile,
    writeLocalFile,
    deleteLocalFile,
    mkdirLocal,
    getHomeDir,
    selectApplication,
    downloadSftpToTempAndOpen,
  } = useSftpBackend();
  const { t, resolvedLocale } = useI18n();
  const { sftpAutoSync, sftpShowHiddenFiles } = useSettingsState();
  const isLocalSession = host.protocol === "local";
  const [currentPath, setCurrentPath] = useState("/");
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const sftpIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const lastInitialPathRef = useRef<string | undefined>(undefined);
  const navigatingRef = useRef(false);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const localHomeRef = useRef<string | null>(null);

  // Reconnect state
  const [reconnecting, setReconnecting] = useState(false);
  const reconnectingRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Rename dialog state
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RemoteFile | null>(null);
  const [renameName, setRenameName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);

  // Permissions dialog state
  const [showPermissionsDialog, setShowPermissionsDialog] = useState(false);
  const [permissionsTarget, setPermissionsTarget] = useState<RemoteFile | null>(null);
  const [permissions, setPermissions] = useState({
    owner: { read: false, write: false, execute: false },
    group: { read: false, write: false, execute: false },
    others: { read: false, write: false, execute: false },
  });
  const [isChangingPermissions, setIsChangingPermissions] = useState(false);

  // File opener state
  const { getOpenerForFile, setOpenerForExtension } = useSftpFileAssociations();
  const [showFileOpenerDialog, setShowFileOpenerDialog] = useState(false);
  const [fileOpenerTarget, setFileOpenerTarget] = useState<RemoteFile | null>(null);

  // Text editor state
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [textEditorTarget, setTextEditorTarget] = useState<RemoteFile | null>(null);
  const [textEditorContent, setTextEditorContent] = useState("");
  const [loadingTextContent, setLoadingTextContent] = useState(false);

  // Virtual scrolling refs and state
  const fileListRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [rowHeight, setRowHeight] = useState(40); // Default row height estimate

  // Directory listing cache + load sequence to avoid stale updates
  const DIR_CACHE_TTL_MS = 10_000;
  const dirCacheRef = useRef<
    Map<string, { files: RemoteFile[]; timestamp: number }>
  >(new Map());
  const loadSeqRef = useRef(0);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Column widths (percentages)
  const [columnWidths, setColumnWidths] = useState({
    name: 45,
    size: 15,
    modified: 25,
    actions: 15,
  });
  const resizingRef = useRef<{
    field: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Editable path state
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [editingPathValue, setEditingPathValue] = useState("");
  const pathInputRef = useRef<HTMLInputElement>(null);

  // Breadcrumb truncation constant
  const MAX_VISIBLE_BREADCRUMB_PARTS = 4;

  const isWindowsPath = useCallback((path: string): boolean => {
    return /^[A-Za-z]:/.test(path);
  }, []);

  const normalizeWindowsRoot = useCallback((path: string): string => {
    const normalized = path.replace(/\//g, "\\");
    if (/^[A-Za-z]:\\$/.test(normalized)) return normalized;
    if (/^[A-Za-z]:$/.test(normalized)) return `${normalized}\\`;
    return normalized;
  }, []);

  const joinPath = useCallback(
    (base: string, name: string): string => {
      if (isLocalSession && isWindowsPath(base)) {
        const normalizedBase = normalizeWindowsRoot(base).replace(/[\\/]+$/, "");
        return `${normalizedBase}\\${name}`;
      }
      if (!isLocalSession) {
        if (base === "/") return `/${name}`;
        return `${base}/${name}`;
      }
      // Local unix-like path
      if (base === "/") return `/${name}`;
      return `${base}/${name}`;
    },
    [isLocalSession, isWindowsPath, normalizeWindowsRoot],
  );

  const isRootPath = useCallback(
    (path: string): boolean => {
      if (isLocalSession && isWindowsPath(path)) {
        return /^[A-Za-z]:\\?$/.test(path.replace(/\//g, "\\"));
      }
      return path === "/";
    },
    [isLocalSession, isWindowsPath],
  );

  const getParentPath = useCallback(
    (path: string): string => {
      if (isLocalSession && isWindowsPath(path)) {
        const normalized = normalizeWindowsRoot(path).replace(/[\\]+$/, "");
        const drive = normalized.slice(0, 2);
        if (/^[A-Za-z]:$/.test(normalized) || /^[A-Za-z]:\\$/.test(normalized)) {
          return `${drive}\\`;
        }
        const rest = normalized.slice(2).replace(/^[\\]+/, "");
        const parts = rest ? rest.split(/[\\]+/).filter(Boolean) : [];
        if (parts.length <= 1) return `${drive}\\`;
        parts.pop();
        return `${drive}\\${parts.join("\\")}`;
      }
      if (path === "/") return "/";
      const parts = path.split("/").filter(Boolean);
      parts.pop();
      return parts.length ? `/${parts.join("/")}` : "/";
    },
    [isLocalSession, isWindowsPath, normalizeWindowsRoot],
  );

  const getRootPath = useCallback(
    (path: string): string => {
      if (isLocalSession && isWindowsPath(path)) {
        const drive = path.replace(/\//g, "\\").slice(0, 2);
        return `${drive}\\`;
      }
      return "/";
    },
    [isLocalSession, isWindowsPath],
  );

  const getWindowsDrive = useCallback(
    (path: string): string | null => {
      if (!isWindowsPath(path)) return null;
      const normalized = path.replace(/\//g, "\\");
      return /^[A-Za-z]:/.test(normalized) ? normalized.slice(0, 2) : null;
    },
    [isWindowsPath],
  );

  const getBreadcrumbs = useCallback(
    (path: string): string[] => {
      if (isLocalSession && isWindowsPath(path)) {
        const normalized = normalizeWindowsRoot(path).replace(/[\\]+$/, "");
        const rest = normalized.slice(2).replace(/^[\\]+/, "");
        const parts = rest ? rest.split(/[\\]+/).filter(Boolean) : [];
        return parts;
      }
      return path === "/" ? [] : path.split("/").filter(Boolean);
    },
    [isLocalSession, isWindowsPath, normalizeWindowsRoot],
  );

  const breadcrumbPathAt = useCallback(
    (breadcrumbs: string[], idx: number): string => {
      if (isLocalSession) {
        const drive = getWindowsDrive(currentPath);
        if (drive) {
          const rest = breadcrumbs.slice(0, idx + 1).join("\\");
          return rest ? `${drive}\\${rest}` : `${drive}\\`;
        }
      }
      return "/" + breadcrumbs.slice(0, idx + 1).join("/");
    },
    [currentPath, getWindowsDrive, isLocalSession],
  );

  const ensureSftp = useCallback(async () => {
    if (isLocalSession) throw new Error("Local session does not use SFTP");
    if (sftpIdRef.current) return sftpIdRef.current;
    const sftpId = await openSftp({
      sessionId: `sftp-modal-${host.id}`,
      hostname: credentials.hostname,
      username: credentials.username || "root",
      port: credentials.port || 22,
      password: credentials.password,
      privateKey: credentials.privateKey,
      certificate: credentials.certificate,
      passphrase: credentials.passphrase,
      publicKey: credentials.publicKey,
      keyId: credentials.keyId,
      keySource: credentials.keySource,
      proxy: credentials.proxy,
      jumpHosts: credentials.jumpHosts,
    });
    sftpIdRef.current = sftpId;
    return sftpId;
  }, [
    isLocalSession,
    host.id,
    credentials.hostname,
    credentials.username,
    credentials.port,
    credentials.password,
    credentials.privateKey,
    credentials.certificate,
    credentials.passphrase,
    credentials.publicKey,
    credentials.keyId,
    credentials.keySource,
    credentials.proxy,
    credentials.jumpHosts,
    openSftp,
  ]);

  // Check if an error indicates a stale/lost SFTP session
  const isSessionError = useCallback((err: unknown): boolean => {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes("session not found") ||
      msg.includes("sftp session") ||
      msg.includes("not found") ||
      msg.includes("closed") ||
      msg.includes("connection reset") ||
      msg.includes("eof")
    );
  }, []);

  // Handle session error - triggers auto-reconnect
  const handleSessionError = useCallback(() => {
    if (reconnectingRef.current) return; // Prevent duplicate reconnect attempts

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      toast.error(t("sftp.error.reconnectFailed"), "SFTP");
      setReconnecting(false);
      reconnectingRef.current = false;
      return;
    }

    // Clear stale session reference
    sftpIdRef.current = null;

    // Set reconnecting state
    reconnectingRef.current = true;
    reconnectAttemptsRef.current++;
    setReconnecting(true);
  }, [t]);

  const loadFiles = useCallback(
    async (path: string, options?: { force?: boolean }) => {
      const requestId = ++loadSeqRef.current;
      const cacheKey = `${host.id}::${path}`;
      const cached = options?.force
        ? undefined
        : dirCacheRef.current.get(cacheKey);

      if (
        cached &&
        Date.now() - cached.timestamp < DIR_CACHE_TTL_MS &&
        cached.files
      ) {
        setFiles(cached.files);
        setSelectedFiles(new Set());
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const list = isLocalSession
          ? await listLocalDir(path)
          : await listSftp(await ensureSftp(), path);
        if (loadSeqRef.current !== requestId) return;
        dirCacheRef.current.set(cacheKey, {
          files: list,
          timestamp: Date.now(),
        });
        setFiles(list);
        setSelectedFiles(new Set());
      } catch (e) {
        if (loadSeqRef.current !== requestId) return;

        // Check if this is a session error that can trigger auto-reconnect
        if (!isLocalSession && isSessionError(e) && files.length > 0) {
          logger.info("[SFTP] Session lost, attempting to reconnect...");
          handleSessionError();
          return;
        }

        logger.error("Failed to load files", e);
        toast.error(
          e instanceof Error ? e.message : t("sftp.error.loadFailed"),
          "SFTP",
        );
        setFiles([]);
      } finally {
        if (loadSeqRef.current === requestId) {
          setLoading(false);
        }
      }
    },
    [ensureSftp, host.id, isLocalSession, listLocalDir, listSftp, t, isSessionError, handleSessionError, files.length],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const cacheKey = `${host.id}::${currentPath}`;
    const cached = dirCacheRef.current.get(cacheKey);
    const isFresh =
      cached && Date.now() - cached.timestamp < DIR_CACHE_TTL_MS;
    if (!isFresh) {
      setFiles([]);
      setSelectedFiles(new Set());
    }
    setScrollTop(0);
  }, [currentPath, host.id, open]);

  const closeSftpSession = useCallback(async () => {
    if (!isLocalSession && sftpIdRef.current) {
      try {
        await closeSftpBackend(sftpIdRef.current);
      } catch {
        // Silently ignore close errors - connection may already be closed
      }
    }
    sftpIdRef.current = null;
  }, [closeSftpBackend, isLocalSession]);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      void closeSftpSession();
    };
  }, [closeSftpSession]);

  // Auto-reconnect effect
  useEffect(() => {
    if (!reconnecting || !reconnectingRef.current || isLocalSession) return;

    const attemptReconnect = async () => {
      // Small delay before reconnecting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!reconnectingRef.current) return; // May have been cancelled

      try {
        // Re-establish SFTP connection
        const sftpId = await openSftp({
          sessionId: `sftp-modal-${host.id}`,
          hostname: credentials.hostname,
          username: credentials.username || "root",
          port: credentials.port || 22,
          password: credentials.password,
          privateKey: credentials.privateKey,
          certificate: credentials.certificate,
          passphrase: credentials.passphrase,
          publicKey: credentials.publicKey,
          keyId: credentials.keyId,
          keySource: credentials.keySource,
          proxy: credentials.proxy,
          jumpHosts: credentials.jumpHosts,
        });
        sftpIdRef.current = sftpId;

        // Refresh current directory
        const list = await listSftp(sftpId, currentPath);
        dirCacheRef.current.set(`${host.id}::${currentPath}`, {
          files: list,
          timestamp: Date.now(),
        });
        setFiles(list);
        setSelectedFiles(new Set());

        // Reconnect successful
        reconnectingRef.current = false;
        reconnectAttemptsRef.current = 0;
        setReconnecting(false);
        toast.success(t("sftp.reconnected"), "SFTP");
      } catch (e) {
        logger.error("[SFTP] Reconnect failed", e);
        // Check if we can retry
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          // Trigger another attempt
          sftpIdRef.current = null;
          reconnectingRef.current = false; // Reset to allow handleSessionError to work
          handleSessionError();
        } else {
          // Max retries reached
          reconnectingRef.current = false;
          setReconnecting(false);
          toast.error(t("sftp.error.reconnectFailed"), "SFTP");
        }
      } finally {
        setLoading(false);
      }
    };

    attemptReconnect();
  }, [reconnecting, isLocalSession, host.id, credentials, openSftp, listSftp, currentPath, t, handleSessionError]);

  useEffect(() => {
    if (open) {
      // Check if we need to reinitialize (either first time or initialPath changed)
      const needsReinit = !initializedRef.current || initialPath !== lastInitialPathRef.current;

      if (needsReinit) {
        initializedRef.current = true;
        lastInitialPathRef.current = initialPath;
        if (isLocalSession) {
          void (async () => {
            let home = localHomeRef.current;
            if (!home) {
              const fetchedHome = await getHomeDir();
              home = fetchedHome ?? null;
              localHomeRef.current = home;
            }
            const startPath = home ||
              (navigator.platform.toLowerCase().includes("win") ? "C:\\" : "/");
            setCurrentPath(startPath);
            loadFiles(startPath);
          })();
        } else {
          // For remote sessions, try initialPath first, then fall back to home directory
          void (async () => {
            const username = credentials.username || 'root';
            // Root user's home is /root, other users' home is /home/username
            const homePath = username === 'root' ? '/root' : `/home/${username}`;

            // Set loading state immediately for better UX
            setLoading(true);

            // If initialPath is provided, try to use it first
            if (initialPath) {
              try {
                const sftpId = await ensureSftp();
                const list = await listSftp(sftpId, initialPath);
                setCurrentPath(initialPath);
                setFiles(list);
                setSelectedFiles(new Set());
                dirCacheRef.current.set(`${host.id}::${initialPath}`, {
                  files: list,
                  timestamp: Date.now(),
                });
                setLoading(false);
                return; // Successfully opened at initialPath
              } catch {
                // initialPath not accessible, fall back to home directory
                logger.warn(`[SFTP] Initial path ${initialPath} not accessible, falling back to home`);
              }
            }

            try {
              const sftpId = await ensureSftp();
              const list = await listSftp(sftpId, homePath);
              setCurrentPath(homePath);
              setFiles(list);
              setSelectedFiles(new Set());
              dirCacheRef.current.set(`${host.id}::${homePath}`, {
                files: list,
                timestamp: Date.now(),
              });
              setLoading(false);
            } catch {
              // Home directory not accessible, fall back to /
              logger.warn(`[SFTP] Home ${homePath} not accessible, using /`);
              try {
                const sftpId = await ensureSftp();
                const list = await listSftp(sftpId, '/');
                setCurrentPath('/');
                setFiles(list);
                setSelectedFiles(new Set());
                dirCacheRef.current.set(`${host.id}::/`, {
                  files: list,
                  timestamp: Date.now(),
                });
              } catch (e) {
                logger.error('[SFTP] Failed to load root directory', e);
                toast.error(t("sftp.error.loadFailed"), "SFTP");
              } finally {
                setLoading(false);
              }
            }
          })();
        }
        return;
      }
      loadFiles(currentPath);
    } else {
      // Invalidate any in-flight directory load
      loadSeqRef.current += 1;
      void closeSftpSession();
      initializedRef.current = false;
    }
  }, [open, currentPath, loadFiles, closeSftpSession, getHomeDir, isLocalSession, credentials.username, ensureSftp, listSftp, host.id, t, initialPath]);

  const handleNavigate = useCallback((path: string) => {
    // Prevent double navigation (e.g., from double-click race condition)
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setCurrentPath(path);
    // Reset lock after a short delay
    setTimeout(() => {
      navigatingRef.current = false;
    }, 300);
  }, []);

  const handleUp = () => {
    if (isRootPath(currentPath)) return;
    setCurrentPath(getParentPath(currentPath));
  };

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
    [currentPath, ensureSftp, isLocalSession, joinPath, readLocalFile, readSftp, t],
  );

  const handleUploadFile = async (
    file: File,
    taskId: string,
  ): Promise<boolean> => {
    const startTime = Date.now();

    // Update task to uploading with start time
    setUploadTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
            ...t,
            status: "uploading" as const,
            totalBytes: file.size,
            startTime,
            speed: 0,
          }
          : t,
      ),
    );

    try {
      const arrayBuffer = await file.arrayBuffer();
      const fullPath = joinPath(currentPath, file.name);

      if (isLocalSession) {
        await writeLocalFile(fullPath, arrayBuffer);
        const totalTime = (Date.now() - startTime) / 1000;
        const finalSpeed = totalTime > 0 ? file.size / totalTime : 0;
        setUploadTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                ...t,
                status: "completed" as const,
                progress: 100,
                transferredBytes: file.size,
                speed: finalSpeed,
              }
              : t,
          ),
        );
        return true;
      }

      const sftpId = await ensureSftp();

      // Use real-time progress API if available
      const progressResult = await writeSftpBinaryWithProgress(
        sftpId,
        fullPath,
        arrayBuffer,
        taskId,
        // Real-time progress callback
        (transferred: number, total: number, speed: number) => {
          const progress = total > 0 ? Math.round((transferred / total) * 100) : 0;
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === taskId && t.status === "uploading"
                ? {
                  ...t,
                  transferredBytes: transferred,
                  progress,
                  speed,
                }
                : t,
            ),
          );
        },
        // Complete callback
        () => {
          const totalTime = (Date.now() - startTime) / 1000;
          const finalSpeed = totalTime > 0 ? file.size / totalTime : 0;
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                  ...t,
                  status: "completed" as const,
                  progress: 100,
                  transferredBytes: file.size,
                  speed: finalSpeed,
                }
                : t,
            ),
          );
        },
        // Error callback
        (error: string) => {
          setUploadTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? {
                  ...t,
                  status: "failed" as const,
                  error,
                }
                : t,
            ),
          );
        },
      );
      if (progressResult) return true;

      try {
        // Fallback to non-progress API
        await writeSftpBinary(sftpId, fullPath, arrayBuffer);
      } catch {
        // Fallback: read as text (works for text files)
        const text = await file.text();
        await writeSftp(sftpId, fullPath, text);
      }

      // Calculate final speed (for fallback methods)
      const totalTime = (Date.now() - startTime) / 1000;
      const finalSpeed = totalTime > 0 ? file.size / totalTime : 0;

      // Update task to completed
      setUploadTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: "completed" as const,
              progress: 100,
              transferredBytes: file.size,
              speed: finalSpeed,
            }
            : t,
        ),
      );
      return true;
    } catch (e) {
      setUploadTasks((prev) =>
        prev.map((task) =>
          task.id === taskId
            ? {
              ...task,
              status: "failed" as const,
              error: e instanceof Error ? e.message : t("sftp.error.uploadFailed"),
            }
            : task,
        ),
      );
      return false;
    }
  };

  const handleUploadMultiple = async (fileList: FileList) => {
    if (fileList.length === 0) return;

    // Create all tasks upfront
    const newTasks: UploadTask[] = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      fileName: file.name,
      status: "pending" as const,
      progress: 0,
      totalBytes: file.size,
      transferredBytes: 0,
      speed: 0,
      startTime: 0,
    }));

    setUploadTasks((prev) => [...prev, ...newTasks]);
    setUploading(true);

    // Upload files sequentially
    const filesToUpload = Array.from(fileList);
    for (let i = 0; i < filesToUpload.length; i++) {
      await handleUploadFile(filesToUpload[i], newTasks[i].id);
    }

    setUploading(false);
    await loadFiles(currentPath, { force: true });

    // Auto-clear completed tasks after 3 seconds
    setTimeout(() => {
      setUploadTasks((prev) => prev.filter((t) => t.status !== "completed"));
    }, 3000);
  };

  const handleDelete = async (file: RemoteFile) => {
    if (!confirm(t("sftp.confirm.deleteOne", { name: file.name }))) return;
    try {
      const fullPath = joinPath(currentPath, file.name);
      if (isLocalSession) {
        await deleteLocalFile(fullPath);
      } else {
        // Use deleteSftp which handles both files and directories
        await deleteSftp(await ensureSftp(), fullPath);
      }
      await loadFiles(currentPath, { force: true });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("sftp.error.deleteFailed"),
        "SFTP",
      );
    }
  };

  const handleCreateFolder = async () => {
    const folderName = prompt(t("sftp.prompt.newFolderName"));
    if (!folderName) return;
    try {
      const fullPath = joinPath(currentPath, folderName);
      if (isLocalSession) {
        await mkdirLocal(fullPath);
      } else {
        await mkdirSftp(await ensureSftp(), fullPath);
      }
      await loadFiles(currentPath, { force: true });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("sftp.error.createFolderFailed"),
        "SFTP",
      );
    }
  };

  // Open rename dialog
  const openRenameDialog = useCallback((file: RemoteFile) => {
    setRenameTarget(file);
    setRenameName(file.name);
    setShowRenameDialog(true);
  }, []);

  // Handle rename
  const handleRename = async () => {
    if (!renameTarget || !renameName.trim() || isRenaming) return;
    if (renameName.trim() === renameTarget.name) {
      setShowRenameDialog(false);
      return;
    }
    setIsRenaming(true);
    try {
      const oldPath = joinPath(currentPath, renameTarget.name);
      const newPath = joinPath(currentPath, renameName.trim());
      if (isLocalSession) {
        // For local, use renameLocalFile if available, otherwise show error
        toast.error("Local rename not implemented", "SFTP");
      } else {
        await renameSftp(await ensureSftp(), oldPath, newPath);
      }
      setShowRenameDialog(false);
      setRenameTarget(null);
      setRenameName("");
      await loadFiles(currentPath, { force: true });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("sftp.error.renameFailed"),
        "SFTP",
      );
    } finally {
      setIsRenaming(false);
    }
  };

  // Parse permissions string to object
  // Supports both symbolic format (rwxr-xr-x) and octal format (755)
  const parsePermissions = useCallback((perms: string | undefined) => {
    const defaultPerms = {
      owner: { read: false, write: false, execute: false },
      group: { read: false, write: false, execute: false },
      others: { read: false, write: false, execute: false },
    };
    if (!perms) return defaultPerms;

    // Check if it's octal format (e.g., "755", "644")
    if (/^[0-7]{3,4}$/.test(perms)) {
      const octal = perms.length === 4 ? perms.slice(1) : perms;
      const ownerBits = parseInt(octal[0], 10);
      const groupBits = parseInt(octal[1], 10);
      const othersBits = parseInt(octal[2], 10);
      return {
        owner: {
          read: (ownerBits & 4) !== 0,
          write: (ownerBits & 2) !== 0,
          execute: (ownerBits & 1) !== 0,
        },
        group: {
          read: (groupBits & 4) !== 0,
          write: (groupBits & 2) !== 0,
          execute: (groupBits & 1) !== 0,
        },
        others: {
          read: (othersBits & 4) !== 0,
          write: (othersBits & 2) !== 0,
          execute: (othersBits & 1) !== 0,
        },
      };
    }

    // Handle symbolic rwxrwxrwx format
    const pStr = perms.length === 10 ? perms.slice(1) : perms;
    if (pStr.length >= 9) {
      return {
        owner: {
          read: pStr[0] === 'r',
          write: pStr[1] === 'w',
          execute: pStr[2] === 'x' || pStr[2] === 's',
        },
        group: {
          read: pStr[3] === 'r',
          write: pStr[4] === 'w',
          execute: pStr[5] === 'x' || pStr[5] === 's',
        },
        others: {
          read: pStr[6] === 'r',
          write: pStr[7] === 'w',
          execute: pStr[8] === 'x' || pStr[8] === 't',
        },
      };
    }
    return defaultPerms;
  }, []);

  // Open permissions dialog
  const openPermissionsDialog = useCallback(async (file: RemoteFile) => {
    if (isLocalSession) {
      toast.error("Permissions not available for local files", "SFTP");
      return;
    }
    setPermissionsTarget(file);

    // Always fetch fresh permissions via stat for accuracy
    let permsStr = file.permissions;
    try {
      const fullPath = joinPath(currentPath, file.name);
      const stat = await statSftp(await ensureSftp(), fullPath);
      if (stat.permissions) {
        permsStr = stat.permissions;
      }
    } catch (e) {
      console.warn("Failed to fetch file permissions:", e);
    }

    setPermissions(parsePermissions(permsStr));
    setShowPermissionsDialog(true);
  }, [isLocalSession, currentPath, joinPath, statSftp, parsePermissions, ensureSftp]);

  // Toggle permission
  const togglePermission = useCallback((role: 'owner' | 'group' | 'others', perm: 'read' | 'write' | 'execute') => {
    setPermissions(prev => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role][perm] }
    }));
  }, []);

  // Get octal permissions string
  const getOctalPermissions = useCallback(() => {
    const getNum = (p: { read: boolean; write: boolean; execute: boolean }) =>
      (p.read ? 4 : 0) + (p.write ? 2 : 0) + (p.execute ? 1 : 0);
    return `${getNum(permissions.owner)}${getNum(permissions.group)}${getNum(permissions.others)}`;
  }, [permissions]);

  // Get symbolic permissions string
  const getSymbolicPermissions = useCallback(() => {
    const getSym = (p: { read: boolean; write: boolean; execute: boolean }) =>
      `${p.read ? 'r' : '-'}${p.write ? 'w' : '-'}${p.execute ? 'x' : '-'}`;
    return getSym(permissions.owner) + getSym(permissions.group) + getSym(permissions.others);
  }, [permissions]);

  // Handle permissions save
  const handleSavePermissions = async () => {
    if (!permissionsTarget || isChangingPermissions) return;
    setIsChangingPermissions(true);
    try {
      const fullPath = joinPath(currentPath, permissionsTarget.name);
      await chmodSftp(await ensureSftp(), fullPath, getOctalPermissions());
      setShowPermissionsDialog(false);
      setPermissionsTarget(null);
      await loadFiles(currentPath, { force: true });
      toast.success(t("sftp.permissions.success"), "SFTP");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("sftp.permissions.failed"),
        "SFTP",
      );
    } finally {
      setIsChangingPermissions(false);
    }
  };

  // File opener handlers
  const openFileOpenerDialog = useCallback((file: RemoteFile) => {
    setFileOpenerTarget(file);
    setShowFileOpenerDialog(true);
  }, []);

  const handleEditFile = useCallback(async (file: RemoteFile) => {
    try {
      setLoadingTextContent(true);
      setTextEditorTarget(file);
      const fullPath = joinPath(currentPath, file.name);
      const content = isLocalSession
        ? await readLocalFile(fullPath).then(buf => new TextDecoder().decode(buf))
        : await readSftp(await ensureSftp(), fullPath);
      setTextEditorContent(content);
      setShowTextEditor(true);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("sftp.error.loadFailed"),
        "SFTP",
      );
    } finally {
      setLoadingTextContent(false);
    }
  }, [currentPath, ensureSftp, isLocalSession, joinPath, readLocalFile, readSftp, t]);

  const handleSaveTextFile = useCallback(async (content: string) => {
    if (!textEditorTarget) return;
    const fullPath = joinPath(currentPath, textEditorTarget.name);
    if (isLocalSession) {
      const encoder = new TextEncoder();
      await writeLocalFile(fullPath, encoder.encode(content).buffer);
    } else {
      await writeSftp(await ensureSftp(), fullPath, content);
    }
  }, [currentPath, ensureSftp, isLocalSession, joinPath, textEditorTarget, writeLocalFile, writeSftp]);

  const handleOpenFile = useCallback(async (file: RemoteFile) => {
    const savedOpener = getOpenerForFile(file.name);

    if (savedOpener) {
      // Use saved opener based on openerType
      if (savedOpener.openerType === 'builtin-editor') {
        handleEditFile(file);
      } else if (savedOpener.openerType === 'system-app' && savedOpener.systemApp) {
        // Open with saved system application
        try {
          const fullPath = joinPath(currentPath, file.name);
          if (isLocalSession) {
            // For local files, open directly
            const bridge = (window as unknown as { netcatty?: NetcattyBridge }).netcatty;
            if (bridge?.openWithApplication) {
              await bridge.openWithApplication(fullPath, savedOpener.systemApp.path);
            }
          } else {
            const sftpId = await ensureSftp();
            await downloadSftpToTempAndOpen(sftpId, fullPath, file.name, savedOpener.systemApp.path, { enableWatch: sftpAutoSync });
          }
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : t("sftp.error.openFailed"),
            "SFTP"
          );
        }
      }
    } else {
      // Show opener dialog
      openFileOpenerDialog(file);
    }
  }, [getOpenerForFile, handleEditFile, openFileOpenerDialog, joinPath, currentPath, isLocalSession, ensureSftp, downloadSftpToTempAndOpen, sftpAutoSync, t]);

  const handleFileOpenerSelect = useCallback(async (openerType: FileOpenerType, setAsDefault: boolean, systemApp?: SystemAppInfo) => {
    if (!fileOpenerTarget) return;

    if (setAsDefault) {
      const ext = getFileExtension(fileOpenerTarget.name);
      console.log('[SFTPModal] Saving file association for extension:', ext, 'openerType:', openerType, 'systemApp:', systemApp);
      setOpenerForExtension(ext, openerType, systemApp);
    }

    setShowFileOpenerDialog(false);

    if (openerType === 'builtin-editor') {
      handleEditFile(fileOpenerTarget);
    } else if (openerType === 'system-app' && systemApp) {
      // Download and open with system application
      try {
        const fullPath = joinPath(currentPath, fileOpenerTarget.name);
        if (isLocalSession) {
          // For local files, open directly
          const bridge = (window as unknown as { netcatty?: NetcattyBridge }).netcatty;
          if (bridge?.openWithApplication) {
            await bridge.openWithApplication(fullPath, systemApp.path);
          }
        } else {
          const sftpId = await ensureSftp();
          await downloadSftpToTempAndOpen(sftpId, fullPath, fileOpenerTarget.name, systemApp.path, { enableWatch: sftpAutoSync });
        }
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : t("sftp.error.openFailed"),
          "SFTP"
        );
      }
    }

    setFileOpenerTarget(null);
  }, [fileOpenerTarget, setOpenerForExtension, handleEditFile, joinPath, currentPath, isLocalSession, ensureSftp, downloadSftpToTempAndOpen, sftpAutoSync, t]);

  // Callback for FileOpenerDialog to select a system application
  const handleSelectSystemApp = useCallback(async (): Promise<SystemAppInfo | null> => {
    const result = await selectApplication();
    if (result) {
      return { path: result.path, name: result.name };
    }
    return null;
  }, [selectApplication]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadMultiple(e.target.files);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  };

  // Drag and Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUploadMultiple(e.dataTransfer.files);
    }
  };

  const handleClose = async () => {
    await closeSftpSession();
    setIsEditingPath(false);
    onClose();
  };

  // Display files with parent entry (like SftpView)
  const displayFiles = useMemo(() => {
    // Filter hidden files using utility function
    const visibleFiles = filterHiddenFiles(files, sftpShowHiddenFiles);

    // Check if we're at root
    const atRoot = isRootPath(currentPath);
    if (atRoot) return visibleFiles;

    // Add ".." parent directory entry at the top (only if not at root)
    const parentEntry: RemoteFile = {
      name: "..",
      type: "directory",
      size: "--",
      lastModified: undefined,
    };
    return [parentEntry, ...visibleFiles.filter((f) => f.name !== "..")];
  }, [files, currentPath, isRootPath, sftpShowHiddenFiles]);

  // Sorted files
  const sortedFiles = useMemo(() => {
    if (!displayFiles.length) return displayFiles;

    // Keep ".." at the top, sort the rest
    const parentEntry = displayFiles.find((f) => f.name === "..");
    const otherFiles = displayFiles.filter((f) => f.name !== "..");

    const sorted = [...otherFiles].sort((a, b) => {
      // Directories and symlinks pointing to directories come first
      const aIsDir = a.type === "directory" || (a.type === "symlink" && a.linkTarget === "directory");
      const bIsDir = b.type === "directory" || (b.type === "symlink" && b.linkTarget === "directory");
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "size": {
          const sizeA =
            typeof a.size === "number"
              ? a.size
              : parseInt(String(a.size), 10) || 0;
          const sizeB =
            typeof b.size === "number"
              ? b.size
              : parseInt(String(b.size), 10) || 0;
          cmp = sizeA - sizeB;
          break;
        }
        case "modified": {
          const dateA = new Date(a.lastModified || 0).getTime();
          const dateB = new Date(b.lastModified || 0).getTime();
          cmp = dateA - dateB;
          break;
        }
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    return parentEntry ? [parentEntry, ...sorted] : sorted;
  }, [displayFiles, sortField, sortOrder]);

  // Virtual scrolling: measure viewport and row height
  useLayoutEffect(() => {
    const container = fileListRef.current;
    if (!container || !open) return;
    const update = () => setViewportHeight(container.clientHeight);
    update();
    const raf = window.requestAnimationFrame(update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [open, sortedFiles.length]);

  useLayoutEffect(() => {
    const container = fileListRef.current;
    if (!container || !open || sortedFiles.length === 0) return;
    const raf = window.requestAnimationFrame(() => {
      const rowElement = container.querySelector(
        '[data-sftp-modal-row="true"]',
      ) as HTMLElement | null;
      if (!rowElement) return;
      const nextHeight = Math.round(rowElement.getBoundingClientRect().height);
      if (nextHeight && Math.abs(nextHeight - rowHeight) > 1) {
        setRowHeight(nextHeight);
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, sortedFiles.length, rowHeight]);

  // Cleanup scroll frame on unmount
  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  // Virtual scrolling scroll handler
  const handleFileListScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const nextTop = e.currentTarget.scrollTop;
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        setScrollTop(nextTop);
      });
    },
    [],
  );

  // Virtual scrolling calculations
  const overscan = 6;
  const canVirtualize = open && viewportHeight > 0 && rowHeight > 0;
  const shouldVirtualize = canVirtualize && sortedFiles.length > 50; // Only virtualize for larger lists
  const totalHeight = shouldVirtualize
    ? sortedFiles.length * rowHeight
    : 0;
  const startIndex = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    : 0;
  const endIndex = shouldVirtualize
    ? Math.min(
      sortedFiles.length - 1,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan,
    )
    : sortedFiles.length - 1;
  const visibleRows = shouldVirtualize
    ? sortedFiles
      .slice(startIndex, endIndex + 1)
      .map((file, idx) => ({
        file,
        index: startIndex + idx,
        top: (startIndex + idx) * rowHeight,
      }))
    : sortedFiles.map((file, index) => ({
      file,
      index,
      top: 0,
    }));

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  // Column resize handlers
  const handleResizeStart = (field: string, e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = {
      field,
      startX: e.clientX,
      startWidth: columnWidths[field as keyof typeof columnWidths],
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
    setEditingPathValue(currentPath);
    setIsEditingPath(true);
    setTimeout(() => pathInputRef.current?.select(), 0);
  };

  const handlePathSubmit = () => {
    const fallbackPath =
      (isLocalSession && localHomeRef.current) || getRootPath(currentPath);
    const newPath = editingPathValue.trim() || fallbackPath;
    setIsEditingPath(false);
    if (newPath !== currentPath) {
      if (isLocalSession) {
        handleNavigate(newPath);
      } else {
        handleNavigate(newPath.startsWith("/") ? newPath : `/${newPath}`);
      }
    }
  };

  const handlePathKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePathSubmit();
    } else if (e.key === "Escape") {
      setIsEditingPath(false);
    }
  };

  // Breadcrumbs
  const breadcrumbs = getBreadcrumbs(currentPath);

  // Compute visible/hidden breadcrumbs for truncation (always truncate, no expansion)
  const { visibleBreadcrumbs, hiddenBreadcrumbs, needsBreadcrumbTruncation } = useMemo(() => {
    if (breadcrumbs.length <= MAX_VISIBLE_BREADCRUMB_PARTS) {
      return {
        visibleBreadcrumbs: breadcrumbs.map((part, idx) => ({ part, originalIndex: idx })),
        hiddenBreadcrumbs: [] as { part: string; originalIndex: number }[],
        needsBreadcrumbTruncation: false
      };
    }

    // Show first part + ellipsis + last (MAX_VISIBLE_BREADCRUMB_PARTS - 1) parts
    const firstPart = [{ part: breadcrumbs[0], originalIndex: 0 }];
    const lastPartsCount = MAX_VISIBLE_BREADCRUMB_PARTS - 1;
    const lastParts = breadcrumbs.slice(-lastPartsCount).map((part, idx) => ({
      part,
      originalIndex: breadcrumbs.length - lastPartsCount + idx
    }));
    const hidden = breadcrumbs.slice(1, -lastPartsCount).map((part, idx) => ({
      part,
      originalIndex: idx + 1
    }));

    return {
      visibleBreadcrumbs: [...firstPart, ...lastParts],
      hiddenBreadcrumbs: hidden,
      needsBreadcrumbTruncation: true
    };
  }, [breadcrumbs]);

  const handleFileClick = (
    file: RemoteFile,
    index: number,
    e: React.MouseEvent,
  ) => {
    // Don't allow selecting ".." entry
    if (file.name === "..") return;

    if (file.type === "directory") {
      // Double click to enter directory is handled by onDoubleClick
      // Single click just selects
      if (e.shiftKey && lastSelectedIndexRef.current !== null) {
        // Shift-click: range select
        const start = Math.min(lastSelectedIndexRef.current, index);
        const end = Math.max(lastSelectedIndexRef.current, index);
        const newSelection = new Set<string>();
        for (let i = start; i <= end; i++) {
          if (files[i] && files[i].type !== "directory") {
            newSelection.add(files[i].name);
          }
        }
        setSelectedFiles(newSelection);
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd click: toggle selection
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          // Don't select directories
          return next;
        });
      }
      return;
    }

    // For files
    if (e.shiftKey && lastSelectedIndexRef.current !== null) {
      // Shift-click: range select
      const start = Math.min(lastSelectedIndexRef.current, index);
      const end = Math.max(lastSelectedIndexRef.current, index);
      const newSelection = new Set<string>();
      for (let i = start; i <= end; i++) {
        if (files[i] && files[i].type !== "directory") {
          newSelection.add(files[i].name);
        }
      }
      setSelectedFiles(newSelection);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd click: toggle selection
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(file.name)) {
          next.delete(file.name);
        } else {
          next.add(file.name);
        }
        return next;
      });
      lastSelectedIndexRef.current = index;
    } else {
      // Normal click: single select
      setSelectedFiles(new Set([file.name]));
      lastSelectedIndexRef.current = index;
    }
  };

  const handleFileDoubleClick = (file: RemoteFile) => {
    // Handle ".." special case - go to parent directory
    if (file.name === "..") {
      handleUp();
      return;
    }
    // Navigate into directories, or symlinks that point to directories
    if (file.type === "directory" || (file.type === "symlink" && file.linkTarget === "directory")) {
      handleNavigate(joinPath(currentPath, file.name));
    } else {
      // For files: open them (equivalent to clicking the "Open" button)
      handleOpenFile(file);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    const fileNames = Array.from(selectedFiles);
    if (!confirm(t("sftp.deleteConfirm.title", { count: fileNames.length }))) return;

    try {
      for (const fileName of fileNames) {
        const fullPath = joinPath(currentPath, fileName);
        if (isLocalSession) {
          await deleteLocalFile(fullPath);
        } else {
          await deleteSftp(await ensureSftp(), fullPath);
        }
      }
      await loadFiles(currentPath, { force: true });
      setSelectedFiles(new Set());
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("sftp.error.deleteFailed"),
        "SFTP",
      );
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedFiles.size === 0) return;
    for (const fileName of selectedFiles) {
      const file = files.find((f) => f.name === fileName);
      if (file && file.type === "file") {
        await handleDownload(file);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
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

        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-border/60 flex items-center gap-2 flex-shrink-0 bg-muted/30">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleUp}
            disabled={isRootPath(currentPath)}
          >
            <ArrowUp size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() =>
              setCurrentPath(
                (isLocalSession && localHomeRef.current) || getRootPath(currentPath),
              )
            }
          >
            <Home size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => loadFiles(currentPath, { force: true })}
          >
            <RefreshCw size={14} className={cn((loading || reconnecting) && "animate-spin")} />
          </Button>

          {/* Editable Breadcrumbs */}
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
                  onClick={() => setCurrentPath(getRootPath(currentPath))}
                >
                  {isLocalSession && isWindowsPath(currentPath)
                    ? getWindowsDrive(currentPath) ?? "C:"
                    : "/"}
                </button>
                {visibleBreadcrumbs.map(({ part, originalIndex }, displayIdx) => {
                  const isLast = originalIndex === breadcrumbs.length - 1;
                  const showEllipsisBefore = needsBreadcrumbTruncation && displayIdx === 1;

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
                            title={`${t("sftp.showHiddenPaths")}: ${hiddenBreadcrumbs.map(h => h.part).join(" > ")}`}
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
                          isLast && "text-foreground font-medium"
                        )}
                        onClick={() =>
                          setCurrentPath(breadcrumbPathAt(breadcrumbs, originalIndex))
                        }
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

          {/* Action buttons moved here */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={14} className="mr-1.5" /> {t("sftp.upload")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={handleCreateFolder}
            >
              <Plus size={14} className="mr-1.5" /> {t("sftp.newFolder")}
            </Button>
            <input
              type="file"
              className="hidden"
              ref={inputRef}
              onChange={handleFileSelect}
              multiple
            />
          </div>
        </div>

        {/* Table Header with sortable columns and resize handles - OUTSIDE scroll container */}
        <div
          className="shrink-0 bg-muted/80 backdrop-blur-sm border-b border-border/60 px-4 py-2 flex items-center text-xs font-medium text-muted-foreground select-none"
          style={{
            display: "grid",
            gridTemplateColumns: `${columnWidths.name}% ${columnWidths.size}% ${columnWidths.modified}% ${columnWidths.actions}%`,
          }}
        >
          <div
            className="flex items-center gap-1 cursor-pointer hover:text-foreground relative pr-2"
            onClick={() => handleSort("name")}
          >
            <span>{t("sftp.columns.name")}</span>
            {sortField === "name" && (
              <span className="text-primary">
                {sortOrder === "asc" ? "^" : "v"}
              </span>
            )}
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
              onMouseDown={(e) => handleResizeStart("name", e)}
            />
          </div>
          <div
            className="flex items-center gap-1 cursor-pointer hover:text-foreground relative pr-2"
            onClick={() => handleSort("size")}
          >
            <span>{t("sftp.columns.size")}</span>
            {sortField === "size" && (
              <span className="text-primary">
                {sortOrder === "asc" ? "^" : "v"}
              </span>
            )}
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
              onMouseDown={(e) => handleResizeStart("size", e)}
            />
          </div>
          <div
            className="flex items-center gap-1 cursor-pointer hover:text-foreground relative pr-2"
            onClick={() => handleSort("modified")}
          >
            <span>{t("sftp.columns.modified")}</span>
            {sortField === "modified" && (
              <span className="text-primary">
                {sortOrder === "asc" ? "^" : "v"}
              </span>
            )}
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 transition-colors"
              onMouseDown={(e) => handleResizeStart("modified", e)}
            />
          </div>
          <div className="text-right">{t("sftp.columns.actions")}</div>
        </div>

        {/* File List with Virtual Scrolling */}
        <div
          ref={fileListRef}
          className={cn(
            "flex-1 min-h-0 overflow-y-auto relative",
            dragActive && "bg-primary/5 ring-2 ring-inset ring-primary",
          )}
          onScroll={handleFileListScroll}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {dragActive && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="bg-background/95 p-6 rounded-xl shadow-lg border-2 border-dashed border-primary text-primary font-medium flex flex-col items-center gap-2">
                <Upload size={32} />
                <span>{t("sftp.dropFilesHere")}</span>
              </div>
            </div>
          )}

          {loading && files.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {loadingTextContent && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-20">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{t("sftp.status.loading")}</span>
              </div>
            </div>
          )}

          {/* Reconnecting overlay */}
          {reconnecting && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-20">
              <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-secondary/90 border border-border/60 shadow-lg">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center">
                  <div className="text-sm font-medium">{t("sftp.reconnecting.title")}</div>
                  <div className="text-xs text-muted-foreground mt-1">{t("sftp.reconnecting.desc")}</div>
                </div>
              </div>
            </div>
          )}

          {files.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Folder size={48} className="mb-3 opacity-50" />
              <div className="text-sm font-medium">{t("sftp.emptyDirectory")}</div>
              <div className="text-xs mt-1">{t("sftp.dragDropToUpload")}</div>
            </div>
          )}

          {/* File rows with virtual scrolling */}
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className={shouldVirtualize ? "relative" : "divide-y divide-border/30"}
                style={shouldVirtualize ? { height: totalHeight } : undefined}
              >
                {visibleRows.map(({ file, index: idx, top }) => {
                  // Check if this entry is navigable like a directory
                  const isNavigableDirectory = file.type === "directory" || (file.type === "symlink" && file.linkTarget === "directory");
                  const isDownloadableFile = file.type === "file" || (file.type === "symlink" && file.linkTarget === "file");
                  const isParentEntry = file.name === "..";

                  return (
                    <ContextMenu key={file.name}>
                      <ContextMenuTrigger>
                        <div
                          data-sftp-modal-row="true"
                          className={cn(
                            "px-4 py-2.5 items-center hover:bg-muted/50 cursor-pointer transition-colors text-sm",
                            selectedFiles.has(file.name) && !isParentEntry && "bg-primary/10",
                            shouldVirtualize ? "absolute left-0 right-0 border-b border-border/30" : "",
                          )}
                          style={shouldVirtualize ? {
                            top,
                            display: "grid",
                            gridTemplateColumns: `${columnWidths.name}% ${columnWidths.size}% ${columnWidths.modified}% ${columnWidths.actions}%`,
                          } : {
                            display: "grid",
                            gridTemplateColumns: `${columnWidths.name}% ${columnWidths.size}% ${columnWidths.modified}% ${columnWidths.actions}%`,
                          }}
                          onClick={(e) => handleFileClick(file, idx, e)}
                          onDoubleClick={() => handleFileDoubleClick(file)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative shrink-0 h-7 w-7 flex items-center justify-center">
                              {getFileIcon(file.name, isNavigableDirectory, file.type === "symlink" && !isNavigableDirectory)}
                              {file.type === "symlink" && <Link size={10} className="absolute -bottom-0.5 -right-0.5 text-muted-foreground" aria-hidden="true" />}
                            </div>
                            <span className={cn("truncate font-medium", file.type === "symlink" && "italic pr-1")}>
                              {file.name}
                              {file.type === "symlink" && <span className="sr-only"> (symbolic link)</span>}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {isNavigableDirectory ? "--" : formatBytes(file.size)}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {formatDate(file.lastModified, resolvedLocale)}
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            {isDownloadableFile && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownload(file);
                                }}
                                title={t("sftp.context.download")}
                              >
                                <Download size={14} />
                              </Button>
                            )}
                            {!isParentEntry && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(file);
                                }}
                                title={t("sftp.context.delete")}
                              >
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        {isParentEntry ? (
                          <ContextMenuItem
                            onClick={() => {
                              // Navigate to parent directory
                              const segments = currentPath.split("/").filter(Boolean);
                              segments.pop();
                              const parentPath = segments.length === 0 ? "/" : `/${segments.join("/")}`;
                              handleNavigate(parentPath);
                            }}
                          >
                            {t("sftp.context.open")}
                          </ContextMenuItem>
                        ) : (
                          <>
                            {(file.type === "directory" || (file.type === "symlink" && file.linkTarget === "directory")) && (
                              <ContextMenuItem
                                onClick={() =>
                                  handleNavigate(
                                    currentPath === "/"
                                      ? `/${file.name}`
                                      : `${currentPath}/${file.name}`,
                                  )
                                }
                              >
                                <FolderOpen size={14} className="mr-2" /> {t("sftp.context.open")}
                              </ContextMenuItem>
                            )}
                            {(file.type === "file" || (file.type === "symlink" && file.linkTarget === "file")) && (
                              <>
                                {/* Open - uses saved association or shows dialog */}
                                <ContextMenuItem onClick={() => handleOpenFile(file)}>
                                  <FolderOpen size={14} className="mr-2" /> {t("sftp.context.open")}
                                </ContextMenuItem>
                                {/* Open with - always shows dialog */}
                                <ContextMenuItem onClick={() => openFileOpenerDialog(file)}>
                                  <MoreHorizontal size={14} className="mr-2" /> {t("sftp.context.openWith")}
                                </ContextMenuItem>
                                {/* Edit - for text files (not known binary) */}
                                {!isKnownBinaryFile(file.name) && (
                                  <ContextMenuItem onClick={() => handleEditFile(file)}>
                                    <Edit2 size={14} className="mr-2" /> {t("sftp.context.edit")}
                                  </ContextMenuItem>
                                )}
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => handleDownload(file)}>
                                  <Download size={14} className="mr-2" /> {t("sftp.context.download")}
                                </ContextMenuItem>
                              </>
                            )}
                            <ContextMenuItem onClick={() => openRenameDialog(file)}>
                              <Edit2 size={14} className="mr-2" /> {t("sftp.context.rename")}
                            </ContextMenuItem>
                            {!isLocalSession && (
                              <ContextMenuItem onClick={() => openPermissionsDialog(file)}>
                                <Shield size={14} className="mr-2" /> {t("sftp.context.permissions")}
                              </ContextMenuItem>
                            )}
                            <ContextMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(file)}
                            >
                              <Trash2 size={14} className="mr-2" /> {t("sftp.context.delete")}
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={handleCreateFolder}>
                <Plus className="h-4 w-4 mr-2" /> {t("sftp.newFolder")}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => inputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> {t("sftp.uploadFiles")}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => loadFiles(currentPath, { force: true })}>
                <RefreshCw className="h-4 w-4 mr-2" /> {t("sftp.context.refresh")}
              </ContextMenuItem>
              {selectedFiles.size > 0 && (
                <>
                  <ContextMenuItem onClick={handleDownloadSelected}>
                    <Download className="h-4 w-4 mr-2" /> {t("sftp.context.downloadSelected", { count: selectedFiles.size })}
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="text-destructive"
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> {t("sftp.context.deleteSelected", { count: selectedFiles.size })}
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
        </div>

        {/* Upload progress at bottom */}
        {uploadTasks.length > 0 && (
          <div className="border-t border-border/60 bg-secondary/50 flex-shrink-0">
            <div className="max-h-40 overflow-y-auto">
              {uploadTasks.map((task) => {
                // Format speed
                const formatSpeed = (bytesPerSec: number) => {
                  if (bytesPerSec <= 0) return "";
                  if (bytesPerSec >= 1024 * 1024)
                    return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
                  if (bytesPerSec >= 1024)
                    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
                  return `${Math.round(bytesPerSec)} B/s`;
                };

                // Format bytes
                const formatBytes = (bytes: number) => {
                  if (bytes === 0) return "0 B";
                  if (bytes >= 1024 * 1024)
                    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                  return `${bytes} B`;
                };

                // Remaining time
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
                        <Loader2
                          size={14}
                          className="animate-spin text-primary"
                        />
                      )}
                      {task.status === "pending" && (
                        <Upload
                          size={14}
                          className="text-muted-foreground animate-pulse"
                        />
                      )}
                      {task.status === "completed" && (
                        <Upload size={14} className="text-green-500" />
                      )}
                      {task.status === "failed" && (
                        <X size={14} className="text-destructive" />
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
                      {(task.status === "uploading" ||
                        task.status === "pending") && (
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
                              {task.status === "uploading"
                                ? `${task.progress}%`
                                : "..."}
                            </span>
                          </div>
                        )}
                      {task.status === "uploading" && task.totalBytes > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                          {formatBytes(task.transferredBytes)} /{" "}
                          {formatBytes(task.totalBytes)}
                        </div>
                      )}
                      {task.status === "completed" && (
                        <div className="text-[10px] text-green-600 mt-0.5">
                          Completed �?{formatBytes(task.totalBytes)}
                        </div>
                      )}
                      {task.status === "failed" && task.error && (
                        <div className="text-[10px] text-destructive truncate mt-0.5">
                          {task.error}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0">
                      {task.status === "pending" && t("sftp.task.waiting")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground bg-muted/30 flex-shrink-0">
          <span>
            {t("sftp.itemsCount", { count: files.length })}
            {selectedFiles.size > 0 && (
              <>
                <span className="mx-2">|</span>
                <span className="text-primary">
                  {t("sftp.selectedCount", { count: selectedFiles.size })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 ml-2 text-xs text-primary hover:text-primary"
                  onClick={handleDownloadSelected}
                >
                  <Download size={10} className="mr-1" /> {t("sftp.context.download")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={handleDeleteSelected}
                >
                  <Trash2 size={10} className="mr-1" /> {t("sftp.context.delete")}
                </Button>
              </>
            )}
          </span>
          <span>
            {loading
              ? t("sftp.status.loading")
              : uploading
                ? t("sftp.status.uploading")
                : t("sftp.status.ready")}
          </span>
        </div>
      </DialogContent>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("sftp.rename.title")}</DialogTitle>
            <DialogDescription className="truncate">
              {renameTarget?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder={t("sftp.rename.placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleRename} disabled={isRenaming || !renameName.trim()}>
              {isRenaming ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              {t("common.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={showPermissionsDialog} onOpenChange={setShowPermissionsDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("sftp.permissions.title")}</DialogTitle>
            <DialogDescription className="truncate">
              {permissionsTarget?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              {(['owner', 'group', 'others'] as const).map((role) => (
                <div key={role} className="flex items-center gap-4">
                  <div className="w-16 text-sm font-medium">{t(`sftp.permissions.${role}`)}</div>
                  <div className="flex gap-3">
                    {(['read', 'write', 'execute'] as const).map((perm) => (
                      <label key={perm} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={permissions[role][perm]}
                          onChange={() => togglePermission(role, perm)}
                          className="rounded border-border"
                        />
                        <span className="text-xs">{perm === 'read' ? 'R' : perm === 'write' ? 'W' : 'X'}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <div className="text-xs text-muted-foreground">
                {t("sftp.permissions.octal")}: <span className="font-mono text-foreground">{getOctalPermissions()}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {t("sftp.permissions.symbolic")}: <span className="font-mono text-foreground">{getSymbolicPermissions()}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPermissionsDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSavePermissions} disabled={isChangingPermissions}>
              {isChangingPermissions ? <Loader2 size={14} className="mr-2 animate-spin" /> : null}
              {t("common.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Opener Dialog */}
      <FileOpenerDialog
        open={showFileOpenerDialog}
        onClose={() => {
          setShowFileOpenerDialog(false);
          setFileOpenerTarget(null);
        }}
        fileName={fileOpenerTarget?.name || ""}
        onSelect={handleFileOpenerSelect}
        onSelectSystemApp={handleSelectSystemApp}
      />

      {/* Text Editor Modal */}
      <TextEditorModal
        open={showTextEditor}
        onClose={() => {
          setShowTextEditor(false);
          setTextEditorTarget(null);
          setTextEditorContent("");
        }}
        fileName={textEditorTarget?.name || ""}
        initialContent={textEditorContent}
        onSave={handleSaveTextFile}
      />
    </Dialog>
  );
};

export default SFTPModal;
