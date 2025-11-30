/**
 * MCP Tool: set_token_dalive
 * Sets the da.live Bearer token for the current MCP session
 */

import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response-builder.js';
import { validateRequiredParams } from '../utils/validator.js';
import requestSchema from '../schemas/set-token-request.schema.json' assert { type: 'json' };

/**
 * Tool implementation
 * @param {Object} params - Tool parameters
 * @param {string} params.token - da.live Bearer token to set
 * @param {Object} context - MCP session context
 * @param {Function} context.setSessionToken - Function to update session token
 * @returns {Promise<Object>} MCP-formatted response
 */
export async function execute(params, context) {
  const startTime = Date.now();

  try {
    // Validate inputs
    validateRequiredParams(params, ['token']);

    const token = params.token.trim();

    // Basic validation
    if (token.length === 0) {
      throw createErrorResponse(
        ErrorCodes.INVALID_PARAMS,
        'Token cannot be empty',
        { field: 'token', reason: 'Token must be a non-empty string' }
      );
    }

    // Update session token if setSessionToken function is available
    if (context.setSessionToken) {
      context.setSessionToken(token);
    } else {
      throw createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Session token update not supported in this context',
        { hint: 'This tool must be called within an MCP session' }
      );
    }

    const duration = Date.now() - startTime;

    // Build response data
    const responseData = {
      success: true,
      message: 'da.live Bearer token set successfully for this session',
      tokenLength: token.length,
      timestamp: new Date().toISOString()
    };

    // Return JSON response
    return createSuccessResponse(responseData, {
      toolName: 'set_token_dalive',
      timing: duration,
      version: '1.0.0'
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    // If already an MCP error, rethrow with timing
    if (error.code && error.message) {
      error.data = { ...error.data, _timing: duration };
      throw error;
    }

    // Generic error
    throw createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to set token: ${error.message}`,
      { errorType: error.constructor.name, _timing: duration }
    );
  }
}

/**
 * Tool definition for MCP registration
 */
export const definition = {
  name: 'set_token_dalive',
  description: 'Set the da.live Bearer token for the current MCP session. This token will be used for all subsequent da.live API calls in this session. Priority: tool parameter > session token (set via this tool) > environment variable.',
  inputSchema: requestSchema
};
