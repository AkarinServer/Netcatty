/**
 * SFTP Bridge - Handles SFTP connections and file operations
 * Extracted from main.cjs for single responsibility
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const SftpClient = require("ssh2-sftp-client");
const { Client: SSHClient } = require("ssh2");
const { NetcattyAgent } = require("./netcattyAgent.cjs");
const fileWatcherBridge = require("./fileWatcherBridge.cjs");
const keyboardInteractiveHandler = require("./keyboardInteractiveHandler.cjs");
const { createProxySocket } = require("./proxyUtils.cjs");

// SFTP clients storage - shared reference passed from main
let sftpClients = null;
let electronModule = null;

// Storage for jump host connections that need to be cleaned up
const jumpConnectionsMap = new Map(); // connId -> { connections: SSHClient[], socket: stream }

/**
 * Send message to renderer safely
 */
function safeSend(sender, channel, payload) {
  try {
    if (!sender || sender.isDestroyed()) return;
    sender.send(channel, payload);
  } catch {
    // Ignore destroyed webContents during shutdown.
  }
}

/**
 * Initialize the SFTP bridge with dependencies
 */
function init(deps) {
  sftpClients = deps.sftpClients;
  electronModule = deps.electronModule;
}

/**
 * Connect through a chain of jump hosts for SFTP
 */
async function connectThroughChainForSftp(event, options, jumpHosts, targetHost, targetPort) {
  const connections = [];
  let currentSocket = null;

  try {
    // Connect through each jump host
    for (let i = 0; i < jumpHosts.length; i++) {
      const jump = jumpHosts[i];
      const isFirst = i === 0;
      const isLast = i === jumpHosts.length - 1;
      const hopLabel = jump.label || `${jump.hostname}:${jump.port || 22}`;

      console.log(`[SFTP Chain] Hop ${i + 1}/${jumpHosts.length}: Connecting to ${hopLabel}...`);

      const conn = new SSHClient();
      // Increase max listeners to prevent Node.js warning
      // Set to 0 (unlimited) since complex operations add many temp listeners
      conn.setMaxListeners(0);

      // Build connection options
      const connOpts = {
        host: jump.hostname,
        port: jump.port || 22,
        username: jump.username || 'root',
        readyTimeout: 20000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 3,
        // Enable keyboard-interactive authentication (required for 2FA/MFA)
        tryKeyboard: true,
        algorithms: {
          cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'aes128-ctr', 'aes256-ctr'],
          kex: ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'diffie-hellman-group14-sha256'],
          compress: ['none'],
        },
      };

      // Auth - support agent (certificate), key, and password fallback
      const hasCertificate =
        typeof jump.certificate === "string" && jump.certificate.trim().length > 0;

      let authAgent = null;
      if (hasCertificate) {
        authAgent = new NetcattyAgent({
          mode: "certificate",
          webContents: event.sender,
          meta: {
            label: jump.keyId || jump.username || "",
            certificate: jump.certificate,
            privateKey: jump.privateKey,
            passphrase: jump.passphrase,
          },
        });
        connOpts.agent = authAgent;
      } else if (jump.privateKey) {
        connOpts.privateKey = jump.privateKey;
        if (jump.passphrase) connOpts.passphrase = jump.passphrase;
      }

      if (jump.password) connOpts.password = jump.password;

      if (authAgent) {
        const order = ["agent"];
        if (connOpts.password) order.push("password");
        connOpts.authHandler = order;
      }

      // If first hop and proxy is configured, connect through proxy
      if (isFirst && options.proxy) {
        currentSocket = await createProxySocket(options.proxy, jump.hostname, jump.port || 22);
        connOpts.sock = currentSocket;
        delete connOpts.host;
        delete connOpts.port;
      } else if (!isFirst && currentSocket) {
        // Tunnel through previous hop
        connOpts.sock = currentSocket;
        delete connOpts.host;
        delete connOpts.port;
      }

      // Connect this hop
      await new Promise((resolve, reject) => {
        conn.on('ready', () => {
          console.log(`[SFTP Chain] Hop ${i + 1}/${jumpHosts.length}: ${hopLabel} connected`);
          resolve();
        });
        conn.on('error', (err) => {
          console.error(`[SFTP Chain] Hop ${i + 1}/${jumpHosts.length}: ${hopLabel} error:`, err.message);
          reject(err);
        });
        conn.on('timeout', () => {
          console.error(`[SFTP Chain] Hop ${i + 1}/${jumpHosts.length}: ${hopLabel} timeout`);
          reject(new Error(`Connection timeout to ${hopLabel}`));
        });
        conn.connect(connOpts);
      });

      connections.push(conn);

      // Determine next target
      let nextHost, nextPort;
      if (isLast) {
        // Last jump host, forward to final target
        nextHost = targetHost;
        nextPort = targetPort;
      } else {
        // Forward to next jump host
        const nextJump = jumpHosts[i + 1];
        nextHost = nextJump.hostname;
        nextPort = nextJump.port || 22;
      }

      // Create forward stream to next hop
      console.log(`[SFTP Chain] Hop ${i + 1}/${jumpHosts.length}: Forwarding to ${nextHost}:${nextPort}...`);
      currentSocket = await new Promise((resolve, reject) => {
        conn.forwardOut('127.0.0.1', 0, nextHost, nextPort, (err, stream) => {
          if (err) {
            console.error(`[SFTP Chain] Hop ${i + 1}/${jumpHosts.length}: forwardOut failed:`, err.message);
            reject(err);
            return;
          }
          console.log(`[SFTP Chain] Hop ${i + 1}/${jumpHosts.length}: forwardOut success`);
          resolve(stream);
        });
      });
    }

    // Return the final forwarded stream and all connections for cleanup
    return {
      socket: currentSocket,
      connections
    };
  } catch (err) {
    // Cleanup on error
    for (const conn of connections) {
      try { conn.end(); } catch (cleanupErr) { console.warn('[SFTP Chain] Cleanup error:', cleanupErr.message); }
    }
    throw err;
  }
}

