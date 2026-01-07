/**
 * useSftpFileOperations - Shared file operations for SFTP components
 * 
 * This hook provides common file operations like open, edit, preview
 * that can be shared between SFTPModal and SftpView components.
 */

import { useCallback, useState } from "react";
import { getFileExtension, isImageFile, isTextFile, FileOpenerType } from "../../lib/sftpFileUtils";
import { toast } from "../../components/ui/toast";
import { useI18n } from "../i18n/I18nProvider";
import { useSftpFileAssociations } from "./useSftpFileAssociations";

export interface FileOperationsState {
  // Text editor state
  showTextEditor: boolean;
  textEditorTarget: { name: string; fullPath: string } | null;
  textEditorContent: string;
  loadingTextContent: boolean;
  
  // Image preview state
  showImagePreview: boolean;
  imagePreviewTarget: { name: string; fullPath: string } | null;
  imagePreviewData: ArrayBuffer | null;
  loadingImageData: boolean;
  
  // File opener dialog state
  showFileOpenerDialog: boolean;
  fileOpenerTarget: { name: string; fullPath: string } | null;
}

export interface FileOperationsActions {
  // Open file based on type/association
  openFile: (fileName: string, fullPath: string) => void;
  
  // Edit text file
  editFile: (
    fileName: string, 
    fullPath: string, 
    readContent: () => Promise<string>
  ) => Promise<void>;
  
  // Preview image
  previewImage: (
    fileName: string, 
    fullPath: string, 
    readData: () => Promise<ArrayBuffer>
  ) => Promise<void>;
  
  // Save text file
  saveTextFile: (
    content: string, 
    writeContent: (path: string, content: string) => Promise<void>
  ) => Promise<void>;
  
  // Handle file opener selection
  handleFileOpenerSelect: (
    openerType: FileOpenerType, 
    setAsDefault: boolean,
    readTextContent: () => Promise<string>,
    readImageData: () => Promise<ArrayBuffer>
  ) => Promise<void>;
  
  // Close modals
  closeTextEditor: () => void;
  closeImagePreview: () => void;
  closeFileOpenerDialog: () => void;
  
  // Check if file can be edited/previewed
  canEditFile: (fileName: string) => boolean;
  canPreviewImage: (fileName: string) => boolean;
}

export interface UseSftpFileOperationsResult {
  state: FileOperationsState;
  actions: FileOperationsActions;
}

export function useSftpFileOperations(): UseSftpFileOperationsResult {
  const { t } = useI18n();
  const { getOpenerForFile, setOpenerForExtension } = useSftpFileAssociations();
  
  // Text editor state
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [textEditorTarget, setTextEditorTarget] = useState<{ name: string; fullPath: string } | null>(null);
  const [textEditorContent, setTextEditorContent] = useState("");
  const [loadingTextContent, setLoadingTextContent] = useState(false);
  
  // Image preview state
  const [showImagePreview, setShowImagePreview] = useState(false);
  const [imagePreviewTarget, setImagePreviewTarget] = useState<{ name: string; fullPath: string } | null>(null);
  const [imagePreviewData, setImagePreviewData] = useState<ArrayBuffer | null>(null);
  const [loadingImageData, setLoadingImageData] = useState(false);
  
  // File opener dialog state
  const [showFileOpenerDialog, setShowFileOpenerDialog] = useState(false);
  const [fileOpenerTarget, setFileOpenerTarget] = useState<{ name: string; fullPath: string } | null>(null);

  const canEditFile = useCallback((fileName: string) => {
    return isTextFile(fileName);
  }, []);

  const canPreviewImage = useCallback((fileName: string) => {
    return isImageFile(fileName);
  }, []);

  const closeTextEditor = useCallback(() => {
    setShowTextEditor(false);
    setTextEditorTarget(null);
    setTextEditorContent("");
  }, []);

  const closeImagePreview = useCallback(() => {
    setShowImagePreview(false);
    setImagePreviewTarget(null);
    setImagePreviewData(null);
  }, []);

  const closeFileOpenerDialog = useCallback(() => {
    setShowFileOpenerDialog(false);
    setFileOpenerTarget(null);
  }, []);

  const editFile = useCallback(async (
    fileName: string,
    fullPath: string,
    readContent: () => Promise<string>
  ) => {
    try {
      setLoadingTextContent(true);
      setTextEditorTarget({ name: fileName, fullPath });
      const content = await readContent();
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
  }, [t]);

  const previewImage = useCallback(async (
    fileName: string,
    fullPath: string,
    readData: () => Promise<ArrayBuffer>
  ) => {
    try {
      setLoadingImageData(true);
      setImagePreviewTarget({ name: fileName, fullPath });
      setShowImagePreview(true);
      const data = await readData();
      setImagePreviewData(data);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("sftp.error.loadFailed"),
        "SFTP",
      );
      setShowImagePreview(false);
    } finally {
      setLoadingImageData(false);
    }
  }, [t]);

  const saveTextFile = useCallback(async (
    content: string,
    writeContent: (path: string, content: string) => Promise<void>
  ) => {
    if (!textEditorTarget) return;
    await writeContent(textEditorTarget.fullPath, content);
  }, [textEditorTarget]);

  const openFile = useCallback((fileName: string, fullPath: string) => {
    const savedOpener = getOpenerForFile(fileName);

    if (savedOpener) {
      // User has saved an opener for this file type
      // We'll just set the target and let the caller handle it
      setFileOpenerTarget({ name: fileName, fullPath });
      
      // Return the opener type so caller knows which operation to perform
      if (savedOpener === 'builtin-editor' && canEditFile(fileName)) {
        // Don't show dialog, caller should call editFile
        return 'edit' as const;
      } else if (savedOpener === 'builtin-image-viewer' && canPreviewImage(fileName)) {
        // Don't show dialog, caller should call previewImage
        return 'preview' as const;
      }
    }
    
    // No saved opener, show the dialog
    setFileOpenerTarget({ name: fileName, fullPath });
    setShowFileOpenerDialog(true);
    return 'dialog' as const;
  }, [getOpenerForFile, canEditFile, canPreviewImage]);

  const handleFileOpenerSelect = useCallback(async (
    openerType: FileOpenerType,
    setAsDefault: boolean,
    readTextContent: () => Promise<string>,
    readImageData: () => Promise<ArrayBuffer>
  ) => {
    if (!fileOpenerTarget) return;

    if (setAsDefault) {
      const ext = getFileExtension(fileOpenerTarget.name);
      if (ext !== 'file') {
        setOpenerForExtension(ext, openerType);
      }
    }

    setShowFileOpenerDialog(false);

    if (openerType === 'builtin-editor') {
      await editFile(fileOpenerTarget.name, fileOpenerTarget.fullPath, readTextContent);
    } else if (openerType === 'builtin-image-viewer') {
      await previewImage(fileOpenerTarget.name, fileOpenerTarget.fullPath, readImageData);
    }
  }, [fileOpenerTarget, setOpenerForExtension, editFile, previewImage]);

  return {
    state: {
      showTextEditor,
      textEditorTarget,
      textEditorContent,
      loadingTextContent,
      showImagePreview,
      imagePreviewTarget,
      imagePreviewData,
      loadingImageData,
      showFileOpenerDialog,
      fileOpenerTarget,
    },
    actions: {
      openFile,
      editFile,
      previewImage,
      saveTextFile,
      handleFileOpenerSelect,
      closeTextEditor,
      closeImagePreview,
      closeFileOpenerDialog,
      canEditFile,
      canPreviewImage,
    },
  };
}
