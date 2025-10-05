import { randomUUID } from 'crypto';

// In-memory storage for orchestration logs
// Map<requestId, OrchestrationLog[]>
const logStore = new Map();

/**
 * Generate unique request ID for correlation
 * @returns {string} UUID v4 request ID
 */
export function generateRequestId() {
  return randomUUID();
}

/**
 * Log an orchestration phase with timing and data
 * @param {string} requestId - Unique request identifier
 * @param {string} phase - Phase name (request, dalive_fetch, llm_call, validation, dalive_update, response)
 * @param {Object} data - Phase-specific data
 * @param {number|null} duration - Phase duration in milliseconds
 * @param {string} status - Phase status ('success' or 'error')
 */
export function logPhase(requestId, phase, data, duration, status) {
  const logEntry = {
    requestId,
    phase,
    timestamp: new Date().toISOString(),
    duration,
    status,
    data
  };

  if (!logStore.has(requestId)) {
    logStore.set(requestId, []);
  }

  logStore.get(requestId).push(logEntry);
}

/**
 * Retrieve all logs for a specific request
 * @param {string} requestId - Request identifier
 * @returns {Array} Array of log entries for the request
 */
export function getLogs(requestId) {
  return logStore.get(requestId) || [];
}

/**
 * Clear all logs (used for testing)
 * @returns {void}
 */
export function clearLogs() {
  logStore.clear();
}
