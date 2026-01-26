/**
 * Transfer Bridge - Handles file transfers with progress and cancellation
 * Extracted from main.cjs for single responsibility
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { encodePathForSession, ensureRemoteDirForSession } = require("./sftpBridge.cjs");

// Shared references
let sftpClients = null;
let electronModule = null;

// Active transfers storage
const activeTransfers = new Map();

/**
 * Initialize the transfer bridge with dependencies
 */
function init(deps) {
  sftpClients = deps.sftpClients;
  electronModule = deps.electronModule;
}

/**
 * Upload a local file to SFTP using streams (supports cancellation)
 */
async function uploadWithStreams(localPath, remotePath, client, fileSize, transfer, sendProgress) {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(localPath);

    // Get the underlying sftp object from ssh2-sftp-client
    const sftp = client.sftp;
    if (!sftp) {
      reject(new Error("SFTP client not ready"));
      return;
    }

    const writeStream = sftp.createWriteStream(remotePath);
    let transferred = 0;
    let finished = false;

    // Store streams for cancellation
    transfer.readStream = readStream;
    transfer.writeStream = writeStream;

    const cleanup = (err) => {
      if (finished) return;
      finished = true;

      // Remove listeners to prevent memory leaks
      readStream.removeAllListeners();
      writeStream.removeAllListeners();

      if (err) {
        // Destroy streams on error
        try { readStream.destroy(); } catch {}
        try { writeStream.destroy(); } catch {}
        reject(err);
      } else {
        resolve();
      }
    };

    readStream.on('data', (chunk) => {
      if (transfer.cancelled) {
        cleanup(new Error('Transfer cancelled'));
        return;
      }
      transferred += chunk.length;
      sendProgress(transferred, fileSize);
    });

    readStream.on('error', (err) => cleanup(err));
    writeStream.on('error', (err) => cleanup(err));
    writeStream.on('close', () => {
      if (transfer.cancelled) {
        cleanup(new Error('Transfer cancelled'));
      } else {
        cleanup(null);
      }
    });

    readStream.pipe(writeStream);
  });
}

/**
 * Download from SFTP to local file using streams (supports cancellation)
 */
async function downloadWithStreams(remotePath, localPath, client, fileSize, transfer, sendProgress) {
  return new Promise((resolve, reject) => {
    // Get the underlying sftp object from ssh2-sftp-client
    const sftp = client.sftp;
    if (!sftp) {
      reject(new Error("SFTP client not ready"));
      return;
    }

    const readStream = sftp.createReadStream(remotePath);
    const writeStream = fs.createWriteStream(localPath);
    let transferred = 0;
    let finished = false;

    // Store streams for cancellation
    transfer.readStream = readStream;
    transfer.writeStream = writeStream;

    const cleanup = (err) => {
      if (finished) return;
      finished = true;

      // Remove listeners to prevent memory leaks
      readStream.removeAllListeners();
      writeStream.removeAllListeners();

      if (err) {
        // Destroy streams on error
        try { readStream.destroy(); } catch {}
        try { writeStream.destroy(); } catch {}
        reject(err);
      } else {
        resolve();
      }
    };

    readStream.on('data', (chunk) => {
      if (transfer.cancelled) {
        cleanup(new Error('Transfer cancelled'));
        return;
      }
      transferred += chunk.length;
      sendProgress(transferred, fileSize);
    });

    readStream.on('error', (err) => cleanup(err));
    writeStream.on('error', (err) => cleanup(err));
    // Handle normal completion
    writeStream.on('finish', () => {
      if (transfer.cancelled) {
        cleanup(new Error('Transfer cancelled'));
      } else {
        cleanup(null);
      }
    });
    // Handle stream destruction (destroy() emits 'close' but not 'finish')
    writeStream.on('close', () => {
      if (transfer.cancelled) {
        cleanup(new Error('Transfer cancelled'));
      }
    });

    readStream.pipe(writeStream);
  });
}

/**
 * Start a file transfer
 */
