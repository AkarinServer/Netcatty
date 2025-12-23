/**
 * OneDrive OAuth + Graph Bridge (main process)
 *
 * Renderer fetches to Microsoft token/Graph endpoints can be blocked by CORS.
 * This bridge proxies token exchange/refresh and Graph requests via main process.
 */

const ONEDRIVE_TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const ONEDRIVE_GRAPH_API = "https://graph.microsoft.com/v1.0";
const APP_FOLDER_PATH = "/drive/special/approot";
const DEFAULT_SYNC_FILE_NAME = "netcatty-vault.json";
const DEFAULT_SCOPE =
  "https://graph.microsoft.com/Files.ReadWrite.AppFolder https://graph.microsoft.com/User.Read offline_access";

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const describeNetworkError = (err) => {
  const msg = err?.message || String(err);
  const cause = err?.cause;
  const causeCode = cause?.code ? ` (${cause.code})` : "";
  const causeMsg = cause?.message ? `: ${cause.message}` : "";
  return `${msg}${causeCode}${causeMsg}`.trim();
};

const base64FromArrayBuffer = (buffer) => {
  return Buffer.from(buffer).toString("base64");
};

const describeToken = (token) => {
  if (!isNonEmptyString(token)) {
    return { present: false };
  }
  const length = token.length;
  const preview = `${token.slice(0, 6)}...${token.slice(-4)}`;
  const isJwt = token.split(".").length >= 3;
  return { present: true, length, preview, isJwt };
};

const decodeJwtClaims = (token) => {
  if (!isNonEmptyString(token)) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    const data = JSON.parse(json);
    return {
      aud: data?.aud,
      scp: data?.scp,
      iss: data?.iss,
      tid: data?.tid,
      appid: data?.appid,
      exp: data?.exp,
    };
  } catch {
    return null;
  }
};

const logTokenClaims = (context, token) => {
  const claims = decodeJwtClaims(token);
  if (!claims) return;
  console.warn(`[OneDrive] ${context} token claims`, claims);
};

const logTokenInfo = (context, token, res) => {
  console.warn(`[OneDrive] ${context} token info`, describeToken(token));
  logTokenClaims(context, token);
  const authHeader = res?.headers?.get?.("www-authenticate");
  if (authHeader) {
    console.warn(`[OneDrive] ${context} www-authenticate`, authHeader);
  }
  const requestId = res?.headers?.get?.("request-id");
  if (requestId) {
    console.warn(`[OneDrive] ${context} request-id`, requestId);
  }
};

