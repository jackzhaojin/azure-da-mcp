/**
 * MCP Response Builder
 * Utilities for building standardized MCP tool responses
 */

/**
 * Create a successful MCP tool response with JSON data
 * @param {Object} data - Response data (will be JSON stringified)
 * @param {Object} meta - Optional metadata (timing, etc.)
 * @returns {Object} MCP-formatted response
 */
export function createSuccessResponse(data, meta = {}) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2)
      }
    ],
    _meta: meta
  };
}

/**
 * Create an error MCP tool response
 * @param {number} code - JSON-RPC error code
 * @param {string} message - Error message
 * @param {Object} data - Additional error data
 * @returns {Error} MCP-formatted error
 */
export function createErrorResponse(code, message, data = {}) {
  const error = new Error(message);
  error.code = code;
  error.data = data;
  return error;
}

/**
 * Wrap raw data in MCP response format with text summary
 * @param {Object} data - Structured data to return
 * @param {string} summary - Human-readable summary
 * @param {Object} meta - Optional metadata
 * @returns {Object} MCP response with both text and structured data
 */
export function createHybridResponse(data, summary, meta = {}) {
  return {
    content: [
      {
        type: 'text',
        text: summary
      }
    ],
    ...data, // Spread data at root level for backward compatibility
    _meta: meta
  };
}

/**
 * Standard MCP error codes
 */
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  AUTH_FAILED: -32001,
  RESOURCE_NOT_FOUND: -32002,
  VALIDATION_FAILED: -32003,
  SERVER_UNAVAILABLE: -32000
};
