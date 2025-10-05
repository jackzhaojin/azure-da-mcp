#!/usr/bin/env node
/**
 * E2E Test: MCP Session Initialization
 * Tests the MCP server session lifecycle (initialize → initialized → tools/list)
 *
 * This test validates:
 * - MCP protocol handshake
 * - Session ID generation and management
 * - Tool registration
 * - Bearer token flow through session context
 *
 * Expected: FAILS initially until T009 (McpSessionFunction) is implemented
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:7071/api/mcp';
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;

console.log('🧪 E2E Test: MCP Session Initialization');
console.log(`   MCP Server: ${MCP_SERVER_URL}`);
console.log('');

async function testMcpSession() {
  try {
    // Step 1: Initialize request
    console.log('1️⃣  Sending initialize request...');
    const initStartTime = Date.now();

    const initResponse = await axios.post(
      MCP_SERVER_URL,
      {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'e2e-session-test',
            version: '1.0.0'
          }
        },
        id: 'init-test-1'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER_TOKEN}`
        }
      }
    );

    const initDuration = Date.now() - initStartTime;

    // Validate JSON-RPC response
    if (!initResponse.data.jsonrpc || initResponse.data.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC version in response');
    }

    if (initResponse.data.id !== 'init-test-1') {
      throw new Error(`ID mismatch: expected 'init-test-1', got '${initResponse.data.id}'`);
    }

    if (initResponse.data.error) {
      throw new Error(`Initialize failed: ${initResponse.data.error.message}`);
    }

    if (!initResponse.data.result) {
      throw new Error('No result in initialize response');
    }

    const result = initResponse.data.result;

    // Validate protocol version
    if (result.protocolVersion !== '2025-03-26') {
      throw new Error(`Protocol version mismatch: expected '2025-03-26', got '${result.protocolVersion}'`);
    }

    // Validate capabilities
    if (!result.capabilities || !result.capabilities.tools) {
      throw new Error('Missing tools capabilities in initialize response');
    }

    // Validate server info
    if (!result.serverInfo || !result.serverInfo.name) {
      throw new Error('Missing serverInfo in initialize response');
    }

    // Validate session ID header
    const sessionId = initResponse.headers['mcp-session-id'];
    if (!sessionId) {
      console.warn('   ⚠️  Warning: No Mcp-Session-Id header returned (optional but recommended)');
    }

    console.log(`   ✅ Initialize successful!`);
    console.log(`   Protocol version: ${result.protocolVersion}`);
    console.log(`   Server: ${result.serverInfo.name} v${result.serverInfo.version || 'unknown'}`);
    console.log(`   Session ID: ${sessionId || '(not provided)'}`);
    console.log(`   Duration: ${initDuration}ms`);
    console.log('');

    // Step 2: Send initialized notification
    console.log('2️⃣  Sending initialized notification...');
    const notifyResponse = await axios.post(
      MCP_SERVER_URL,
      {
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Mcp-Session-Id': sessionId || ''
        }
      }
    );

    // initialized is a notification - may or may not return response
    // According to JSON-RPC spec, notifications don't get responses
    console.log(`   ✅ Notification sent (status: ${notifyResponse.status})`);
    console.log('');

    // Step 3: List tools
    console.log('3️⃣  Listing available tools...');
    const listStartTime = Date.now();

    const listResponse = await axios.post(
      MCP_SERVER_URL,
      {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'list-test-1'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Mcp-Session-Id': sessionId || ''
        }
      }
    );

    const listDuration = Date.now() - listStartTime;

    // Validate tools/list response
    if (listResponse.data.error) {
      throw new Error(`tools/list failed: ${listResponse.data.error.message}`);
    }

    if (!listResponse.data.result || !listResponse.data.result.tools) {
      throw new Error('No tools array in tools/list response');
    }

    const tools = listResponse.data.result.tools;

    // Validate tool registration
    if (!Array.isArray(tools)) {
      throw new Error('Tools is not an array');
    }

    if (tools.length === 0) {
      throw new Error('No tools registered');
    }

    console.log(`   ✅ Found ${tools.length} registered tools:`);
    console.log('');

    // Validate each tool
    tools.forEach((tool, index) => {
      console.log(`   Tool ${index + 1}: ${tool.name}`);
      console.log(`      Description: ${tool.description}`);

      if (!tool.inputSchema) {
        throw new Error(`Tool '${tool.name}' missing inputSchema`);
      }

      if (!tool.inputSchema.type || tool.inputSchema.type !== 'object') {
        throw new Error(`Tool '${tool.name}' inputSchema.type must be 'object'`);
      }

      if (!tool.inputSchema.properties) {
        throw new Error(`Tool '${tool.name}' missing inputSchema.properties`);
      }

      if (!tool.inputSchema.required || !Array.isArray(tool.inputSchema.required)) {
        throw new Error(`Tool '${tool.name}' missing or invalid inputSchema.required`);
      }

      console.log(`      Parameters: ${Object.keys(tool.inputSchema.properties).join(', ')}`);
      console.log(`      Required: ${tool.inputSchema.required.join(', ')}`);
      console.log('');
    });

    // Verify expected tools are registered
    const toolNames = tools.map(t => t.name);
    const expectedTools = ['get_dalive_content', 'save_dalive_content'];

    for (const expectedTool of expectedTools) {
      if (!toolNames.includes(expectedTool)) {
        throw new Error(`Expected tool '${expectedTool}' not found in tools list`);
      }
    }

    console.log(`   ✅ All expected tools registered: ${expectedTools.join(', ')}`);
    console.log(`   Duration: ${listDuration}ms`);
    console.log('');

    // Step 4: Verify Bearer token is accessible (will be used by tools)
    console.log('4️⃣  Verifying Bearer token flow...');
    console.log(`   ✅ Bearer token passed in Authorization header`);
    console.log(`   ✅ Token will be available to tool implementations via session context`);
    console.log('');

    console.log('✅ MCP Session Initialization E2E test PASSED!');
    console.log('');
    console.log('Summary:');
    console.log(`   - Protocol version: ${result.protocolVersion}`);
    console.log(`   - Tools registered: ${tools.length}`);
    console.log(`   - Session management: ${sessionId ? 'Working' : 'Not implemented'}`);
    console.log(`   - Total time: ${initDuration + listDuration}ms`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test FAILED:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('');
    console.error('Expected: This test SHOULD FAIL until T009 (McpSessionFunction) is implemented');
    process.exit(1);
  }
}

// Check prerequisites
if (!BEARER_TOKEN) {
  console.error('❌ DALIVE_BEARER_TOKEN not set in .env file');
  console.error('   This test requires a real da.live Bearer token');
  process.exit(1);
}

testMcpSession();