async function startTransfer(event, payload) {
  const {
    transferId,
    sourcePath,
    targetPath,
    sourceType,
    targetType,
    sourceSftpId,
    targetSftpId,
    totalBytes,
    sourceEncoding,
    targetEncoding,
  } = payload;
  const sender = event.sender;

  // Register transfer for cancellation
  const transfer = { cancelled: false, readStream: null, writeStream: null };
  activeTransfers.set(transferId, transfer);

  let lastTime = Date.now();
  let lastTransferred = 0;
  let speed = 0;

  const sendProgress = (transferred, total) => {
    if (transfer.cancelled) return;

    const now = Date.now();
    const elapsed = now - lastTime;
    if (elapsed >= 100) {
      speed = Math.round((transferred - lastTransferred) / (elapsed / 1000));
      lastTime = now;
      lastTransferred = transferred;
    }

    sender.send("netcatty:transfer:progress", { transferId, transferred, speed, totalBytes: total });
  };

  const sendComplete = () => {
    activeTransfers.delete(transferId);
    sender.send("netcatty:transfer:complete", { transferId });
  };

  const sendError = (error) => {
    activeTransfers.delete(transferId);
    sender.send("netcatty:transfer:error", { transferId, error: error.message || String(error) });
  };

  try {
    let fileSize = totalBytes || 0;

    // Get file size if not provided
    if (!fileSize) {
      if (sourceType === 'local') {
        const stat = await fs.promises.stat(sourcePath);
        fileSize = stat.size;
      } else if (sourceType === 'sftp') {
        const client = sftpClients.get(sourceSftpId);
        if (!client) throw new Error("Source SFTP session not found");
        const encodedSourcePath = encodePathForSession(sourceSftpId, sourcePath, sourceEncoding);
        const stat = await client.stat(encodedSourcePath);
        fileSize = stat.size;
      }
    }

    // Send initial progress
    sendProgress(0, fileSize);

    // Handle different transfer scenarios
    if (sourceType === 'local' && targetType === 'sftp') {
      // Upload: Local -> SFTP using streams (supports cancellation)
      const client = sftpClients.get(targetSftpId);
      if (!client) throw new Error("Target SFTP session not found");

      const dir = path.dirname(targetPath).replace(/\\/g, '/');
      try { await ensureRemoteDirForSession(targetSftpId, dir, targetEncoding); } catch {}

      const encodedTargetPath = encodePathForSession(targetSftpId, targetPath, targetEncoding);
      await uploadWithStreams(sourcePath, encodedTargetPath, client, fileSize, transfer, sendProgress);

    } else if (sourceType === 'sftp' && targetType === 'local') {
      // Download: SFTP -> Local using streams (supports cancellation)
      const client = sftpClients.get(sourceSftpId);
      if (!client) throw new Error("Source SFTP session not found");

      const dir = path.dirname(targetPath);
      await fs.promises.mkdir(dir, { recursive: true });

      const encodedSourcePath = encodePathForSession(sourceSftpId, sourcePath, sourceEncoding);
      await downloadWithStreams(encodedSourcePath, targetPath, client, fileSize, transfer, sendProgress);

    } else if (sourceType === 'local' && targetType === 'local') {
      // Local copy: use streams
      const dir = path.dirname(targetPath);
      await fs.promises.mkdir(dir, { recursive: true });

      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(sourcePath);
        const writeStream = fs.createWriteStream(targetPath);
        let transferred = 0;
        let finished = false;

        transfer.readStream = readStream;
        transfer.writeStream = writeStream;

        const cleanup = (err) => {
          if (finished) return;
          finished = true;
          readStream.removeAllListeners();
          writeStream.removeAllListeners();
          if (err) {
            try { readStream.destroy(); } catch {}
            try { writeStream.destroy(); } catch {}
            reject(err);
          } else {
            resolve();
          }
        };

        readStream.on('data', (chunk) => {
          if (transfer.cancelled) {
            cleanup(new Error('Transfer cancelled'));
            return;
          }
          transferred += chunk.length;
          sendProgress(transferred, fileSize);
        });

        readStream.on('error', cleanup);
        writeStream.on('error', cleanup);
        // Handle normal completion
        writeStream.on('finish', () => {
          if (transfer.cancelled) {
            cleanup(new Error('Transfer cancelled'));
          } else {
            cleanup(null);
          }
        });
        // Handle stream destruction (destroy() emits 'close' but not 'finish')
        writeStream.on('close', () => {
          if (transfer.cancelled) {
            cleanup(new Error('Transfer cancelled'));
          }
        });

        readStream.pipe(writeStream);
      });

    } else if (sourceType === 'sftp' && targetType === 'sftp') {
      // SFTP to SFTP: download to temp then upload using streams
      const tempPath = path.join(os.tmpdir(), `netcatty-transfer-${transferId}`);

      const sourceClient = sftpClients.get(sourceSftpId);
      const targetClient = sftpClients.get(targetSftpId);
      if (!sourceClient) throw new Error("Source SFTP session not found");
      if (!targetClient) throw new Error("Target SFTP session not found");

      // Download phase (0-50%) - wrap progress to show 0-50%
      const encodedSourcePath = encodePathForSession(sourceSftpId, sourcePath, sourceEncoding);
      const downloadProgress = (transferred, total) => {
        sendProgress(Math.floor(transferred / 2), fileSize);
      };
      await downloadWithStreams(encodedSourcePath, tempPath, sourceClient, fileSize, transfer, downloadProgress);

      if (transfer.cancelled) {
        try { await fs.promises.unlink(tempPath); } catch {}
        throw new Error('Transfer cancelled');
      }

      // Upload phase (50-100%) - wrap progress to show 50-100%
      const dir = path.dirname(targetPath).replace(/\\/g, '/');
      try { await ensureRemoteDirForSession(targetSftpId, dir, targetEncoding); } catch {}

      const encodedTargetPath = encodePathForSession(targetSftpId, targetPath, targetEncoding);
      const uploadProgress = (transferred, total) => {
        sendProgress(Math.floor(fileSize / 2) + Math.floor(transferred / 2), fileSize);
      };
      await uploadWithStreams(tempPath, encodedTargetPath, targetClient, fileSize, transfer, uploadProgress);

      // Cleanup temp file
      try { await fs.promises.unlink(tempPath); } catch {}

    } else {
      throw new Error("Invalid transfer configuration");
    }
    
    // Send final 100% progress
    sendProgress(fileSize, fileSize);
    sendComplete();
    
    return { transferId, totalBytes: fileSize };
  } catch (err) {
    if (err.message === 'Transfer cancelled') {
      activeTransfers.delete(transferId);
      sender.send("netcatty:transfer:cancelled", { transferId });
    } else {
      sendError(err);
    }
    return { transferId, error: err.message };
  }
}

