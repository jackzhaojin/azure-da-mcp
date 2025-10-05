import { randomUUID } from 'crypto';

// In-memory storage for orchestration logs
// Map<requestId, OrchestrationLog[]>
const logStore = new Map();

// Log level configuration
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase() || 'INFO'];

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

/**
 * Internal logging function that works with both console and Azure Functions context
 * @param {string} level - Log level (DEBUG, INFO, WARN, ERROR)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional structured data
 * @param {Object} context - Azure Functions invocation context (optional)
 */
function log(level, message, metadata = {}, context = null) {
  const levelValue = LOG_LEVELS[level];

  // Skip if below current log level
  if (levelValue < CURRENT_LOG_LEVEL) {
    return;
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };

  // Azure Functions context logging (works with Application Insights)
  if (context?.log) {
    const logMessage = `[${level}] ${message} ${JSON.stringify(metadata)}`;

    switch (level) {
      case 'ERROR':
        context.log.error(logMessage);
        break;
      case 'WARN':
        context.log.warn(logMessage);
        break;
      case 'INFO':
        context.log.info(logMessage);
        break;
      case 'DEBUG':
        context.log.verbose(logMessage);
        break;
      default:
        context.log(logMessage);
    }
  } else {
    // Console logging for local development
    const logMessage = `[${logEntry.timestamp}] [${level}] ${message}`;

    switch (level) {
      case 'ERROR':
        console.error(logMessage, metadata);
        break;
      case 'WARN':
        console.warn(logMessage, metadata);
        break;
      case 'DEBUG':
        console.debug(logMessage, metadata);
        break;
      default:
        console.log(logMessage, metadata);
    }
  }
}

/**
 * Log debug message (most verbose)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional data
 * @param {Object} context - Azure Functions context (optional)
 */
export function debug(message, metadata = {}, context = null) {
  log('DEBUG', message, metadata, context);
}

/**
 * Log info message (normal operations)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional data
 * @param {Object} context - Azure Functions context (optional)
 */
export function info(message, metadata = {}, context = null) {
  log('INFO', message, metadata, context);
}

/**
 * Log warning message (potential issues)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional data
 * @param {Object} context - Azure Functions context (optional)
 */
export function warn(message, metadata = {}, context = null) {
  log('WARN', message, metadata, context);
}

/**
 * Log error message (errors and exceptions)
 * @param {string} message - Log message
 * @param {Object} metadata - Additional data (can include error object)
 * @param {Object} context - Azure Functions context (optional)
 */
export function error(message, metadata = {}, context = null) {
  log('ERROR', message, metadata, context);
}
