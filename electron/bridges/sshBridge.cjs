/**
 * SSH Bridge - Handles SSH connections, sessions, and related operations
 * Extracted from main.cjs for single responsibility
 */

const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { exec } = require("node:child_process");
const { Client: SSHClient, utils: sshUtils } = require("ssh2");
const { NetcattyAgent } = require("./netcattyAgent.cjs");
const keyboardInteractiveHandler = require("./keyboardInteractiveHandler.cjs");
const { createProxySocket } = require("./proxyUtils.cjs");

// Default SSH key names in priority order
const DEFAULT_KEY_NAMES = ["id_ed25519", "id_ecdsa", "id_rsa"];

/**
 * Check if an SSH private key is encrypted (requires passphrase)
 * @param {string} keyContent - The content of the private key file
 * @returns {boolean} - True if the key is encrypted
 */
function isKeyEncrypted(keyContent) {
  // Check for PKCS#8 encrypted format (-----BEGIN ENCRYPTED PRIVATE KEY-----)
  if (keyContent.includes("-----BEGIN ENCRYPTED PRIVATE KEY-----")) {
    return true;
  }

  // Check for legacy PEM format encryption (e.g., RSA PRIVATE KEY with encryption)
  if (keyContent.includes("Proc-Type:") && keyContent.includes("ENCRYPTED")) {
    return true;
  }

  // Check for OpenSSH format keys
  if (keyContent.includes("-----BEGIN OPENSSH PRIVATE KEY-----")) {
    try {
      // Extract the base64 content between the markers
      const base64Match = keyContent.match(
        /-----BEGIN OPENSSH PRIVATE KEY-----\s*([\s\S]*?)\s*-----END OPENSSH PRIVATE KEY-----/
      );
      if (base64Match) {
        const base64Content = base64Match[1].replace(/\s/g, "");
        const keyBuffer = Buffer.from(base64Content, "base64");

        // OpenSSH key format: "openssh-key-v1\0" followed by cipher name
        // If ciphername is "none", the key is not encrypted
        const authMagic = "openssh-key-v1\0";
        if (keyBuffer.toString("ascii", 0, authMagic.length) === authMagic) {
          // After magic, read ciphername (length-prefixed string)
          let offset = authMagic.length;
          const cipherNameLen = keyBuffer.readUInt32BE(offset);
          offset += 4;
          const cipherName = keyBuffer.toString("ascii", offset, offset + cipherNameLen);
          return cipherName !== "none";
        }
      }
    } catch {
      // If parsing fails, assume it might be encrypted to be safe
      return true;
    }
  }

  return false;
}

/**
 * Find default SSH private key from user's ~/.ssh directory
 * Skips encrypted keys that require a passphrase to allow password/keyboard-interactive auth
 * @returns {{ privateKey: string, keyPath: string, keyName: string } | null}
 */
function findDefaultPrivateKey() {
  const sshDir = path.join(os.homedir(), ".ssh");
  for (const name of DEFAULT_KEY_NAMES) {
    const keyPath = path.join(sshDir, name);
    if (fs.existsSync(keyPath)) {
      try {
        const privateKey = fs.readFileSync(keyPath, "utf8");
        // Skip encrypted keys - they require a passphrase and would abort
        // authentication before password/keyboard-interactive can be tried
        if (isKeyEncrypted(privateKey)) {
          log("Skipping encrypted default key", { keyPath, keyName: name });
          continue;
        }
        log("Found default key", { keyPath, keyName: name });
        return { privateKey, keyPath, keyName: name };
      } catch (e) {
        log("Failed to read default key", { keyPath, error: e.message });
        continue;
      }
    }
  }
  return null;
}

/**
 * Check if Windows SSH Agent service is running
 * @returns {Promise<{ running: boolean, startupType: string | null, error: string | null }>}
 */
function checkWindowsSshAgent() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve({ running: true, startupType: null, error: null });
      return;
    }
    exec("sc query ssh-agent", (err, stdout) => {
      if (err) {
        resolve({ running: false, startupType: null, error: "SSH Agent service not found" });
        return;
      }
      const running = stdout.includes("RUNNING");
      const stopped = stdout.includes("STOPPED");
      resolve({
        running,
        startupType: stopped ? "stopped" : (running ? "running" : "unknown"),
        error: null,
      });
    });
  });
}

