/**
 * MCP Parameter Validation Utilities
 */

import { ErrorCodes, createErrorResponse } from './response-builder.js';

/**
 * Validate required parameters are present
 * @param {Object} params - Parameters to validate
 * @param {Array<string>} required - List of required parameter names
 * @throws {Error} If validation fails
 */
export function validateRequiredParams(params, required) {
  if (!params) {
    throw createErrorResponse(
      ErrorCodes.INVALID_PARAMS,
      'Invalid parameters: params object is required',
      { required }
    );
  }

  const missing = required.filter(field => !params[field]);

  if (missing.length > 0) {
    throw createErrorResponse(
      ErrorCodes.INVALID_PARAMS,
      `Invalid parameters: missing required fields: ${missing.join(', ')}`,
      { missing, required }
    );
  }
}

/**
 * Validate da.live path format
 * @param {string} path - Path to validate
 * @throws {Error} If path is invalid
 */
export function validatePath(path) {
  if (!path || typeof path !== 'string') {
    throw createErrorResponse(
      ErrorCodes.INVALID_PARAMS,
      'Invalid parameters: path must be a string',
      { field: 'path', provided: typeof path }
    );
  }

  if (!path.startsWith('/')) {
    throw createErrorResponse(
      ErrorCodes.INVALID_PARAMS,
      'Invalid parameters: path must start with /',
      { field: 'path', reason: 'Path must be absolute', provided: path }
    );
  }

  if (!path.startsWith('/source/')) {
    throw createErrorResponse(
      ErrorCodes.INVALID_PARAMS,
      'Invalid parameters: path must start with /source/',
      { field: 'path', reason: 'da.live content paths start with /source/', provided: path }
    );
  }
}

/**
 * Validate HTML content
 * @param {string} htmlContent - HTML to validate
 * @throws {Error} If HTML is invalid
 */
export function validateHtmlContent(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    throw createErrorResponse(
      ErrorCodes.INVALID_PARAMS,
      'Invalid parameters: htmlContent must be a non-empty string',
      { field: 'htmlContent', provided: typeof htmlContent }
    );
  }

  const trimmed = htmlContent.trim();
  if (trimmed.length === 0) {
    throw createErrorResponse(
      ErrorCodes.INVALID_PARAMS,
      'Invalid parameters: htmlContent is empty',
      { field: 'htmlContent', validation: 'FAILED' }
    );
  }

  // Basic XSS check
  if (htmlContent.includes('<script src=')) {
    throw createErrorResponse(
      ErrorCodes.VALIDATION_FAILED,
      'Content validation failed: External script detected',
      { validationType: 'XSS_CHECK', blocked: true }
    );
  }

  // Size check (warn if >1MB, block if >10MB)
  const contentSizeBytes = Buffer.byteLength(htmlContent, 'utf8');
  if (contentSizeBytes > 10 * 1024 * 1024) {
    throw createErrorResponse(
      ErrorCodes.VALIDATION_FAILED,
      'Content validation failed: Content too large',
      {
        validationType: 'SIZE_CHECK',
        contentSize: contentSizeBytes,
        maxSize: 10 * 1024 * 1024,
        blocked: true
      }
    );
  }

  return contentSizeBytes;
}

/**
 * Validate Bearer token in context
 * @param {Object} context - MCP session context
 * @throws {Error} If token is missing
 */
export function validateBearerToken(context) {
  console.log('[DEBUG] validateBearerToken - context:', {
    hasContext: !!context,
    contextKeys: context ? Object.keys(context) : [],
    hasBearerToken: !!(context && context.bearerToken),
    bearerTokenType: context && context.bearerToken ? typeof context.bearerToken : 'undefined',
    bearerTokenLength: context && context.bearerToken ? context.bearerToken.length : 0,
    bearerTokenPreview: context && context.bearerToken ? `${context.bearerToken.substring(0, 10)}...` : 'none'
  });

  if (!context || !context.bearerToken) {
    throw createErrorResponse(
      ErrorCodes.AUTH_FAILED,
      'Authentication failed: Bearer token not found in session context',
      { 
        hint: 'Ensure Bearer token is passed when initializing MCP session',
        debugInfo: {
          hasContext: !!context,
          contextKeys: context ? Object.keys(context) : [],
          contextValues: context || 'no context'
        }
      }
    );
  }
}
