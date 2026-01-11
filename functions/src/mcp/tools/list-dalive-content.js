/**
 * MCP Tool: list_dalive_content
 * Lists directory contents from da.live Admin API
 * Returns both files and folders. Files have ext and lastModified, folders do not.
 */

import * as DaliveClient from '../../modules/DaliveClient.js';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../utils/response-builder.js';
import { validateRequiredParams, validateBearerToken } from '../utils/validator.js';
import requestSchema from '../schemas/list-content-request.schema.json' assert { type: 'json' };

/**
 * Tool implementation
 * @param {Object} params - Tool parameters
 * @param {string} params.path - da.live directory path
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

    const path = params.path;

    // List directory contents from da.live
    const listing = await DaliveClient.listContent(path, context.bearerToken);

    // Build response data
    const responseData = {
      path: listing.path,
      items: listing.items,
      files: listing.files,
      folders: listing.folders,
      totalCount: listing.totalCount,
      fileCount: listing.fileCount,
      folderCount: listing.folderCount,
      summary: `Found ${listing.fileCount} files and ${listing.folderCount} folders in ${path}`
    };

    const duration = Date.now() - startTime;

    // Return JSON response
    return createSuccessResponse(responseData, {
      toolName: 'list_dalive_content',
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
        `Directory not found at path: ${params.path}`,
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
      `Failed to list directory from da.live: ${error.message}`,
      { errorType: error.constructor.name, retryable: true, _timing: duration }
    );
  }
}

/**
 * Tool definition for MCP registration
 */
export const definition = {
  name: 'list_dalive_content',
  description: 'List directory contents from da.live Admin API. Returns files (with ext and lastModified) and folders (without ext or lastModified). Use this to discover available content before fetching or to navigate the content structure.',
  inputSchema: requestSchema
};
