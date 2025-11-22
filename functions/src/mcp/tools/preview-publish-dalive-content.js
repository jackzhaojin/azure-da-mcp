/**
 * MCP Tool: preview_publish_dalive_content
 * Triggers preview publish on admin.hlx.page
 */

import * as DaliveClient from '../../modules/DaliveClient.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response-builder.js';
import { validateRequiredParams, validatePath, validateBearerToken } from '../utils/validator.js';
import { normalizePath } from '../../modules/PathNormalizer.js';
import requestSchema from '../schemas/preview-publish-dalive-content-request.schema.json' assert { type: 'json' };

/**
 * Tool implementation
 * @param {Object} params - Tool parameters
 * @param {string} params.path - da.live content path
 * @param {string} [params.branch] - Git branch (defaults to 'main')
 * @param {Object} context - MCP session context
 * @param {string} context.bearerToken - da.live Bearer token
 * @returns {Promise<Object>} MCP-formatted response
 */
export async function execute(params, context) {
  const startTime = Date.now();

  try {
    // Validate inputs
    validateRequiredParams(params, ['path']);
    validateBearerToken(context);

    // Normalize path (accepts multiple URL formats)
    const normalizedPath = normalizePath(params.path);
    validatePath(normalizedPath);

    // Use branch from params or default to 'main'
    const branch = params.branch || 'main';

    // Trigger preview publish
    const previewResult = await DaliveClient.previewPublish(
      normalizedPath,
      context.bearerToken,
      branch
    );

    const duration = Date.now() - startTime;

    // Build response data
    const responseData = {
      success: true,
      previewUrl: previewResult.previewUrl,
      status: previewResult.status,
      message: previewResult.message,
      path: normalizedPath,
      originalPath: params.path,
      branch,
      org: previewResult.org,
      site: previewResult.site,
      timestamp: new Date().toISOString()
    };

    // Return JSON response
    return createSuccessResponse(responseData, {
      toolName: 'preview_publish_dalive_content',
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
        'Authentication failed for admin.hlx.page preview',
        { hlxStatus: 401, hint: 'Check Bearer token validity', _timing: duration }
      );
    }

    if (error.message.includes('404 Not Found')) {
      throw createErrorResponse(
        ErrorCodes.RESOURCE_NOT_FOUND,
        `Content not found or cannot be previewed at path: ${params.path}`,
        { path: params.path, hlxStatus: 404, _timing: duration }
      );
    }

    if (error.message.includes('Network error') || error.message.includes('timeout')) {
      throw createErrorResponse(
        ErrorCodes.SERVER_UNAVAILABLE,
        'admin.hlx.page preview unavailable',
        { hlxStatus: 503, retryable: true, _timing: duration }
      );
    }

    // Generic server error
    throw createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      `Failed to trigger preview publish: ${error.message}`,
      { errorType: error.constructor.name, retryable: true, _timing: duration }
    );
  }
}

/**
 * Tool definition for MCP registration
 */
export const definition = {
  name: 'preview_publish_dalive_content',
  description: 'Trigger preview publish on admin.hlx.page for a da.live content path',
  inputSchema: requestSchema
};