// Simple file logger for debugging
const logFile = path.join(require("os").tmpdir(), "netcatty-ssh.log");
const log = (msg, data) => {
  const line = `[${new Date().toISOString()}] ${msg} ${data ? JSON.stringify(data) : ""}\n`;
  try { fs.appendFileSync(logFile, line); } catch { }
  console.log("[SSH]", msg, data || "");
};

// Session storage - shared reference passed from main
let sessions = null;
let electronModule = null;

// Normalize charset inputs (often provided as bare encodings like "UTF-8")
// into a usable LANG locale for remote shells.
function resolveLangFromCharset(charset) {
  if (!charset) return "en_US.UTF-8";
  const trimmed = String(charset).trim();
  if (/^utf-?8$/i.test(trimmed) || /^utf8$/i.test(trimmed)) {
    return "en_US.UTF-8";
  }
  return trimmed;
}

function safeSend(sender, channel, payload) {
  try {
    if (!sender || sender.isDestroyed()) return;
    sender.send(channel, payload);
  } catch {
    // Ignore destroyed webContents during shutdown.
  }
}

/**
 * Initialize the SSH bridge with dependencies
 */
function init(deps) {
  sessions = deps.sessions;
  electronModule = deps.electronModule;
}

/**
 * Connect through a chain of jump hosts
 */
async function connectThroughChain(event, options, jumpHosts, targetHost, targetPort) {
  const sender = event.sender;
  const connections = [];
  let currentSocket = null;

  const sendProgress = (hop, total, label, status) => {
    if (!sender.isDestroyed()) {
      sender.send("netcatty:chain:progress", { hop, total, label, status });
    }
  };

  try {
    const totalHops = jumpHosts.length;

    // Connect through each jump host
    for (let i = 0; i < jumpHosts.length; i++) {
      const jump = jumpHosts[i];
      const isFirst = i === 0;
      const isLast = i === jumpHosts.length - 1;
      const hopLabel = jump.label || `${jump.hostname}:${jump.port || 22}`;

      sendProgress(i + 1, totalHops + 1, hopLabel, 'connecting');

      const conn = new SSHClient();

      // Build connection options
      const connOpts = {
        host: jump.hostname,
        port: jump.port || 22,
        username: jump.username || 'root',
        readyTimeout: 20000, // Reduced from 60s for faster failure detection
        // Use user-configured keepalive interval from options (in seconds -> convert to ms)
        // If 0 or not provided, use 10000ms as default
        keepaliveInterval: options.keepaliveInterval && options.keepaliveInterval > 0 ? options.keepaliveInterval * 1000 : 10000,
        keepaliveCountMax: 3,
        // Enable keyboard-interactive authentication (required for 2FA/MFA)
        tryKeyboard: true,
        algorithms: {
          // Prioritize fastest ciphers (GCM modes are hardware-accelerated)
          cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'aes128-ctr', 'aes256-ctr'],
          // Prioritize faster key exchange
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
          console.log(`[Chain] Hop ${i + 1}/${totalHops}: ${hopLabel} connected`);
          sendProgress(i + 1, totalHops + 1, hopLabel, 'connected');
          resolve();
        });
        conn.on('error', (err) => {
          console.error(`[Chain] Hop ${i + 1}/${totalHops}: ${hopLabel} error:`, err.message);
          sendProgress(i + 1, totalHops + 1, hopLabel, 'error');
          reject(err);
        });
        conn.on('timeout', () => {
          console.error(`[Chain] Hop ${i + 1}/${totalHops}: ${hopLabel} timeout`);
          reject(new Error(`Connection timeout to ${hopLabel}`));
        });
        console.log(`[Chain] Hop ${i + 1}/${totalHops}: Connecting to ${hopLabel}...`);
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
      console.log(`[Chain] Hop ${i + 1}/${totalHops}: Forwarding from ${hopLabel} to ${nextHost}:${nextPort}...`);
      sendProgress(i + 1, totalHops + 1, hopLabel, 'forwarding');
      currentSocket = await new Promise((resolve, reject) => {
        conn.forwardOut('127.0.0.1', 0, nextHost, nextPort, (err, stream) => {
          if (err) {
            console.error(`[Chain] Hop ${i + 1}/${totalHops}: forwardOut from ${hopLabel} to ${nextHost}:${nextPort} FAILED:`, err.message);
            reject(err);
            return;
          }
          console.log(`[Chain] Hop ${i + 1}/${totalHops}: forwardOut from ${hopLabel} to ${nextHost}:${nextPort} SUCCESS`);
          resolve(stream);
        });
      });
    }

    // Return the final forwarded stream and all connections for cleanup
    return {
      socket: currentSocket,
      connections,
      sendProgress
    };
  } catch (err) {
    // Cleanup on error
    for (const conn of connections) {
      try { conn.end(); } catch { }
    }
    throw err;
  }
}

