#!/usr/bin/env node
/**
 * MCP stdio-to-HTTP bridge
 * Allows Claude Desktop to communicate with HTTP-based MCP server
 *
 * Claude Desktop expects:
 *   - stdin/stdout communication (stdio transport)
 *   - JSON-RPC 2.0 messages
 *
 * This bridge:
 *   1. Reads JSON-RPC from stdin
 *   2. Forwards to HTTP MCP server
 *   3. Writes responses to stdout
 */

import readline from 'readline';

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:7071/api/mcp';
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN || '';

let sessionId = null;
let pendingRequests = [];

// Create readline interface for stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// Log to stderr (stdout is reserved for JSON-RPC)
function log(message, ...args) {
  console.error(`[MCP Bridge] ${message}`, ...args);
}

// Send JSON-RPC message to HTTP server
async function forwardToHttp(jsonRpcMessage) {
  const headers = {
    'Content-Type': 'application/json'
  };

  // Include session ID if we have one
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  // Include Bearer token for authentication
  if (BEARER_TOKEN) {
    headers['Authorization'] = `Bearer ${BEARER_TOKEN}`;
  }

  try {
    log(`Sending ${jsonRpcMessage.method} to ${MCP_SERVER_URL}`);

    const response = await fetch(MCP_SERVER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(jsonRpcMessage)
    });

    // Extract session ID from initialize response
    if (jsonRpcMessage.method === 'initialize') {
      const newSessionId = response.headers.get('mcp-session-id');
      if (newSessionId) {
        sessionId = newSessionId;
        log(`Session ID: ${sessionId}`);
      }
    }

    const responseText = await response.text();

    // Handle empty responses (e.g., for 'initialized' notification)
    if (!responseText || responseText.trim() === '') {
      log(`Empty response for ${jsonRpcMessage.method} (status ${response.status})`);
      return null;
    }

    const jsonResponse = JSON.parse(responseText);
    log(`Received response for ${jsonRpcMessage.method}`);

    return jsonResponse;
  } catch (error) {
    log(`Error forwarding ${jsonRpcMessage.method}:`, error.message);

    // Return JSON-RPC error
    return {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: `HTTP forwarding failed: ${error.message}`
      },
      id: jsonRpcMessage.id
    };
  }
}

// Write response to stdout
function writeResponse(response) {
  if (response) {
    console.log(JSON.stringify(response));
  }
}

log('MCP stdio-to-HTTP bridge started');
log(`Target: ${MCP_SERVER_URL}`);
log(`Bearer token: ${BEARER_TOKEN ? 'present' : 'missing'}`);

// Process each line from stdin
rl.on('line', (line) => {
  const requestPromise = (async () => {
    try {
      const message = JSON.parse(line);
      log(`Received: ${message.method || 'unknown'}`);

      const response = await forwardToHttp(message);

      // Only write responses for requests (with id), not notifications
      // Notifications (like "notifications/initialized") don't expect a response
      if (message.id !== undefined) {
        writeResponse(response);
      }
    } catch (error) {
      log('Error processing line:', error.message);
      writeResponse({
        jsonrpc: '2.0',
        error: {
          code: -32700,
          message: `Parse error: ${error.message}`
        },
        id: null
      });
    }
  })();

  pendingRequests.push(requestPromise);
  requestPromise.finally(() => {
    const index = pendingRequests.indexOf(requestPromise);
    if (index > -1) {
      pendingRequests.splice(index, 1);
    }
  });
});

rl.on('close', async () => {
  log('stdin closed, waiting for pending requests');
  await Promise.all(pendingRequests);
  log('all requests complete, exiting');
  process.exit(0);
});

// Handle errors
process.on('uncaughtException', (error) => {
  log('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  log('Unhandled rejection:', error);
  process.exit(1);
});