/**
 * Open a new SFTP connection
 * Supports jump host connections when options.jumpHosts is provided
 */
async function openSftp(event, options) {
  const client = new SftpClient();
  const connId = options.sessionId || `${Date.now()}-sftp-${Math.random().toString(16).slice(2)}`;

  // Check if we need to connect through jump hosts
  const jumpHosts = options.jumpHosts || [];
  const hasJumpHosts = jumpHosts.length > 0;
  const hasProxy = !!options.proxy;

  let chainConnections = [];
  let connectionSocket = null;

  // Handle chain/proxy connections
  if (hasJumpHosts) {
    console.log(`[SFTP] Opening connection through ${jumpHosts.length} jump host(s) to ${options.hostname}:${options.port || 22}`);
    const chainResult = await connectThroughChainForSftp(
      event,
      options,
      jumpHosts,
      options.hostname,
      options.port || 22
    );
    connectionSocket = chainResult.socket;
    chainConnections = chainResult.connections;
  } else if (hasProxy) {
    console.log(`[SFTP] Opening connection through proxy to ${options.hostname}:${options.port || 22}`);
    connectionSocket = await createProxySocket(
      options.proxy,
      options.hostname,
      options.port || 22
    );
  }

  const connectOpts = {
    host: options.hostname,
    port: options.port || 22,
    username: options.username || "root",
    // Enable keyboard-interactive authentication (required for 2FA/MFA)
    tryKeyboard: true,
    readyTimeout: 120000, // 2 minutes for 2FA input
  };

  // Use the tunneled socket if we have one
  if (connectionSocket) {
    connectOpts.sock = connectionSocket;
    // When using sock, we should not set host/port as the connection is already established
    delete connectOpts.host;
    delete connectOpts.port;
  }

  const hasCertificate = typeof options.certificate === "string" && options.certificate.trim().length > 0;

  let authAgent = null;
  if (hasCertificate) {
    authAgent = new NetcattyAgent({
      mode: "certificate",
      webContents: event.sender,
      meta: {
        label: options.keyId || options.username || "",
        certificate: options.certificate,
        privateKey: options.privateKey,
        passphrase: options.passphrase,
      },
    });
    connectOpts.agent = authAgent;
  } else if (options.privateKey) {
    connectOpts.privateKey = options.privateKey;
    if (options.passphrase) connectOpts.passphrase = options.passphrase;
  }

  if (options.password) connectOpts.password = options.password;

  if (authAgent) {
    const order = ["agent"];
    if (connectOpts.password) order.push("password");
    connectOpts.authHandler = order;
  }

  // Add keyboard-interactive authentication support
  // ssh2-sftp-client exposes the underlying ssh2 Client through its `on` method
  const kiHandler = (name, instructions, instructionsLang, prompts, finish) => {
    console.log(`[SFTP] ${options.hostname} keyboard-interactive auth requested`, {
      name,
      instructions,
      promptCount: prompts?.length || 0,
      prompts: prompts?.map(p => ({ prompt: p.prompt, echo: p.echo })),
    });

    // If there are no prompts, just call finish with empty array
    if (!prompts || prompts.length === 0) {
      console.log(`[SFTP] No prompts, finishing keyboard-interactive`);
      finish([]);
      return;
    }

    // Check if all prompts are password prompts that we can auto-answer
    const responses = [];
    const promptsNeedingUserInput = [];

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i];
      const promptText = (prompt.prompt || '').toLowerCase().trim();

      // Auto-answer password prompts if we have a configured password
      if (options.password && (
        promptText.includes('password') ||
        promptText === 'password:' ||
        promptText === 'password'
      )) {
        console.log(`[SFTP] Auto-answering password prompt at index ${i}`);
        responses[i] = options.password;
      } else {
        // This prompt needs user input (likely 2FA)
        promptsNeedingUserInput.push({ index: i, prompt: prompt });
        responses[i] = null; // Placeholder
      }
    }

    // If all prompts were auto-answered, finish immediately
    if (promptsNeedingUserInput.length === 0) {
      console.log(`[SFTP] All prompts auto-answered, finishing keyboard-interactive`);
      finish(responses);
      return;
    }

    // If some prompts need user input, show the modal
    const requestId = keyboardInteractiveHandler.generateRequestId('sftp');

    // Store finish callback with context about which responses are already filled
    keyboardInteractiveHandler.storeRequest(requestId, (userResponses) => {
      // Merge user responses with auto-filled responses
      let userResponseIndex = 0;
      for (let i = 0; i < prompts.length; i++) {
        if (responses[i] === null) {
          responses[i] = userResponses[userResponseIndex] || '';
          userResponseIndex++;
        }
      }
      console.log(`[SFTP] Merged responses, finishing keyboard-interactive`);
      finish(responses);
    }, event.sender.id, connId);

    // Send only the prompts that need user input
    const promptsData = promptsNeedingUserInput.map((item) => ({
      prompt: item.prompt.prompt,
      echo: item.prompt.echo,
    }));

    console.log(`[SFTP] Showing modal for ${promptsData.length} prompts that need user input`);

    safeSend(event.sender, "netcatty:keyboard-interactive", {
      requestId,
      sessionId: connId,
      name: name || "",
      instructions: instructions || "",
      prompts: promptsData,
      hostname: options.hostname,
    });
  };

  // Add keyboard-interactive listener BEFORE connecting
  client.on("keyboard-interactive", kiHandler);

  // Enable keyboard-interactive authentication in authHandler
  if (connectOpts.authHandler) {
    // Add keyboard-interactive after the existing methods
    if (!connectOpts.authHandler.includes("keyboard-interactive")) {
      connectOpts.authHandler.push("keyboard-interactive");
    }
  } else {
    // Create authHandler with keyboard-interactive support
    const authMethods = [];
    if (connectOpts.privateKey) authMethods.push("publickey");
    if (connectOpts.password) authMethods.push("password");
    authMethods.push("keyboard-interactive");
    connectOpts.authHandler = authMethods;
  }

  // Increase timeout to allow for keyboard-interactive auth
  connectOpts.readyTimeout = 120000; // 2 minutes for 2FA input

  try {
    await client.connect(connectOpts);

    // Increase max listeners AFTER connect, when the internal ssh2 Client exists
    // This prevents Node.js MaxListenersExceededWarning when performing many operations
    // ssh2-sftp-client adds temporary listeners for each operation, so we need a high limit
    if (client.client && typeof client.client.setMaxListeners === 'function') {
      client.client.setMaxListeners(0); // 0 means unlimited
    }

    sftpClients.set(connId, client);

    // Store jump connections for cleanup when SFTP is closed
    if (chainConnections.length > 0) {
      jumpConnectionsMap.set(connId, {
        connections: chainConnections,
        socket: connectionSocket
      });
    }

    console.log(`[SFTP] Connection established: ${connId}`);
    return { sftpId: connId };
  } catch (err) {
    // Cleanup jump connections on error
    for (const conn of chainConnections) {
      try { conn.end(); } catch (cleanupErr) { console.warn('[SFTP] Cleanup error on connect failure:', cleanupErr.message); }
    }
    throw err;
  }
}

