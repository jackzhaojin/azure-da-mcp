import { app } from '@azure/functions';
import { randomUUID } from 'crypto';
import { getAllDefinitions, executeTool } from '../mcp/tools/index.js';
import * as Logger from '../modules/Logger.js';

/**
 * Azure HTTP Function: POST /api/mcp-streamable
 * MCP Server with manual JSON-RPC handling (no streaming)
 *
 * Compatible with n8n's "HTTP Streamable" transport.
 * Implements JSON-RPC 2.0 protocol manually to avoid Azure Functions module loading issues.
 */

// In-memory session storage
const sessions = new Map();

app.http('McpStreamable', {
  methods: ['POST'],
  route: 'mcp-streamable',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    try {
      // Parse JSON-RPC request
      const body = await request.text();
      let jsonRpcRequest;

      try {
        jsonRpcRequest = JSON.parse(body);
      } catch (parseError) {
        return {
          status: 400,
          jsonBody: {
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error: Invalid JSON'
            },
            id: null
          }
        };
      }

      // Validate JSON-RPC format
      if (jsonRpcRequest.jsonrpc !== '2.0') {
        return {
          status: 400,
          jsonBody: {
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'Invalid Request: jsonrpc must be "2.0"'
            },
            id: jsonRpcRequest.id
          }
        };
      }

      const method = jsonRpcRequest.method;
      const params = jsonRpcRequest.params || {};
      const id = jsonRpcRequest.id;

      // Extract Bearer token
      const authHeader = request.headers.get('authorization');
      let bearerToken = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        bearerToken = authHeader.substring(7);
      } else {
        bearerToken = process.env.DALIVE_BEARER_TOKEN || null;
      }

      // Extract session ID from header (try multiple variations)
      let sessionId = request.headers.get('x-mcp-session-id') ||
                     request.headers.get('mcp-session-id') ||
                     request.headers.get('session-id') ||
                     request.headers.get('x-session-id');

      // Log all headers to debug session ID passing
      const allHeaders = {};
      for (const [key, value] of request.headers.entries()) {
        allHeaders[key] = value;
      }

      Logger.info('MCP Streamable request received', {
        method,
        sessionId: sessionId || 'new',
        hasBearer: !!bearerToken,
        headers: allHeaders
      }, context);

      // Route to appropriate handler
      switch (method) {
        case 'initialize':
          return handleInitialize(params, id, bearerToken, context);

        case 'initialized':
        case 'notifications/initialized':
          // Notification - no response required
          Logger.info('MCP Streamable initialized notification received', {
            sessionId: sessionId || 'none'
          }, context);
          return {
            status: 200,
            body: ''
          };

        case 'tools/list':
          return handleToolsList(sessionId, id, context);

        case 'tools/call': {
          // Hack 2 (Claude.ai/Make.com workaround): accept `bearerToken` inside the
          // tool's arguments for clients that can't set the Authorization header.
          // Precedence: real Authorization header > arg-bearer > env fallback.
          // Strip it from arguments so the tool implementation never sees it.
          if (params.arguments && params.arguments.bearerToken) {
            if (!authHeader) {
              bearerToken = params.arguments.bearerToken;
            }
            delete params.arguments.bearerToken;
          }
          return await handleToolsCall(sessionId, params, id, bearerToken, context);
        }

        default:
          return {
            status: 400,
            jsonBody: {
              jsonrpc: '2.0',
              error: {
                code: -32601,
                message: `Method not found: ${method}`
              },
              id
            }
          };
      }

    } catch (error) {
      Logger.error('MCP Streamable error', {
        error: error.message,
        stack: error.stack
      }, context);

      return {
        status: 500,
        jsonBody: {
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: `Internal error: ${error.message}`
          },
          id: null
        }
      };
    }
  }
});

/**
 * Handle 'initialize' method
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
    initialized: true
  });

  Logger.info('MCP Streamable session created', {
    sessionId,
    protocolVersion: params.protocolVersion || '2025-03-26',
    clientName: params.clientInfo?.name,
    hasBearer: !!bearerToken
  }, context);

  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-MCP-Session-Id': sessionId
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
          name: 'azure-da-mcp-streamable',
          version: '1.0.0'
        }
      },
      id
    }
  };
}

/**
 * Handle 'tools/list' method
 */
function handleToolsList(sessionId, id, context) {
  // Session validation is optional for tools/list
  if (sessionId && !sessions.has(sessionId)) {
    return {
      status: 401,
      jsonBody: {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Invalid session: Session not found or expired'
        },
        id
      }
    };
  }

  const toolsList = getAllDefinitions();
  Logger.info('MCP Streamable tools list requested', {
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
 */
async function handleToolsCall(sessionId, params, id, bearerToken, context) {
  // Try to get session, but allow Bearer token fallback
  let session = null;
  if (sessionId && sessions.has(sessionId)) {
    session = sessions.get(sessionId);
  }

  // If no session but we have a bearer token, create a temporary session context
  if (!session && bearerToken) {
    Logger.info('MCP Streamable tool call without session, using Bearer token', {
      hasBearer: !!bearerToken
    }, context);
    session = {
      bearerToken,
      sessionId: 'temp-' + Date.now()
    };
  }

  // If still no session or bearer token, reject
  if (!session || !session.bearerToken) {
    return {
      status: 401,
      jsonBody: {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Invalid session: No session or Bearer token provided.'
        },
        id
      }
    };
  }

  // Validate tool call parameters
  if (!params.name) {
    return {
      status: 400,
      jsonBody: {
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Invalid params: tool name is required'
        },
        id
      }
    };
  }

  const toolName = params.name;
  const toolArguments = params.arguments || {};

  Logger.info('MCP Streamable tool call started', {
    sessionId,
    toolName,
    arguments: toolArguments
  }, context);

  // Create context for tool execution
  const toolContext = {
    bearerToken: session.bearerToken || bearerToken,
    sessionId: session.sessionId
  };

  try {
    // Execute tool through registry
    const result = await executeTool(toolName, toolArguments, toolContext);

    // Remove internal metadata
    delete result._meta;

    Logger.info('MCP Streamable tool call completed', {
      sessionId,
      toolName,
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
    // Tool returned error
    Logger.warn('MCP Streamable tool call failed', {
      sessionId,
      toolName,
      errorMessage: error.message
    }, context);

    return {
      status: 500,
      jsonBody: {
        jsonrpc: '2.0',
        error: {
          code: error.code || -32603,
          message: error.message || 'Tool execution failed'
        },
        id
      }
    };
  }
}

// Clean up old sessions periodically (every hour)
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