const validateGraphToken = async (fetchImpl, accessToken, context) => {
  try {
    const res = await fetchImpl(`${ONEDRIVE_GRAPH_API}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) {
      console.info(`[OneDrive] ${context} token validation ok`);
      return;
    }
    const text = await res.text();
    logTokenInfo(`${context} token validation ${res.status}`, accessToken, res);
    console.warn(
      `[OneDrive] ${context} token validation failed: ${res.status} - ${text.slice(0, 200)}`
    );
  } catch (err) {
    console.warn(
      `[OneDrive] ${context} token validation network error: ${describeNetworkError(err)}`
    );
  }
};

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {import('electron')=} electronModule
 */
function registerHandlers(ipcMain, electronModule) {
  const fetchImpl =
    electronModule?.net?.fetch ? electronModule.net.fetch.bind(electronModule.net) : fetch;

  ipcMain.handle("netcatty:onedrive:oauth:exchange", async (_event, payload) => {
    const clientId = payload?.clientId;
    const code = payload?.code;
    const codeVerifier = payload?.codeVerifier;
    const redirectUri = payload?.redirectUri;
    const scope = isNonEmptyString(payload?.scope) ? payload.scope : DEFAULT_SCOPE;

    if (!isNonEmptyString(clientId)) throw new Error("Missing OneDrive clientId");
    if (!isNonEmptyString(code)) throw new Error("Missing authorization code");
    if (!isNonEmptyString(codeVerifier)) throw new Error("Missing codeVerifier");
    if (!isNonEmptyString(redirectUri)) throw new Error("Missing redirectUri");

    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      scope,
    });

    let res;
    try {
      res = await fetchImpl(ONEDRIVE_TOKEN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
    } catch (err) {
      throw new Error(
        `OneDrive token exchange network error. Check your network/VPN and whether Microsoft services are reachable. (${describeNetworkError(err)})`
      );
    }

    const text = await res.text();
    if (!res.ok) {
      const data = safeJsonParse(text) || { error: text };
      throw new Error(
        `OneDrive token exchange failed: ${data.error_description || data.error || res.status}`
      );
    }

    const data = safeJsonParse(text);
    if (!data) {
      throw new Error(`OneDrive token exchange invalid JSON: ${text.slice(0, 200)}`);
    }

    console.info("[OneDrive] token exchange result", {
      scope: data.scope,
      tokenType: data.token_type,
      hasRefreshToken: Boolean(data.refresh_token),
      expiresIn: data.expires_in,
    });
    await validateGraphToken(fetchImpl, data.access_token, "exchange");

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 0) * 1000,
      tokenType: data.token_type,
      scope: data.scope,
    };
  });

  ipcMain.handle("netcatty:onedrive:oauth:refresh", async (_event, payload) => {
    const clientId = payload?.clientId;
    const refreshToken = payload?.refreshToken;
    const scope = isNonEmptyString(payload?.scope) ? payload.scope : DEFAULT_SCOPE;

    if (!isNonEmptyString(clientId)) throw new Error("Missing OneDrive clientId");
    if (!isNonEmptyString(refreshToken)) throw new Error("Missing refreshToken");

    const body = new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope,
    });

    let res;
    try {
      res = await fetchImpl(ONEDRIVE_TOKEN_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
    } catch (err) {
      throw new Error(
        `OneDrive token refresh network error. Check your network/VPN and whether Microsoft services are reachable. (${describeNetworkError(err)})`
      );
    }

    const text = await res.text();
    if (!res.ok) {
      const data = safeJsonParse(text) || { error: text };
      throw new Error(
        `OneDrive token refresh failed: ${data.error_description || data.error || res.status}`
      );
    }

    const data = safeJsonParse(text);
    if (!data) {
      throw new Error(`OneDrive token refresh invalid JSON: ${text.slice(0, 200)}`);
    }

    console.info("[OneDrive] token refresh result", {
      scope: data.scope,
      tokenType: data.token_type,
      hasRefreshToken: Boolean(data.refresh_token),
      expiresIn: data.expires_in,
    });
    await validateGraphToken(fetchImpl, data.access_token, "refresh");

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + (data.expires_in || 0) * 1000,
      tokenType: data.token_type,
      scope: data.scope,
    };
  });

  ipcMain.handle("netcatty:onedrive:oauth:userinfo", async (_event, payload) => {
    const accessToken = payload?.accessToken;
    if (!isNonEmptyString(accessToken)) throw new Error("Missing accessToken");

    let res;
    try {
      res = await fetchImpl(`${ONEDRIVE_GRAPH_API}/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      throw new Error(
        `OneDrive userinfo network error. Check your network/VPN and whether Microsoft services are reachable. (${describeNetworkError(err)})`
      );
    }

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) {
        logTokenInfo("userinfo 401", accessToken, res);
      }
      throw new Error(`OneDrive userinfo failed: ${res.status} - ${text.slice(0, 200)}`);
    }

    const user = safeJsonParse(text);
    if (!user) {
      throw new Error(`OneDrive userinfo invalid JSON: ${text.slice(0, 200)}`);
    }

    let avatarDataUrl;
    try {
      const photoRes = await fetchImpl(`${ONEDRIVE_GRAPH_API}/me/photo/$value`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (photoRes.ok) {
        const buffer = await photoRes.arrayBuffer();
        const contentType = photoRes.headers.get("content-type") || "image/jpeg";
        avatarDataUrl = `data:${contentType};base64,${base64FromArrayBuffer(buffer)}`;
      }
    } catch {
      // Ignore photo errors
    }

    return {
      id: user.id,
      email: user.mail || user.userPrincipalName,
      name: user.displayName,
      avatarDataUrl,
    };
  });

  ipcMain.handle("netcatty:onedrive:drive:findSyncFile", async (_event, payload) => {
    const accessToken = payload?.accessToken;
    const fileName = isNonEmptyString(payload?.fileName) ? payload.fileName : DEFAULT_SYNC_FILE_NAME;
    if (!isNonEmptyString(accessToken)) throw new Error("Missing accessToken");

    const url = `${ONEDRIVE_GRAPH_API}/me${APP_FOLDER_PATH}:/${encodeURIComponent(fileName)}`;
    const res = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401) {
      logTokenInfo("findSyncFile 401", accessToken, res);
    }
    if (res.status === 404) {
      return { fileId: null };
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OneDrive find sync file failed: ${res.status} - ${text.slice(0, 200)}`);
    }

    const item = await res.json();
    return { fileId: item?.id || null };
  });

  ipcMain.handle("netcatty:onedrive:drive:uploadSyncFile", async (_event, payload) => {
    const accessToken = payload?.accessToken;
    const fileName = isNonEmptyString(payload?.fileName) ? payload.fileName : DEFAULT_SYNC_FILE_NAME;
    const syncedFile = payload?.syncedFile;
    if (!isNonEmptyString(accessToken)) throw new Error("Missing accessToken");
    if (!syncedFile) throw new Error("Missing syncedFile");

    const url = `${ONEDRIVE_GRAPH_API}/me${APP_FOLDER_PATH}:/${encodeURIComponent(fileName)}:/content`;
    const res = await fetchImpl(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(syncedFile, null, 2),
    });

    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401) {
        logTokenInfo("uploadSyncFile 401", accessToken, res);
      }
      throw new Error(`OneDrive upload failed: ${res.status} - ${text.slice(0, 200)}`);
    }

    const item = safeJsonParse(text) || {};
    return { fileId: item.id || null };
  });

  ipcMain.handle("netcatty:onedrive:drive:downloadSyncFile", async (_event, payload) => {
    const accessToken = payload?.accessToken;
    const fileId = payload?.fileId;
    const fileName = isNonEmptyString(payload?.fileName) ? payload.fileName : DEFAULT_SYNC_FILE_NAME;
    if (!isNonEmptyString(accessToken)) throw new Error("Missing accessToken");

    const itemUrl = fileId
      ? `${ONEDRIVE_GRAPH_API}/me/drive/items/${fileId}`
      : `${ONEDRIVE_GRAPH_API}/me${APP_FOLDER_PATH}:/${encodeURIComponent(fileName)}`;

    const itemRes = await fetchImpl(itemUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (itemRes.status === 401) {
      logTokenInfo("downloadSyncFile item 401", accessToken, itemRes);
    }
    if (itemRes.status === 404) {
      return { syncedFile: null };
    }

    const itemText = await itemRes.text();
    if (!itemRes.ok) {
      throw new Error(`OneDrive download item failed: ${itemRes.status} - ${itemText.slice(0, 200)}`);
    }

    const item = safeJsonParse(itemText);
    if (!item) {
      throw new Error(`OneDrive download item invalid JSON: ${itemText.slice(0, 200)}`);
    }

    const downloadUrl = item["@microsoft.graph.downloadUrl"];
    if (!isNonEmptyString(downloadUrl)) {
      throw new Error("OneDrive download item missing @microsoft.graph.downloadUrl");
    }

    const downloadRes = await fetchImpl(downloadUrl);
    const downloadText = await downloadRes.text();
    if (!downloadRes.ok) {
      throw new Error(
        `OneDrive download content failed: ${downloadRes.status} - ${downloadText.slice(0, 200)}`
      );
    }

    const data = safeJsonParse(downloadText);
    if (!data) {
      throw new Error(`OneDrive download invalid JSON: ${downloadText.slice(0, 200)}`);
    }

    return { syncedFile: data };
  });

  ipcMain.handle("netcatty:onedrive:drive:deleteSyncFile", async (_event, payload) => {
    const accessToken = payload?.accessToken;
    const fileId = payload?.fileId;
    if (!isNonEmptyString(accessToken)) throw new Error("Missing accessToken");
    if (!isNonEmptyString(fileId)) throw new Error("Missing fileId");

    const url = `${ONEDRIVE_GRAPH_API}/me/drive/items/${fileId}`;
    const res = await fetchImpl(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401) {
      logTokenInfo("deleteSyncFile 401", accessToken, res);
    }
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`OneDrive delete failed: ${res.status} - ${text.slice(0, 200)}`);
    }

    return { ok: true };
  });
}

module.exports = {
  registerHandlers,
};
