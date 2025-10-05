/**
 * MCP Tools Module
 * Implements MCP tool functions: get_dalive_content and save_dalive_content
 *
 * These tools wrap the DaliveClient module and are registered with the MCP server.
 * The LLM calls these tools autonomously to fetch and save content.
 */

import * as DaliveClient from './DaliveClient.js';

/**
 * Tool: get_dalive_content
 * Fetches HTML content from da.live Admin API
 *
 * @param {Object} params - Tool parameters
 * @param {string} params.path - da.live content path (e.g., '/products/enterprise')
 * @param {Object} context - MCP session context
 * @param {string} context.bearerToken - da.live Bearer token from Authorization header
 * @returns {Promise<Object>} Tool result matching contract
 * @throws {Error} MCP-formatted error
 */
export async function get_dalive_content(params, context) {
  const startTime = Date.now();

  try {
    // Validate parameters
    if (!params || !params.path) {
      throw createMcpError(-32602, 'Invalid parameters: path is required', {
        field: 'path',
        reason: 'Missing required parameter'
      });
    }

    // Validate path format
    const path = params.path;
    if (!path.startsWith('/')) {
      throw createMcpError(-32602, 'Invalid parameters: path must start with /', {
        field: 'path',
        reason: 'Path must be absolute (start with /)',
        provided: path
      });
    }

    // Extract Bearer token from context
    if (!context || !context.bearerToken) {
      throw createMcpError(-32001, 'Authentication failed: Bearer token not found in session context', {
        hint: 'Ensure Bearer token is passed when initializing MCP session'
      });
    }

    const bearerToken = context.bearerToken;

    // Call DaliveClient to fetch content
    const content = await DaliveClient.getContent(path, bearerToken);

    const duration = Date.now() - startTime;

    const resultData = {
      htmlContent: content.html,
      lastModified: new Date().toISOString(),
      path: path,
      contentLength: content.html.length
    };

    // Return structured content with brief text summary for compatibility
    return {
      content: [
        {
          type: 'text',
          text: `Fetched ${resultData.contentLength} characters from ${path}`
        }
      ],
      structuredContent: resultData,
      _timing: duration // Internal timing for logging
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    // If already an MCP error, rethrow
    if (error.code && error.message) {
      error._timing = duration;
      throw error;
    }

    // Convert DaliveClient errors to MCP errors
    if (error.message.includes('401 Unauthorized')) {
      throw createMcpError(-32001, 'Authentication failed for da.live API', {
        daliveStatus: 401,
        hint: 'Check Bearer token validity',
        _timing: duration
      });
    }

    if (error.message.includes('404 Not Found')) {
      throw createMcpError(-32002, `Content not found at path: ${params.path}`, {
        path: params.path,
        daliveStatus: 404,
        hint: 'Verify path exists in da.live',
        _timing: duration
      });
    }

    if (error.message.includes('Network error') || error.message.includes('timeout')) {
      throw createMcpError(-32000, 'da.live API unavailable', {
        daliveStatus: 503,
        timeoutMs: 5000,
        retryable: true,
        _timing: duration
      });
    }

    // Generic server error
    throw createMcpError(-32603, `Failed to fetch content from da.live: ${error.message}`, {
      errorType: error.constructor.name,
      retryable: true,
      _timing: duration
    });
  }
}

/**
 * Tool: save_dalive_content
 * Saves edited HTML content to da.live Admin API
 *
 * @param {Object} params - Tool parameters
 * @param {string} params.path - da.live content path to update
 * @param {string} params.htmlContent - Edited HTML content to save
 * @param {Object} context - MCP session context
 * @param {string} context.bearerToken - da.live Bearer token from Authorization header
 * @returns {Promise<Object>} Tool result matching contract
 * @throws {Error} MCP-formatted error
 */
export async function save_dalive_content(params, context) {
  const startTime = Date.now();

  try {
    // Validate parameters
    if (!params || !params.path || !params.htmlContent) {
      const missingField = !params.path ? 'path' : 'htmlContent';
      throw createMcpError(-32602, `Invalid parameters: ${missingField} is required`, {
        field: missingField,
        reason: 'Missing required parameter'
      });
    }

    const path = params.path;
    const htmlContent = params.htmlContent;

    // Validate path format
    if (!path.startsWith('/')) {
      throw createMcpError(-32602, 'Invalid parameters: path must start with /', {
        field: 'path',
        reason: 'Path must be absolute (start with /)',
        provided: path
      });
    }

    // Validate HTML content not empty
    if (htmlContent.trim().length === 0) {
      throw createMcpError(-32602, 'Invalid parameters: htmlContent is empty', {
        field: 'htmlContent',
        reason: 'HTML content cannot be empty',
        validation: 'FAILED'
      });
    }

    // Basic XSS check (per contract - basic only)
    if (htmlContent.includes('<script src=')) {
      throw createMcpError(-32003, 'Content validation failed: External script detected', {
        validationType: 'XSS_CHECK',
        reason: 'External script detected in HTML',
        blocked: true
      });
    }

    // Size check (warn if >1MB, block if >10MB)
    const contentSizeBytes = Buffer.byteLength(htmlContent, 'utf8');
    if (contentSizeBytes > 10 * 1024 * 1024) {
      throw createMcpError(-32003, 'Content validation failed: Content too large', {
        validationType: 'SIZE_CHECK',
        reason: 'Content exceeds 10MB limit',
        contentSize: contentSizeBytes,
        maxSize: 10 * 1024 * 1024,
        blocked: true
      });
    }

    // Extract Bearer token from context
    if (!context || !context.bearerToken) {
      throw createMcpError(-32001, 'Authentication failed: Bearer token not found in session context', {
        hint: 'Ensure Bearer token is passed when initializing MCP session'
      });
    }

    const bearerToken = context.bearerToken;

    // Call DaliveClient to save content
    await DaliveClient.updateContent(path, htmlContent, bearerToken);

    const duration = Date.now() - startTime;

    const resultData = {
      success: true,
      path: path,
      timestamp: new Date().toISOString(),
      contentLength: contentSizeBytes
    };

    // Return structured content with brief text summary for compatibility
    return {
      content: [
        {
          type: 'text',
          text: `Saved ${contentSizeBytes} characters to ${path}`
        }
      ],
      structuredContent: resultData,
      _timing: duration // Internal timing for logging
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    // If already an MCP error, rethrow
    if (error.code && error.message) {
      error._timing = duration;
      throw error;
    }

    // Convert DaliveClient errors to MCP errors
    if (error.message.includes('401 Unauthorized')) {
      throw createMcpError(-32001, 'Authentication failed for da.live API', {
        daliveStatus: 401,
        hint: 'Check Bearer token has write permissions',
        _timing: duration
      });
    }

    if (error.message.includes('da.live API update failed')) {
      throw createMcpError(-32000, 'da.live API unavailable', {
        daliveStatus: 503,
        operation: 'POST /content',
        timeoutMs: 5000,
        retryable: true,
        _timing: duration
      });
    }

    // Generic server error
    throw createMcpError(-32603, `Failed to save content to da.live: ${error.message}`, {
      errorType: error.constructor.name,
      retryable: false,
      _timing: duration
    });
  }
}

/**
 * Helper: Create MCP-formatted error
 * @param {number} code - JSON-RPC error code
 * @param {string} message - Error message
 * @param {Object} data - Additional error data
 * @returns {Error} Error with MCP format
 */
function createMcpError(code, message, data) {
  const error = new Error(message);
  error.code = code;
  error.data = data;
  return error;
}

/**
 * Tool Definitions
 * Export tool schemas for MCP server registration
 */
export const TOOL_DEFINITIONS = [
  {
    name: 'get_dalive_content',
    description: 'Fetch HTML content from da.live Admin API',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: "da.live content path in format: /source/{owner}/{site}/{path/to/page.html} (e.g., '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html')"
        }
      },
      required: ['path']
    },
    outputSchema: {
      type: 'object',
      properties: {
        htmlContent: {
          type: 'string',
          description: 'Raw HTML content from da.live'
        },
        lastModified: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 timestamp of when content was last modified'
        },
        path: {
          type: 'string',
          description: 'da.live content path that was fetched'
        },
        contentLength: {
          type: 'integer',
          description: 'Length of HTML content in characters'
        }
      },
      required: ['htmlContent', 'lastModified', 'path', 'contentLength']
    }
  },
  {
    name: 'save_dalive_content',
    description: 'Save edited HTML content to da.live Admin API',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: "da.live content path in format: /source/{owner}/{site}/{path/to/page.html} (e.g., '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html')"
        },
        htmlContent: {
          type: 'string',
          description: 'Edited HTML content to save'
        }
      },
      required: ['path', 'htmlContent']
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
          description: 'Whether the save operation succeeded'
        },
        path: {
          type: 'string',
          description: 'da.live content path that was updated'
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 timestamp of when content was saved'
        },
        contentLength: {
          type: 'integer',
          description: 'Length of saved HTML content in characters'
        }
      },
      required: ['success', 'path', 'timestamp', 'contentLength']
    }
  }
];
