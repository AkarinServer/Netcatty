/**
 * Keyboard Interactive Handler - Shared state for keyboard-interactive authentication
 * This module provides a centralized storage for keyboard-interactive auth requests
 * used by SSH, SFTP, and Port Forwarding bridges.
 */

// Keyboard-interactive authentication pending requests
// Map of requestId -> { finishCallback, webContentsId, sessionId }
const keyboardInteractiveRequests = new Map();

/**
 * Generate a unique request ID for keyboard-interactive requests
 */
function generateRequestId(prefix = 'ki') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Store a keyboard-interactive request
 */
function storeRequest(requestId, finishCallback, webContentsId, sessionId) {
  keyboardInteractiveRequests.set(requestId, {
    finishCallback,
    webContentsId,
    sessionId,
  });
}

/**
 * Handle keyboard-interactive authentication response from renderer
 */
function handleResponse(_event, payload) {
  const { requestId, responses, cancelled } = payload;
  const pending = keyboardInteractiveRequests.get(requestId);
  
  if (!pending) {
    console.warn(`[KeyboardInteractive] No pending request for ${requestId}`);
    return { success: false, error: 'Request not found' };
  }
  
  keyboardInteractiveRequests.delete(requestId);
  
  if (cancelled) {
    console.log(`[KeyboardInteractive] Auth cancelled for ${requestId}`);
    pending.finishCallback([]); // Empty responses to cancel
  } else {
    console.log(`[KeyboardInteractive] Auth response received for ${requestId}`);
    pending.finishCallback(responses);
  }
  
  return { success: true };
}

/**
 * Get the requests map (for debugging/testing)
 */
function getRequests() {
  return keyboardInteractiveRequests;
}

/**
 * Register IPC handler for keyboard-interactive responses
 */
function registerHandler(ipcMain) {
  ipcMain.handle("netcatty:keyboard-interactive:respond", handleResponse);
}

module.exports = {
  generateRequestId,
  storeRequest,
  handleResponse,
  getRequests,
  registerHandler,
};