/**
 * Start an SSH session
 */
async function startSSHSession(event, options) {
  const sessionId =
    options.sessionId ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const cols = options.cols || 80;
  const rows = options.rows || 24;
  const sender = event.sender;

  const sendProgress = (hop, total, label, status) => {
    if (!sender.isDestroyed()) {
      sender.send("netcatty:chain:progress", { hop, total, label, status });
    }
  };

  try {
    const conn = new SSHClient();
    let chainConnections = [];
    let connectionSocket = null;

    // Determine if we have jump hosts
    const jumpHosts = options.jumpHosts || [];
    const hasJumpHosts = jumpHosts.length > 0;
    const hasProxy = !!options.proxy;
    const totalHops = jumpHosts.length + 1; // +1 for final target

    // Build base connection options for final target
    const connectOpts = {
      host: options.hostname,
      port: options.port || 22,
      username: options.username || "root",
      // `readyTimeout` covers the entire connection + authentication flow in ssh2.
      readyTimeout: 20000, // Fast failure for non-interactive auth
      // Use user-configured keepalive interval (in seconds -> convert to ms)
      // If 0 or not provided, use 10000ms as default
      keepaliveInterval: options.keepaliveInterval && options.keepaliveInterval > 0 ? options.keepaliveInterval * 1000 : 10000,
      keepaliveCountMax: 3,
      // Enable keyboard-interactive authentication (required for 2FA/MFA)
      tryKeyboard: true,
      algorithms: {
        // Prioritize fastest ciphers (GCM modes are hardware-accelerated)
        cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'aes128-ctr', 'aes256-ctr'],
        // Prioritize faster key exchange
        kex: ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'diffie-hellman-group14-sha256'],
        compress: ['none'],
      },
    };

    // Authentication for final target
    const hasCertificate = typeof options.certificate === "string" && options.certificate.trim().length > 0;
    const effectivePassphrase = options.passphrase;

    console.log("[SSH] Auth configuration:", {
      hasCertificate,
      keySource: options.keySource,
      hasPublicKey: !!options.publicKey,
      hasPrivateKey: !!options.privateKey,
      hasPassword: !!options.password,
      hasEffectivePassphrase: !!effectivePassphrase,
    });

    log("Auth configuration", {
      hasCertificate,
      keySource: options.keySource,
      hasPublicKey: !!options.publicKey,
      hasPrivateKey: !!options.privateKey,
    });

    let authAgent = null;
    if (hasCertificate) {
      authAgent = new NetcattyAgent({
        mode: "certificate",
        webContents: event.sender,
        meta: {
          label: options.keyId || options.username || "",
          certificate: options.certificate,
          privateKey: options.privateKey,
          passphrase: effectivePassphrase,
        },
      });
      connectOpts.agent = authAgent;
    } else if (options.privateKey) {
      connectOpts.privateKey = options.privateKey;
      if (effectivePassphrase) {
        connectOpts.passphrase = effectivePassphrase;
      }
    }

    if (options.password) {
      connectOpts.password = options.password;
    }

    // Fallback to default SSH key if no authentication method is configured
    let usedDefaultKey = null;
    if (!connectOpts.privateKey && !connectOpts.password && !connectOpts.agent) {
      const defaultKey = findDefaultPrivateKey();
      if (defaultKey) {
        log("Using default SSH key as fallback", { keyPath: defaultKey.keyPath });
        connectOpts.privateKey = defaultKey.privateKey;
        usedDefaultKey = defaultKey;
      }
    }

    // Agent forwarding
    if (options.agentForwarding) {
      connectOpts.agentForward = true;
      if (!connectOpts.agent) {
        if (process.platform === "win32") {
          connectOpts.agent = "\\\\.\\pipe\\openssh-ssh-agent";
        } else {
          connectOpts.agent = process.env.SSH_AUTH_SOCK;
        }
      }
    }

    // Prefer agent-based auth when we created an in-process agent (cert)
    if (authAgent) {
      const order = ["agent"];
      // Allow password fallback if provided
      if (connectOpts.password) order.push("password");
      connectOpts.authHandler = order;
    }

    // Handle chain/proxy connections
    if (hasJumpHosts) {
      const chainResult = await connectThroughChain(
        event,
        options,
        jumpHosts,
        options.hostname,
        options.port || 22
      );
      connectionSocket = chainResult.socket;
      chainConnections = chainResult.connections;

      connectOpts.sock = connectionSocket;
      delete connectOpts.host;
      delete connectOpts.port;

      sendProgress(totalHops, totalHops, options.hostname, 'connecting');
    } else if (hasProxy) {
      sendProgress(1, 1, options.hostname, 'connecting');
      connectionSocket = await createProxySocket(
        options.proxy,
        options.hostname,
        options.port || 22
      );
      connectOpts.sock = connectionSocket;
      delete connectOpts.host;
      delete connectOpts.port;
    }

    return new Promise((resolve, reject) => {
      const logPrefix = hasJumpHosts ? '[Chain]' : '[SSH]';
      conn.on("ready", () => {
        console.log(`${logPrefix} ${options.hostname} ready`);
        if (hasJumpHosts || hasProxy) {
          sendProgress(totalHops, totalHops, options.hostname, 'connected');
        }

        conn.shell(
          {
            term: "xterm-256color",
            cols,
            rows,
          },
          {
            env: {
              LANG: resolveLangFromCharset(options.charset),
              COLORTERM: "truecolor",
              ...(options.env || {}),
            },
          },
          (err, stream) => {
            if (err) {
              conn.end();
              for (const c of chainConnections) {
                try { c.end(); } catch { }
              }
              reject(err);
              return;
            }

            const session = {
              conn,
              stream,
              chainConnections,
              webContentsId: event.sender.id,
            };
            sessions.set(sessionId, session);

            // Data buffering for reduced IPC overhead
            let dataBuffer = '';
            let flushTimeout = null;
            const FLUSH_INTERVAL = 8; // ms - flush every 8ms for ~120fps equivalent
            const MAX_BUFFER_SIZE = 16384; // 16KB - flush immediately if buffer gets too large

            const flushBuffer = () => {
              if (dataBuffer.length > 0) {
                const contents = event.sender;
                safeSend(contents, "netcatty:data", { sessionId, data: dataBuffer });
                dataBuffer = '';
              }
              flushTimeout = null;
            };

            const bufferData = (data) => {
              dataBuffer += data;
              // Immediate flush for large chunks
              if (dataBuffer.length >= MAX_BUFFER_SIZE) {
                if (flushTimeout) {
                  clearTimeout(flushTimeout);
                  flushTimeout = null;
                }
                flushBuffer();
              } else if (!flushTimeout) {
                // Schedule flush
                flushTimeout = setTimeout(flushBuffer, FLUSH_INTERVAL);
              }
            };

            stream.on("data", (data) => {
              bufferData(data.toString("utf8"));
            });

            stream.stderr?.on("data", (data) => {
              bufferData(data.toString("utf8"));
            });

            stream.on("close", () => {
              // Flush any remaining data before close
              if (flushTimeout) {
                clearTimeout(flushTimeout);
              }
              flushBuffer();
              const contents = event.sender;
              safeSend(contents, "netcatty:exit", { sessionId, exitCode: 0 });
              sessions.delete(sessionId);
              conn.end();
              for (const c of chainConnections) {
                try { c.end(); } catch { }
              }
            });

            // Run startup command if specified
            if (options.startupCommand) {
              setTimeout(() => {
                stream.write(`${options.startupCommand}\n`);
              }, 300);
            }

            resolve({ sessionId });
          }
        );
      });

      conn.on("error", (err) => {
        const contents = event.sender;

        const isAuthError = err.message?.toLowerCase().includes('authentication') ||
          err.message?.toLowerCase().includes('auth') ||
          err.message?.toLowerCase().includes('password') ||
          err.level === 'client-authentication';

        // Use log instead of error for auth failures (normal fallback scenario)
        if (isAuthError) {
          console.log(`${logPrefix} ${options.hostname} auth failed:`, err.message);
          safeSend(contents, "netcatty:auth:failed", {
            sessionId,
            error: err.message,
            hostname: options.hostname
          });
        } else {
          console.error(`${logPrefix} ${options.hostname} error:`, err.message);
        }

        safeSend(contents, "netcatty:exit", { sessionId, exitCode: 1, error: err.message });
        sessions.delete(sessionId);
        for (const c of chainConnections) {
          try { c.end(); } catch { }
        }
        reject(err);
      });

      conn.on("timeout", () => {
        console.error(`${logPrefix} ${options.hostname} connection timeout`);
        const err = new Error(`Connection timeout to ${options.hostname}`);
        const contents = event.sender;
        safeSend(contents, "netcatty:exit", { sessionId, exitCode: 1, error: err.message });
        sessions.delete(sessionId);
        for (const c of chainConnections) {
          try { c.end(); } catch { }
        }
        reject(err);
      });

      conn.on("close", () => {
        const contents = event.sender;
        safeSend(contents, "netcatty:exit", { sessionId, exitCode: 0 });
        sessions.delete(sessionId);
        for (const c of chainConnections) {
          try { c.end(); } catch { }
        }
      });

      // Handle keyboard-interactive authentication (2FA/MFA)
      conn.on("keyboard-interactive", (name, instructions, instructionsLang, prompts, finish) => {
        console.log(`${logPrefix} ${options.hostname} keyboard-interactive auth requested`, {
          name,
          instructions,
          promptCount: prompts?.length || 0,
          prompts: prompts?.map(p => ({ prompt: p.prompt, echo: p.echo })),
        });

        // If there are no prompts, just call finish with empty array
        if (!prompts || prompts.length === 0) {
          console.log(`${logPrefix} No prompts, finishing keyboard-interactive`);
          finish([]);
          return;
        }

        // Forward ALL prompts to user - no auto-fill to avoid semantic detection issues
        // (Prompt text is admin-customizable and may not contain expected keywords)
        const requestId = keyboardInteractiveHandler.generateRequestId('ssh');

        keyboardInteractiveHandler.storeRequest(requestId, (userResponses) => {
          console.log(`${logPrefix} Received user responses, finishing keyboard-interactive`);
          finish(userResponses);
        }, sender.id, sessionId);

        const promptsData = prompts.map((p) => ({
          prompt: p.prompt,
          echo: p.echo,
        }));

        console.log(`${logPrefix} Showing modal for ${promptsData.length} prompts`);

        safeSend(sender, "netcatty:keyboard-interactive", {
          requestId,
          sessionId,
          name: name || "",
          instructions: instructions || "",
          prompts: promptsData,
          hostname: options.hostname,
          savedPassword: options.password || null, // Pass saved password for optional fill button
        });
      });


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

      console.log(`${logPrefix} Connecting to ${options.hostname}...`);
      conn.connect(connectOpts);
    });
  } catch (err) {
    console.error("[Chain] SSH chain connection error:", err.message);
    const contents = event.sender;
    safeSend(contents, "netcatty:exit", { sessionId, exitCode: 1, error: err.message });
    throw err;
  }
}

