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

// Store active transports per session
const activeTransports = new Map();

// Session cleanup (24 hour lifetime)
setInterval(() => {
  const now = Date.now();
  const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

  for (const [sessionId, session] of sessions.entries()) {
    const sessionAge = now - new Date(session.createdAt).getTime();
    if (sessionAge > MAX_SESSION_AGE_MS) {
      sessions.delete(sessionId);
      activeTransports.delete(sessionId);
      console.log(`Session expired: ${sessionId}`);
    }
  }
}, 60 * 60 * 1000);

// Create MCP Server instance ONCE (not per-request)
// This is initialized at module load time
const mcpServer = new Server(
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

// Register tool handlers ONCE at module level
mcpServer.setRequestHandler('tools/list', async () => {
  const tools = getAllDefinitions();
  return { tools };
});

mcpServer.setRequestHandler('tools/call', async (params) => {
  const toolName = params.name;
  const toolArguments = params.arguments || {};

  // Get Bearer token from the current context (passed via closure)
  const bearerToken = currentRequestContext.bearerToken;

  // Get or create session
  const sessionId = currentRequestContext.sessionId || 'default';
  let session = sessions.get(sessionId);

  if (!session) {
    session = {
      sessionId,
      bearerToken,
      createdAt: new Date().toISOString(),
      initialized: true
    };
    sessions.set(sessionId, session);
  }

  // Execute tool with context
  const toolContext = {
    bearerToken: session.bearerToken || bearerToken,
    sessionId: session.sessionId
  };

  const result = await executeTool(toolName, toolArguments, toolContext);
  delete result._meta;
  return result;
});

// Store current request context (Bearer token, session ID) for tool handlers
let currentRequestContext = {};

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

      const sessionId = request.headers.get('mcp-session-id') || undefined;

      Logger.info('MCP SSE request received', {
        method: request.method,
        hasBearer: !!bearerToken,
        sessionId: sessionId || 'none',
        headers: Object.fromEntries(request.headers.entries())
      }, context);

      // Set current request context for tool handlers to access
      currentRequestContext = {
        bearerToken,
        sessionId,
        context
      };

      // Get or create transport for this session
      let transport;
      const transportKey = sessionId || 'default';

      if (activeTransports.has(transportKey)) {
        transport = activeTransports.get(transportKey);
        Logger.info('SSE: Reusing existing transport', {
          sessionId: transportKey,
          method: request.method
        }, context);
      } else {
        // Create new transport and connect server to it
        transport = new StreamableHTTPServerTransport({
          sessionId
        });

        Logger.info('SSE: Creating new transport and connecting server', {
          sessionId: transportKey,
          method: request.method
        }, context);

        // Connect server to transport (only once per session)
        await mcpServer.connect(transport);

        // Store transport for reuse
        activeTransports.set(transportKey, transport);
      }

      // Handle the HTTP request through the transport
      // Convert Azure Functions request to StreamableHTTP format
      const url = new URL(request.url);

      // Debug: Log original request details
      Logger.info('SSE: Azure Functions request details', {
        method: request.method,
        methodType: typeof request.method,
        url: request.url,
        hasUrl: !!request.url,
        headers: Object.fromEntries(request.headers.entries())
      }, context);

      const azureRequest = {
        method: request.method,
        url: url.pathname + url.search,
        headers: Object.fromEntries(request.headers.entries()),
        body: request.method === 'POST' ? await request.text() : undefined
      };

      Logger.info('SSE: Converted request for transport', {
        method: azureRequest.method,
        url: azureRequest.url,
        hasBody: !!azureRequest.body,
        bodyType: typeof azureRequest.body,
        requestObject: JSON.stringify(azureRequest, null, 2)
      }, context);

      // Handle request via transport
      let response;
      try {
        Logger.info('SSE: About to call transport.handleRequest', {
          transportType: transport.constructor.name,
          hasTransport: !!transport,
          hasHandleRequest: typeof transport.handleRequest === 'function'
        }, context);

        response = await transport.handleRequest(azureRequest);

        Logger.info('SSE: Transport returned response', {
          status: response.status,
          hasBody: !!response.body,
          headers: response.headers
        }, context);
      } catch (transportError) {
        Logger.error('SSE: Transport handleRequest failed', {
          error: transportError.message,
          stack: transportError.stack,
          errorType: transportError.constructor.name,
          azureRequestDetails: {
            method: azureRequest.method,
            url: azureRequest.url,
            hasBody: !!azureRequest.body
          }
        }, context);
        throw transportError;
      }

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
