import { app } from '@azure/functions';
import { randomUUID } from 'crypto';
import { getAllDefinitions, executeTool } from '../mcp/tools/index.js';
import * as Logger from '../modules/Logger.js';

/**
 * Azure HTTP Function: POST /api/mcp
 * MCP Server Endpoint - Handles Model Context Protocol requests
 *
 * Supports MCP protocol methods:
 * - initialize: Capability negotiation
 * - initialized: Client confirmation (notification)
 * - tools/list: List available tools
 * - tools/call: Execute a specific tool
 */

// In-memory session storage (per-request lifecycle)
const sessions = new Map();

app.http('McpSession', {
  methods: ['POST'],
  route: 'mcp',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      // Parse JSON-RPC request
      const body = await request.text();
      let jsonRpcRequest;

      try {
        jsonRpcRequest = JSON.parse(body);
      } catch (parseError) {
        return createJsonRpcErrorResponse(null, -32700, 'Parse error: Invalid JSON');
      }

      // Validate JSON-RPC format
      if (jsonRpcRequest.jsonrpc !== '2.0') {
        return createJsonRpcErrorResponse(
          jsonRpcRequest.id,
          -32600,
          'Invalid Request: jsonrpc must be "2.0"'
        );
      }

      const method = jsonRpcRequest.method;
      const params = jsonRpcRequest.params || {};
      const id = jsonRpcRequest.id;

      // Extract Bearer token from Authorization header, fallback to environment variable
      const authHeader = request.headers.get('authorization');
      let bearerToken = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        bearerToken = authHeader.substring(7);
      } else {
        // Fallback to environment variable if no Bearer token in header
        bearerToken = process.env.DALIVE_BEARER_TOKEN || null;
      }

      // Extract or create session ID
      let sessionId = request.headers.get('mcp-session-id');

      Logger.info('MCP request received', {
        method,
        sessionId: sessionId || 'new',
        hasBearer: !!bearerToken,
        authHeader: authHeader ? `${authHeader.substring(0, 20)}...` : 'missing',
        bearerTokenLength: bearerToken ? bearerToken.length : 0,
        allHeaders: Object.fromEntries(request.headers.entries()),
        requestId: id
      }, context);

      // Route to appropriate handler
      switch (method) {
        case 'initialize':
          return handleInitialize(params, id, bearerToken, context);

        case 'initialized':
          // Notification - no response required per JSON-RPC spec
          handleInitialized(sessionId, context);
          return {
            status: 200,
            body: '' // Notifications don't return responses
          };

        case 'tools/list':
          return handleToolsList(sessionId, id, context);

        case 'tools/call':
          return await handleToolsCall(sessionId, params, id, context);

        default:
          return createJsonRpcErrorResponse(
            id,
            -32601,
            `Method not found: ${method}`
          );
      }

    } catch (error) {
      Logger.error('MCP session error', {
        error: error.message,
        stack: error.stack
      }, context);
      return createJsonRpcErrorResponse(
        null,
        -32603,
        `Internal error: ${error.message}`
      );
    }
  }
});

/**
 * Handle 'initialize' method
 * First MCP interaction - capability negotiation
 */
function handleInitialize(params, id, bearerToken, context) {
  const sessionId = randomUUID();

  // Store session with Bearer token
  sessions.set(sessionId, {
    sessionId,
    bearerToken,
    protocolVersion: params.protocolVersion || '2025-03-26',
    clientInfo: params.clientInfo,
    createdAt: new Date().toISOString(),
    initialized: false
  });

  Logger.info('MCP session created', {
    sessionId,
    protocolVersion: params.protocolVersion || '2025-03-26',
    clientName: params.clientInfo?.name,
    hasBearer: !!bearerToken
  }, context);

  // Return initialize response with session ID in header
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Mcp-Session-Id': sessionId
    },
    jsonBody: {
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: {
            listChanged: false
          }
        },
        serverInfo: {
          name: 'azure-da-mcp',
          version: '1.0.0'
        }
      },
      id
    }
  };
}

/**
 * Handle 'initialized' notification
 * Client confirms initialization complete
 */
function handleInitialized(sessionId, context) {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    session.initialized = true;
    sessions.set(sessionId, session);
    Logger.info('MCP session initialized', { sessionId }, context);
  } else {
    Logger.warn('Initialized notification for unknown session', { sessionId }, context);
  }
}

/**
 * Handle 'tools/list' method
 * Return available MCP tools
 */