/**
 * Cancel a transfer
 */
async function cancelTransfer(event, payload) {
  const { transferId } = payload;
  console.log('[transferBridge] cancelTransfer called for:', transferId);
  const transfer = activeTransfers.get(transferId);
  console.log('[transferBridge] Found transfer:', !!transfer, 'activeTransfers keys:', Array.from(activeTransfers.keys()));
  if (transfer) {
    transfer.cancelled = true;
    console.log('[transferBridge] Set cancelled=true for transfer:', transferId);

    // Destroy streams to immediately stop the transfer
    if (transfer.readStream) {
      console.log('[transferBridge] Destroying read stream');
      try { transfer.readStream.destroy(); } catch (e) { console.log('[transferBridge] Error destroying readStream:', e); }
    }
    if (transfer.writeStream) {
      console.log('[transferBridge] Destroying write stream');
      try { transfer.writeStream.destroy(); } catch (e) { console.log('[transferBridge] Error destroying writeStream:', e); }
    }

    console.log('[transferBridge] Transfer marked for cancellation');
  }
  return { success: true };
}

/**
 * Register IPC handlers for transfer operations
 */
function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:transfer:start", startTransfer);
  ipcMain.handle("netcatty:transfer:cancel", cancelTransfer);
}

module.exports = {
  init,
  registerHandlers,
  startTransfer,
  cancelTransfer,
};