/**
 * Execute a one-off command via SSH
 */
async function execCommand(event, payload) {
  return new Promise((resolve, reject) => {
    const conn = new SSHClient();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeoutMs = payload.timeout || 10000;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      conn.end();
      reject(new Error("SSH exec timeout"));
    }, timeoutMs);

    conn
      .on("ready", () => {
        conn.exec(payload.command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            settled = true;
            conn.end();
            return reject(err);
          }
          stream
            .on("data", (data) => {
              stdout += data.toString();
            })
            .stderr.on("data", (data) => {
              stderr += data.toString();
            })
            .on("close", (code) => {
              if (settled) return;
              clearTimeout(timer);
              settled = true;
              conn.end();
              resolve({ stdout, stderr, code: code ?? (stderr ? 1 : 0) });
            });
        });
      })
      .on("error", (err) => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        reject(err);
      })
      .on("end", () => {
        if (settled) return;
        clearTimeout(timer);
        settled = true;
        if (stderr || stdout) {
          resolve({ stdout, stderr, code: 0 });
        } else {
          reject(new Error("SSH connection closed unexpectedly"));
        }
      });

    const hasCertificate = typeof payload.certificate === "string" && payload.certificate.trim().length > 0;

    const connectOpts = {
      host: payload.hostname,
      port: payload.port || 22,
      username: payload.username,
      readyTimeout: timeoutMs,
      keepaliveInterval: 0,
    };

    let authAgent = null;
    if (hasCertificate) {
      authAgent = new NetcattyAgent({
        mode: "certificate",
        webContents: event.sender,
        meta: {
          label: payload.keyId || payload.username || "",
          certificate: payload.certificate,
          privateKey: payload.privateKey,
          passphrase: payload.passphrase,
        },
      });
      connectOpts.agent = authAgent;
    } else if (payload.privateKey) {
      connectOpts.privateKey = payload.privateKey;
      if (payload.passphrase) connectOpts.passphrase = payload.passphrase;
    }

    if (payload.password) connectOpts.password = payload.password;

    if (authAgent) {
      const order = ["agent"];
      if (connectOpts.password) order.push("password");
      connectOpts.authHandler = order;
    }

    conn.connect(connectOpts);
  });
}