function handleToolsList(sessionId, id, context) {
  // Validate session
  if (sessionId && !sessions.has(sessionId)) {
    return createJsonRpcErrorResponse(
      id,
      -32001,
      'Invalid session: Session not found or expired'
    );
  }

  const toolsList = getAllDefinitions();
  Logger.info('MCP tools list requested', {
    sessionId: sessionId || 'none',
    toolsCount: toolsList.length
  }, context);

  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    },
    jsonBody: {
      jsonrpc: '2.0',
      result: {
        tools: toolsList
      },
      id
    }
  };
}

/**
 * Handle 'tools/call' method
 * Execute a specific tool
 */
async function handleToolsCall(sessionId, params, id, context) {
  // Validate session
  if (!sessionId || !sessions.has(sessionId)) {
    return createJsonRpcErrorResponse(
      id,
      -32001,
      'Invalid session: Session not found. Call initialize first.'
    );
  }

  const session = sessions.get(sessionId);

  // Validate session is initialized
  // NOTE: Commented out for MCP Inspector compatibility
  // MCP Inspector doesn't send 'initialized' notification in HTTP mode
  // if (!session.initialized) {
  //   return createJsonRpcErrorResponse(
  //     id,
  //     -32002,
  //     'Session not initialized: Send initialized notification first'
  //   );
  // }

  // Validate tool call parameters
  if (!params.name) {
    return createJsonRpcErrorResponse(
      id,
      -32602,
      'Invalid params: tool name is required'
    );
  }

  const toolName = params.name;
  const toolArguments = params.arguments || {};

  Logger.info('MCP tool call started', {
    sessionId,
    toolName,
    arguments: toolArguments,
    sessionHasBearer: !!session.bearerToken,
    sessionBearerLength: session.bearerToken ? session.bearerToken.length : 0
  }, context);

  // Create context for tool execution
  const toolContext = {
    bearerToken: session.bearerToken,
    sessionId: session.sessionId,
    setSessionToken: (newToken) => {
      session.bearerToken = newToken;
      sessions.set(sessionId, session);
      Logger.info('Session token updated', {
        sessionId,
        newTokenLength: newToken.length
      }, context);
    }
  };

  try {
    // Execute tool through registry
    const result = await executeTool(toolName, toolArguments, toolContext);

    // Extract and remove internal metadata
    const timing = result._meta?.timing;
    delete result._meta;

    Logger.info('MCP tool call completed', {
      sessionId,
      toolName,
      timing: timing ? `${timing}ms` : 'unknown',
      success: true
    }, context);

    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      jsonBody: {
        jsonrpc: '2.0',
        result,
        id
      }
    };

  } catch (error) {
    // Tool returned MCP-formatted error
    if (error.code && error.message) {
      const timing = error.data?._timing;
      Logger.warn('MCP tool call failed', {
        sessionId,
        toolName,
        timing: timing ? `${timing}ms` : 'unknown',
        errorCode: error.code,
        errorMessage: error.message
      }, context);

      return createJsonRpcErrorResponse(
        id,
        error.code,
        error.message,
        error.data
      );
    }

    // Unexpected error
    Logger.error('MCP tool call unexpected error', {
      sessionId,
      toolName,
      error: error.message,
      stack: error.stack
    }, context);
    return createJsonRpcErrorResponse(
      id,
      -32603,
      `Tool execution failed: ${error.message}`
    );
  }
}

/**
 * Helper: Create JSON-RPC error response
 */
function createJsonRpcErrorResponse(id, code, message, data = null) {
  const errorBody = {
    jsonrpc: '2.0',
    error: {
      code,
      message
    },
    id
  };

  if (data) {
    errorBody.error.data = data;
  }

  return {
    status: code === -32001 ? 401 : (code < -32000 ? 400 : 500),
    headers: {
      'Content-Type': 'application/json'
    },
    jsonBody: errorBody
  };
}

// Clean up old sessions periodically (every hour)
// Sessions for Claude Desktop should be long-lived (24 hours)
setInterval(() => {
  const now = Date.now();
  const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  for (const [sessionId, session] of sessions.entries()) {
    const sessionAge = now - new Date(session.createdAt).getTime();
    if (sessionAge > MAX_SESSION_AGE_MS) {
      sessions.delete(sessionId);
      console.log(`Session expired: ${sessionId}`);
    }
  }
}, 60 * 60 * 1000); // Run cleanup every hour

export { app };
