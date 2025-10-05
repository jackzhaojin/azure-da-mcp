import { app } from '@azure/functions';
import { getContent } from '../modules/DaliveClient.js';
import { generateRequestId } from '../modules/Logger.js';

/**
 * Azure HTTP Function: GET /api/GetContent/{path}
 * Fetch page content from da.live
 */
app.http('GetContent', {
  methods: ['GET'],
  route: 'GetContent/{path}',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const requestId = generateRequestId();
    const startTime = Date.now();

    try {
      // Extract path from URL parameters
      const path = request.params.path;

      // Extract Bearer token from Authorization header
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
          status: 401,
          jsonBody: {
            requestId,
            error: 'Unauthorized',
            details: 'Missing or invalid Authorization header. Expected: Bearer <token>'
          }
        };
      }

      const bearerToken = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Validate path format (must start with /, lowercase, no special chars)
      const pathPattern = /^[a-z0-9\-\/]+$/;
      if (!path || !pathPattern.test(path)) {
        return {
          status: 400,
          jsonBody: {
            requestId,
            error: 'Invalid path format',
            details: 'Path must start with \'/\' and contain only lowercase letters, numbers, hyphens, and slashes'
          }
        };
      }

      // Prepend / to path if not already present
      const fullPath = path.startsWith('/') ? path : `/${path}`;

      // Fetch content from da.live
      const pageContent = await getContent(fullPath, bearerToken);

      const duration = Date.now() - startTime;

      // Return success response
      return {
        status: 200,
        jsonBody: {
          path: pageContent.path || fullPath,
          blocks: pageContent.blocks || [],
          metadata: pageContent.metadata || {},
          timestamp: new Date().toISOString(),
          duration
        }
      };
    } catch (error) {
      context.log('GetContent error:', error.message);

      // Handle specific error types
      if (error.message.includes('401')) {
        return {
          status: 401,
          jsonBody: {
            requestId,
            error: 'Unauthorized',
            details: 'Invalid or expired Bearer token'
          }
        };
      }

      if (error.message.includes('404')) {
        return {
          status: 404,
          jsonBody: {
            requestId,
            error: 'Page not found',
            details: error.message
          }
        };
      }

      if (error.message.includes('retry') || error.message.includes('unavailable')) {
        return {
          status: 503,
          jsonBody: {
            requestId,
            error: 'da.live API unavailable',
            retryAfter: 30
          }
        };
      }

      // Generic error
      return {
        status: 500,
        jsonBody: {
          requestId,
          error: 'Internal server error',
          details: error.message
        }
      };
    }
  }
});

export { app };
