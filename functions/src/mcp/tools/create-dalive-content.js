/**
 * MCP Tool: create_dalive_content
 * Creates new HTML content in da.live Admin API
 */

import * as DaliveClient from '../../modules/DaliveClient.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response-builder.js';
import {
  validateRequiredParams,
  validatePath,
  validateHtmlContent,
  resolveBearerToken
} from '../utils/validator.js';
import { normalizePath } from '../../modules/PathNormalizer.js';
import requestSchema from '../schemas/create-content-request.schema.json' assert { type: 'json' };

/**
 * Tool implementation
 * @param {Object} params - Tool parameters
 * @param {string} params.path - da.live content path for new page
 * @param {string} params.htmlContent - Initial HTML content (can be blank template)
 * @param {string} [params.token] - Optional Bearer token (overrides session/env token)
 * @param {Object} context - MCP session context
 * @param {string} [context.bearerToken] - da.live Bearer token from session
 * @returns {Promise<Object>} MCP-formatted response
 */
export async function execute(params, context) {
  const startTime = Date.now();

  try {
    // Validate inputs
    validateRequiredParams(params, ['path', 'htmlContent']);
    const contentSizeBytes = validateHtmlContent(params.htmlContent);

    // Resolve Bearer token with priority: params > context > env
    const bearerToken = resolveBearerToken(params, context);

    // Normalize path (accepts multiple URL formats)
    const normalizedPath = normalizePath(params.path);
    validatePath(normalizedPath);

    // Create content in da.live (uses same underlying POST as update)
    // The API doesn't distinguish between create and update operations
    const daliveResponse = await DaliveClient.updateContent(
      normalizedPath,
      params.htmlContent,
      bearerToken
    );

    const duration = Date.now() - startTime;

    // Build response data
    const responseData = {
      success: true,
      created: true,
      path: normalizedPath,
      originalPath: params.path,
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
      toolName: 'create_dalive_content',
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
        { daliveStatus: 503, operation: 'POST /content (create)', retryable: true, _timing: duration }
      );
    }

    // Generic server error
    throw createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to create content in da.live: ${error.message}`,
      { errorType: error.constructor.name, retryable: false, _timing: duration }
    );
  }
}

/**
 * Tool definition for MCP registration
 */
export const definition = {
  name: 'create_dalive_content',
  description: 'Create new HTML content in da.live Admin API (for new pages, not updates)',
  inputSchema: requestSchema
};
