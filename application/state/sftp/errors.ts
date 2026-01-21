export const isSessionError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("session not found") ||
    msg.includes("sftp session") ||
    msg.includes("not found") ||
    msg.includes("closed") ||
    msg.includes("connection reset")
  );
};

/**
 * Check if an error message indicates a fatal error that should stop the entire upload.
 * This includes session errors AND target directory deletion errors.
 */
export const isFatalUploadError = (errorMessage: string): boolean => {
  const msg = errorMessage.toLowerCase();
  return (
    // Session-related errors
    msg.includes("session not found") ||
    msg.includes("sftp session") ||
    msg.includes("connection") ||
    msg.includes("disconnected") ||
    // Target directory was deleted during upload
    msg.includes("no such file") ||
    msg.includes("enoent") ||
    msg.includes("does not exist") ||
    msg.includes("write stream error") ||
    // Directory was removed
    msg.includes("directory not found") ||
    msg.includes("not a directory")
  );
};
