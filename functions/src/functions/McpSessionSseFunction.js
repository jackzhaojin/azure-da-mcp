import { app } from '@azure/functions';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getAllDefinitions, executeTool } from '../mcp/tools/index.js';
import * as Logger from '../modules/Logger.js';

/**
 * Azure HTTP Function: GET/POST /api/mcp-sse
 * MCP Server with SSE (Server-Sent Events) transport
 *
 * Compatible with Make.com and other SSE-based MCP clients
 */

// In-memory session storage (shared with HTTP POST implementation)
const sessions = new Map();

// Session cleanup (24 hour lifetime)
setInterval(() => {
  const now = Date.now();
  const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

  for (const [sessionId, session] of sessions.entries()) {
    const sessionAge = now - new Date(session.createdAt).getTime();
    if (sessionAge > MAX_SESSION_AGE_MS) {
      sessions.delete(sessionId);
      console.log(`Session expired: ${sessionId}`);
    }
  }
}, 60 * 60 * 1000);

app.http('McpSessionSse', {
  methods: ['GET', 'POST'],
  route: 'mcp-sse',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      // Extract Bearer token from Authorization header or env fallback
      const authHeader = request.headers.get('authorization');
      let bearerToken = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        bearerToken = authHeader.substring(7);
      } else {
        bearerToken = process.env.DALIVE_BEARER_TOKEN || null;
      }

      Logger.info('MCP SSE request received', {
        method: request.method,
        hasBearer: !!bearerToken,
        headers: Object.fromEntries(request.headers.entries())
      }, context);

      // Create MCP Server instance with tools
      const server = new Server(
        {
          name: 'azure-da-mcp-sse',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Register tool handlers
      server.setRequestHandler('tools/list', async () => {
        const tools = getAllDefinitions();
        Logger.info('SSE: tools/list called', { toolsCount: tools.length }, context);
        return { tools };
      });

      server.setRequestHandler('tools/call', async (params, extra) => {
        const toolName = params.name;
        const toolArguments = params.arguments || {};

        Logger.info('SSE: tools/call started', {
          toolName,
          arguments: toolArguments,
          hasBearer: !!bearerToken
        }, context);

        // Get or create session context
        const sessionId = extra?.sessionId || 'default';
        let session = sessions.get(sessionId);

        if (!session) {
          session = {
            sessionId,
            bearerToken,
            createdAt: new Date().toISOString(),
            initialized: true
          };
          sessions.set(sessionId, session);
          Logger.info('SSE: Created new session', { sessionId }, context);
        }

        // Execute tool with context
        const toolContext = {
          bearerToken: session.bearerToken || bearerToken,
          sessionId: session.sessionId
        };

        try {
          const result = await executeTool(toolName, toolArguments, toolContext);

          // Remove internal metadata
          delete result._meta;

          Logger.info('SSE: tools/call completed', {
            toolName,
            success: true
          }, context);

          return result;
        } catch (error) {
          Logger.error('SSE: tools/call failed', {
            toolName,
            error: error.message
          }, context);
          throw error;
        }
      });

      // Create StreamableHTTP transport
      const transport = new StreamableHTTPServerTransport({
        sessionId: request.headers.get('mcp-session-id') || undefined
      });

      Logger.info('SSE: Connecting server to transport', {
        hasSessionId: !!request.headers.get('mcp-session-id')
      }, context);

      // Connect server to transport
      await server.connect(transport);

      // Handle the HTTP request through the transport
      // Convert Azure Functions request to StreamableHTTP format
      const url = new URL(request.url);
      const azureRequest = {
        method: request.method,
        url: url.pathname + url.search,
        headers: Object.fromEntries(request.headers.entries()),
        body: request.method === 'POST' ? await request.text() : undefined
      };

      Logger.info('SSE: Processing request through transport', {
        method: azureRequest.method,
        url: azureRequest.url
      }, context);

      // Handle request via transport
      const response = await transport.handleRequest(azureRequest);

      Logger.info('SSE: Transport returned response', {
        status: response.status,
        hasBody: !!response.body,
        headers: response.headers
      }, context);

      // Convert back to Azure Functions response format
      const azureResponse = {
        status: response.status,
        headers: response.headers || {},
        body: response.body
      };

      // For SSE streams, set proper content type
      if (response.status === 200 && request.method === 'GET') {
        azureResponse.headers['Content-Type'] = 'text/event-stream';
        azureResponse.headers['Cache-Control'] = 'no-cache';
        azureResponse.headers['Connection'] = 'keep-alive';
      }

      return azureResponse;

    } catch (error) {
      Logger.error('MCP SSE error', {
        error: error.message,
        stack: error.stack
      }, context);

      return {
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        },
        jsonBody: {
          error: 'Internal server error',
          message: error.message
        }
      };
    }
  }
});

export { app };