/**
 * List files in a directory
 * Properly handles symlinks by resolving their target type
 */
async function listSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  const list = await client.list(payload.path || ".");
  const basePath = payload.path || ".";

  // Process items and resolve symlinks
  const results = await Promise.all(list.map(async (item) => {
    let type;
    let linkTarget = null;

    if (item.type === "d") {
      type = "directory";
    } else if (item.type === "l") {
      // This is a symlink - try to resolve its target type
      type = "symlink";
      try {
        // Use path.posix.join to properly construct the path and avoid double slashes
        const fullPath = path.posix.join(basePath === "." ? "/" : basePath, item.name);
        const stat = await client.stat(fullPath);
        // stat follows symlinks, so we get the target's type
        if (stat.isDirectory) {
          linkTarget = "directory";
        } else {
          linkTarget = "file";
        }
      } catch (err) {
        // If we can't stat the symlink target (broken link), keep it as symlink
        console.warn(`Could not resolve symlink target for ${item.name}:`, err.message);
      }
    } else {
      type = "file";
    }

    // Extract permissions from longname or rights
    let permissions = undefined;
    if (item.rights) {
      // ssh2-sftp-client returns rights object with user/group/other
      permissions = `${item.rights.user || '---'}${item.rights.group || '---'}${item.rights.other || '---'}`;
    } else if (item.longname) {
      // Fallback: parse from longname (e.g., "-rwxr-xr-x 1 root root ...")
      const match = item.longname.match(/^[dlsbc-]([rwxsStT-]{9})/);
      if (match) {
        permissions = match[1];
      }
    }

    return {
      name: item.name,
      type,
      linkTarget,
      size: `${item.size} bytes`,
      lastModified: new Date(item.modifyTime || Date.now()).toISOString(),
      permissions,
    };
  }));

  return results;
}

