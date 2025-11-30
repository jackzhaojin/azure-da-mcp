/**
 * MCP Tool: get_dalive_content
 * Fetches HTML content from da.live Admin API
 */

import * as DaliveClient from '../../modules/DaliveClient.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response-builder.js';
import { validateRequiredParams, validatePath, resolveBearerToken } from '../utils/validator.js';
import { normalizePath } from '../../modules/PathNormalizer.js';
import requestSchema from '../schemas/get-content-request.schema.json' assert { type: 'json' };

/**
 * Tool implementation
 * @param {Object} params - Tool parameters
 * @param {string} params.path - da.live content path
 * @param {string} [params.token] - Optional Bearer token (overrides session/env token)
 * @param {Object} context - MCP session context
 * @param {string} [context.bearerToken] - da.live Bearer token from session
 * @returns {Promise<Object>} MCP-formatted response
 */
export async function execute(params, context) {
  const startTime = Date.now();

  try {
    // Validate inputs
    validateRequiredParams(params, ['path']);

    // Resolve Bearer token with priority: params > context > env
    const bearerToken = resolveBearerToken(params, context);

    // Normalize path (accepts multiple URL formats)
    const normalizedPath = normalizePath(params.path);
    validatePath(normalizedPath);

    // Fetch content from da.live
    const content = await DaliveClient.getContent(normalizedPath, bearerToken);

    // Build response data
    const responseData = {
      htmlContent: content.html,
      lastModified: new Date().toISOString(),
      path: normalizedPath,
      originalPath: params.path,
      contentLength: content.html.length
    };

    const duration = Date.now() - startTime;

    // Return JSON response
    return createSuccessResponse(responseData, {
      toolName: 'get_dalive_content',
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
        { daliveStatus: 401, hint: 'Check Bearer token validity', _timing: duration }
      );
    }

    if (error.message.includes('404 Not Found')) {
      throw createErrorResponse(
        ErrorCodes.RESOURCE_NOT_FOUND,
        `Content not found at path: ${params.path}`,
        { path: params.path, daliveStatus: 404, _timing: duration }
      );
    }

    if (error.message.includes('Network error') || error.message.includes('timeout')) {
      throw createErrorResponse(
        ErrorCodes.SERVER_UNAVAILABLE,
        'da.live API unavailable',
        { daliveStatus: 503, retryable: true, _timing: duration }
      );
    }

    // Generic server error
    throw createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to fetch content from da.live: ${error.message}`,
      { errorType: error.constructor.name, retryable: true, _timing: duration }
    );
  }
}

/**
 * Tool definition for MCP registration
 */
export const definition = {
  name: 'get_dalive_content',
  description: 'Fetch HTML content from da.live Admin API',
  inputSchema: requestSchema
};
