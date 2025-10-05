/**
 * MCP Tool: save_dalive_content
 * Saves edited HTML content to da.live Admin API
 */

import * as DaliveClient from '../../modules/DaliveClient.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response-builder.js';
import {
  validateRequiredParams,
  validatePath,
  validateHtmlContent,
  validateBearerToken
} from '../utils/validator.js';
import requestSchema from '../schemas/save-content-request.schema.json' assert { type: 'json' };

/**
 * Tool implementation
 * @param {Object} params - Tool parameters
 * @param {string} params.path - da.live content path to update
 * @param {string} params.htmlContent - Edited HTML content to save
 * @param {Object} context - MCP session context
 * @param {string} context.bearerToken - da.live Bearer token
 * @returns {Promise<Object>} MCP-formatted response
 */
export async function execute(params, context) {
  const startTime = Date.now();

  try {
    // Validate inputs
    validateRequiredParams(params, ['path', 'htmlContent']);
    validatePath(params.path);
    const contentSizeBytes = validateHtmlContent(params.htmlContent);
    validateBearerToken(context);

    // Save content to da.live
    const daliveResponse = await DaliveClient.updateContent(
      params.path,
      params.htmlContent,
      context.bearerToken
    );

    const duration = Date.now() - startTime;

    // Build response data
    const responseData = {
      success: true,
      path: params.path,
      timestamp: new Date().toISOString(),
      contentLength: contentSizeBytes,
      urls: {
        editUrl: daliveResponse?.source?.editUrl,
        contentUrl: daliveResponse?.source?.contentUrl,
        previewUrl: daliveResponse?.acm?.previewUrl,
        liveUrl: daliveResponse?.acm?.liveUrl
      }
    };

    // Return JSON response
    return createSuccessResponse(responseData, {
      toolName: 'save_dalive_content',
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

    // Convert DaliveClient errors to MCP errors
    if (error.message.includes('401 Unauthorized')) {
      throw createErrorResponse(
        ErrorCodes.AUTH_FAILED,
        'Authentication failed for da.live API',
        { daliveStatus: 401, hint: 'Check Bearer token has write permissions', _timing: duration }
      );
    }

    if (error.message.includes('da.live API update failed')) {
      throw createErrorResponse(
        ErrorCodes.SERVER_UNAVAILABLE,
        'da.live API unavailable',
        { daliveStatus: 503, operation: 'POST /content', retryable: true, _timing: duration }
      );
    }

    // Generic server error
    throw createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to save content to da.live: ${error.message}`,
      { errorType: error.constructor.name, retryable: false, _timing: duration }
    );
  }
}

/**
 * Tool definition for MCP registration
 */
export const definition = {
  name: 'save_dalive_content',
  description: 'Save edited HTML content to da.live Admin API',
  inputSchema: requestSchema
};