/**
 * Read file content
 */
async function readSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  const buffer = await client.get(payload.path);
  return buffer.toString();
}

/**
 * Read file as binary (returns ArrayBuffer for binary files like images)
 */
async function readSftpBinary(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  const buffer = await client.get(payload.path);
  // Convert Node.js Buffer to ArrayBuffer
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/**
 * Write file content
 */
async function writeSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  await client.put(Buffer.from(payload.content, "utf-8"), payload.path);
  return true;
}

/**
 * Write binary data with progress callback
 */
async function writeSftpBinaryWithProgress(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  const { sftpId, path: remotePath, content, transferId } = payload;
  const buffer = Buffer.from(content);
  const totalBytes = buffer.length;
  let transferredBytes = 0;
  let lastProgressTime = Date.now();
  let lastTransferredBytes = 0;

  const { Readable } = require("stream");
  const readableStream = new Readable({
    read() {
      const chunkSize = 65536;
      if (transferredBytes < totalBytes) {
        const end = Math.min(transferredBytes + chunkSize, totalBytes);
        const chunk = buffer.slice(transferredBytes, end);
        transferredBytes = end;

        const now = Date.now();
        const elapsed = (now - lastProgressTime) / 1000;
        let speed = 0;
        if (elapsed >= 0.1) {
          speed = (transferredBytes - lastTransferredBytes) / elapsed;
          lastProgressTime = now;
          lastTransferredBytes = transferredBytes;
        }

        const contents = electronModule.webContents.fromId(event.sender.id);
        contents?.send("netcatty:upload:progress", {
          transferId,
          transferred: transferredBytes,
          totalBytes,
          speed,
        });

        this.push(chunk);
      } else {
        this.push(null);
      }
    }
  });

  try {
    await client.put(readableStream, remotePath);

    const contents = electronModule.webContents.fromId(event.sender.id);
    contents?.send("netcatty:upload:complete", { transferId });

    return { success: true, transferId };
  } catch (err) {
    const contents = electronModule.webContents.fromId(event.sender.id);
    contents?.send("netcatty:upload:error", { transferId, error: err.message });
    throw err;
  }
}