/**
 * Generate SSH key pair
 */
async function generateKeyPair(event, options) {
  const { type, bits, comment } = options;

  try {
    let keyType;
    let keyBits = bits;

    switch (type) {
      case 'ED25519':
        keyType = 'ed25519';
        keyBits = undefined;
        break;
      case 'ECDSA':
        keyType = 'ecdsa';
        keyBits = bits || 256;
        break;
      case 'RSA':
      default:
        keyType = 'rsa';
        keyBits = bits || 4096;
        break;
    }

    const result = sshUtils.generateKeyPairSync(keyType, {
      bits: keyBits,
      comment: comment || 'netcatty-generated-key',
    });

    const privateKey = result.private;
    const publicKey = result.public;

    return {
      success: true,
      privateKey,
      publicKey,
    };
  } catch (err) {
    console.error('Key generation failed:', err);
    return {
      success: false,
      error: err.message || 'Key generation failed',
    };
  }
}

/**
 * Wrapper for SSH session handler to suppress noisy auth error stack traces
 * Auth failures are expected when fallback to password is available
 */
async function startSSHSessionWrapper(event, options) {
  try {
    return await startSSHSession(event, options);
  } catch (err) {
    const isAuthError = err.message?.toLowerCase().includes('authentication') ||
      err.message?.toLowerCase().includes('auth') ||
      err.level === 'client-authentication';

    if (isAuthError) {
      // Re-throw with a clean error to avoid Electron printing full stack trace
      // The frontend will handle this as a normal auth failure for fallback
      const authError = new Error(err.message);
      authError.level = 'client-authentication';
      authError.isAuthError = true;
      throw authError;
    }
    throw err;
  }
}

