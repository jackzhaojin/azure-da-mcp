#!/usr/bin/env node
/**
 * E2E Test: get_dalive_content MCP Tool
 * Tests the MCP server endpoint for fetching content from da.live
 *
 * This test uses REAL APIs:
 * - Local MCP server (http://localhost:7071/api/mcp)
 * - da.live Admin API (via Bearer token)
 *
 * Expected: FAILS initially until McpTools and McpSessionFunction are implemented
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
const TEST_PATH = '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';

console.log('🧪 E2E Test: get_dalive_content MCP Tool');
console.log(`   MCP Server: ${MCP_SERVER_URL}`);
console.log(`   Test Path: ${TEST_PATH}`);
console.log('');

async function testGetContentTool() {
  try {
    // Step 1: Initialize MCP session
    console.log('1️⃣  Initializing MCP session...');
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
            name: 'e2e-test',
            version: '1.0.0'
          }
        },
        id: 'init-1'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER_TOKEN}`
        }
      }
    );

    if (!initResponse.data.result) {
      throw new Error('Initialize failed: No result in response');
    }

    const sessionId = initResponse.headers['mcp-session-id'];
    console.log(`   ✅ Session initialized: ${sessionId || 'no session id'}`);
    console.log(`   Protocol version: ${initResponse.data.result.protocolVersion}`);
    console.log('');

    // Step 2: Send initialized notification
    console.log('2️⃣  Sending initialized notification...');
    await axios.post(
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
    console.log('   ✅ Initialized notification sent');
    console.log('');

    // Step 3: List available tools
    console.log('3️⃣  Listing available tools...');
    const listResponse = await axios.post(
      MCP_SERVER_URL,
      {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'list-1'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Mcp-Session-Id': sessionId || ''
        }
      }
    );

    const tools = listResponse.data.result?.tools || [];
    console.log(`   ✅ Found ${tools.length} tools`);
    tools.forEach(tool => {
      console.log(`      - ${tool.name}: ${tool.description}`);
    });

    const getContentTool = tools.find(t => t.name === 'get_dalive_content');
    if (!getContentTool) {
      throw new Error('get_dalive_content tool not found in tools list');
    }
    console.log('');

    // Step 4: Call get_dalive_content tool
    console.log('4️⃣  Calling get_dalive_content tool...');
    const startTime = Date.now();

    const callResponse = await axios.post(
      MCP_SERVER_URL,
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_dalive_content',
          arguments: {
            path: TEST_PATH
          }
        },
        id: 'call-1'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Mcp-Session-Id': sessionId || ''
        }
      }
    );

    const duration = Date.now() - startTime;

    // Validate response structure
    if (callResponse.data.error) {
      throw new Error(`Tool call failed: ${callResponse.data.error.message}`);
    }

    const result = callResponse.data.result;
    if (!result) {
      throw new Error('No result in tool call response');
    }

    // Validate MCP response structure (content array + structuredContent)
    if (!result.content || !Array.isArray(result.content)) {
      throw new Error('Missing content array in result');
    }
    if (!result.structuredContent) {
      throw new Error('Missing structuredContent in result');
    }

    const data = result.structuredContent;

    // Validate structured content fields per contract
    if (!data.htmlContent) {
      throw new Error('Missing htmlContent in structuredContent');
    }
    if (!data.lastModified) {
      throw new Error('Missing lastModified in structuredContent');
    }
    if (!data.path) {
      throw new Error('Missing path in structuredContent');
    }
    if (typeof data.contentLength !== 'number') {
      throw new Error('Missing or invalid contentLength in structuredContent');
    }

    console.log(`   ✅ Tool call successful!`);
    console.log(`   Path: ${data.path}`);
    console.log(`   HTML length: ${data.contentLength} bytes`);
    console.log(`   Last modified: ${data.lastModified}`);
    console.log(`   Content summary: ${result.content[0].text}`);
    console.log(`   Duration: ${duration}ms`);
    console.log('');

    // Verify HTML content is not empty
    if (data.htmlContent.length === 0) {
      throw new Error('HTML content is empty');
    }

    // Verify path matches
    if (data.path !== TEST_PATH) {
      throw new Error(`Path mismatch: expected ${TEST_PATH}, got ${data.path}`);
    }

    console.log('✅ get_dalive_content E2E test PASSED!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test FAILED:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('');
    console.error('Expected: This test SHOULD FAIL until T008 (McpTools) and T009 (McpSessionFunction) are implemented');
    process.exit(1);
  }
}

// Check prerequisites
if (!BEARER_TOKEN) {
  console.error('❌ DALIVE_BEARER_TOKEN not set in .env file');
  console.error('   This test requires a real da.live Bearer token');
  process.exit(1);
}

testGetContentTool();