/**
 * Close an SFTP connection
 * Also cleans up any jump host connections and file watchers if present
 */
async function closeSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) return;

  // Stop file watchers and clean up temp files for this SFTP session
  try {
    fileWatcherBridge.stopWatchersForSession(payload.sftpId, true);
  } catch (err) {
    console.warn("[SFTP] Error stopping file watchers:", err.message);
  }

  try {
    await client.end();
  } catch (err) {
    console.warn("SFTP close failed", err);
  }
  sftpClients.delete(payload.sftpId);

  // Clean up jump connections if any
  const jumpData = jumpConnectionsMap.get(payload.sftpId);
  if (jumpData) {
    for (const conn of jumpData.connections) {
      try { conn.end(); } catch (cleanupErr) { console.warn('[SFTP] Cleanup error on close:', cleanupErr.message); }
    }
    jumpConnectionsMap.delete(payload.sftpId);
    console.log(`[SFTP] Cleaned up ${jumpData.connections.length} jump connection(s) for ${payload.sftpId}`);
  }
}

/**
 * Create a directory
 */
async function mkdirSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  await client.mkdir(payload.path, true);
  return true;
}

/**
 * Delete a file or directory
 */
async function deleteSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  const stat = await client.stat(payload.path);
  if (stat.isDirectory) {
    await client.rmdir(payload.path, true);
  } else {
    await client.delete(payload.path);
  }
  return true;
}

/**
 * Rename a file or directory
 */
async function renameSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  await client.rename(payload.oldPath, payload.newPath);
  return true;
}

/**
 * Get file statistics
 */
async function statSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  const stat = await client.stat(payload.path);
  return {
    name: path.basename(payload.path),
    type: stat.isDirectory ? "directory" : stat.isSymbolicLink ? "symlink" : "file",
    size: stat.size,
    lastModified: stat.modifyTime,
    permissions: stat.mode ? (stat.mode & 0o777).toString(8) : undefined,
  };
}

/**
 * Change file permissions
 */
async function chmodSftp(event, payload) {
  const client = sftpClients.get(payload.sftpId);
  if (!client) throw new Error("SFTP session not found");

  await client.chmod(payload.path, parseInt(payload.mode, 8));
  return true;
}

/**
 * Register IPC handlers for SFTP operations
 */
function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:sftp:open", openSftp);
  ipcMain.handle("netcatty:sftp:list", listSftp);
  ipcMain.handle("netcatty:sftp:read", readSftp);
  ipcMain.handle("netcatty:sftp:readBinary", readSftpBinary);
  ipcMain.handle("netcatty:sftp:write", writeSftp);
  ipcMain.handle("netcatty:sftp:writeBinaryWithProgress", writeSftpBinaryWithProgress);
  ipcMain.handle("netcatty:sftp:close", closeSftp);
  ipcMain.handle("netcatty:sftp:mkdir", mkdirSftp);
  ipcMain.handle("netcatty:sftp:delete", deleteSftp);
  ipcMain.handle("netcatty:sftp:rename", renameSftp);
  ipcMain.handle("netcatty:sftp:stat", statSftp);
  ipcMain.handle("netcatty:sftp:chmod", chmodSftp);
}

/**
 * Get the SFTP clients map (for external access)
 */
function getSftpClients() {
  return sftpClients;
}

module.exports = {
  init,
  registerHandlers,
  getSftpClients,
  openSftp,
  listSftp,
  readSftp,
  readSftpBinary,
  writeSftp,
  writeSftpBinaryWithProgress,
  closeSftp,
  mkdirSftp,
  deleteSftp,
  renameSftp,
  statSftp,
  chmodSftp,
};