/**
 * Get current working directory from an active SSH session
 * This sends 'pwd' to the existing shell stream and captures the output
 * using unique markers to identify the command output boundaries
 */
async function getSessionPwd(event, payload) {
  const { sessionId } = payload;
  const session = sessions.get(sessionId);

  if (!session || !session.stream || !session.conn) {
    return { success: false, error: 'Session not found or not connected' };
  }

  return new Promise((resolve) => {
    const stream = session.stream;
    const marker = `__PWD_${Date.now()}__`;
    const timeout = setTimeout(() => {
      stream.removeListener('data', onData);
      resolve({ success: false, error: 'Timeout getting pwd' });
    }, 3000);

    let buffer = '';

    const onData = (data) => {
      const str = data.toString();
      buffer += str;

      // We need to find the ACTUAL output markers, not the command echo
      // The command echo looks like: echo '__PWD_xxx__S' && pwd && echo '__PWD_xxx__E'
      // The actual output looks like: __PWD_xxx__S\n/path/to/dir\n__PWD_xxx__E
      // 
      // We look for the marker at the START of a line (after newline) to avoid the echo
      const startMarkerRegex = new RegExp(`(?:^|[\\r\\n])${marker}S[\\r\\n]+`);
      const endMarkerRegex = new RegExp(`[\\r\\n]${marker}E(?:[\\r\\n]|$)`);

      const startMatch = buffer.match(startMarkerRegex);
      const endMatch = buffer.match(endMarkerRegex);

      if (startMatch && endMatch) {
        const startIdx = buffer.indexOf(startMatch[0]) + startMatch[0].length;
        const endIdx = buffer.indexOf(endMatch[0]);

        if (startIdx <= endIdx) {
          clearTimeout(timeout);
          stream.removeListener('data', onData);

          const pwdOutput = buffer.slice(startIdx, endIdx).trim();
          console.log('[getSessionPwd] pwdOutput:', JSON.stringify(pwdOutput));

          // The pwd output should be a valid absolute path
          if (pwdOutput && pwdOutput.startsWith('/')) {
            console.log('[getSessionPwd] Success, cwd:', pwdOutput);
            resolve({ success: true, cwd: pwdOutput });
          } else {
            console.log('[getSessionPwd] Failed - invalid path:', pwdOutput);
            resolve({ success: false, error: 'Invalid pwd output' });
          }
        }
      }
    };

    stream.on('data', onData);

    // Send pwd command with short unique markers
    // Using 'S' and 'E' as suffixes to make markers shorter
    // After the command, send ANSI escape sequences to clear the output lines:
    // \x1b[1A = move cursor up 1 line, \x1b[2K = clear entire line
    // Clear 4 lines: the command echo, START marker, pwd output, and END marker
    const clearLines = '\\x1b[1A\\x1b[2K\\x1b[1A\\x1b[2K\\x1b[1A\\x1b[2K\\x1b[1A\\x1b[2K';
    stream.write(` echo '${marker}S' && pwd && echo '${marker}E' && printf '${clearLines}'\n`);
  });
}

/**
 * Register IPC handlers for SSH operations
 */
function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:start", startSSHSessionWrapper);
  ipcMain.handle("netcatty:ssh:exec", execCommand);
  ipcMain.handle("netcatty:ssh:pwd", getSessionPwd);
  ipcMain.handle("netcatty:key:generate", generateKeyPair);
  ipcMain.handle("netcatty:ssh:check-agent", async () => {
    return await checkWindowsSshAgent();
  });
  ipcMain.handle("netcatty:ssh:get-default-keys", async () => {
    const sshDir = path.join(os.homedir(), ".ssh");
    const keys = [];
    for (const name of DEFAULT_KEY_NAMES) {
      const keyPath = path.join(sshDir, name);
      if (fs.existsSync(keyPath)) {
        keys.push({ name, path: keyPath });
      }
    }
    return keys;
  });
  // Register the shared keyboard-interactive response handler
  keyboardInteractiveHandler.registerHandler(ipcMain);
}

module.exports = {
  init,
  registerHandlers,
  createProxySocket,
  startSSHSession,
  execCommand,
  getSessionPwd,
  generateKeyPair,
  checkWindowsSshAgent,
  findDefaultPrivateKey,
};
