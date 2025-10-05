#!/usr/bin/env node
/**
 * E2E Test: save_dalive_content MCP Tool
 * Tests the MCP server endpoint for saving content to da.live
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

console.log('🧪 E2E Test: save_dalive_content MCP Tool');
console.log(`   MCP Server: ${MCP_SERVER_URL}`);
console.log(`   Test Path: ${TEST_PATH}`);
console.log('');

async function testSaveContentTool() {
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

    const sessionId = initResponse.headers['mcp-session-id'];
    console.log(`   ✅ Session initialized: ${sessionId || 'no session id'}`);
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

    // Step 3: First, fetch existing content using get_dalive_content
    console.log('3️⃣  Fetching existing content...');
    const getResponse = await axios.post(
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
        id: 'get-1'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Mcp-Session-Id': sessionId || ''
        }
      }
    );

    if (getResponse.data.error) {
      throw new Error(`Failed to fetch content: ${getResponse.data.error.message}`);
    }

    const originalHtml = getResponse.data.result.structuredContent.htmlContent;
    console.log(`   ✅ Fetched ${originalHtml.length} bytes of HTML`);
    console.log('');

    // Step 4: Modify the HTML slightly (append a comment)
    const timestamp = new Date().toISOString();
    const modifiedHtml = originalHtml.replace(
      '</body>',
      `<!-- MCP E2E Test: ${timestamp} -->\n</body>`
    );

    console.log('4️⃣  Calling save_dalive_content tool...');
    console.log(`   Modified HTML length: ${modifiedHtml.length} bytes`);
    const startTime = Date.now();

    const saveResponse = await axios.post(
      MCP_SERVER_URL,
      {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'save_dalive_content',
          arguments: {
            path: TEST_PATH,
            htmlContent: modifiedHtml
          }
        },
        id: 'save-1'
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
    if (saveResponse.data.error) {
      throw new Error(`Tool call failed: ${saveResponse.data.error.message}`);
    }

    const result = saveResponse.data.result;
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
    if (typeof data.success !== 'boolean') {
      throw new Error('Missing or invalid success field in structuredContent');
    }
    if (!data.success) {
      throw new Error('Save operation reported failure');
    }
    if (!data.path) {
      throw new Error('Missing path in structuredContent');
    }
    if (!data.timestamp) {
      throw new Error('Missing timestamp in structuredContent');
    }
    if (typeof data.contentLength !== 'number') {
      throw new Error('Missing or invalid contentLength in structuredContent');
    }

    console.log(`   ✅ Tool call successful!`);
    console.log(`   Success: ${data.success}`);
    console.log(`   Path: ${data.path}`);
    console.log(`   Content length: ${data.contentLength} bytes`);
    console.log(`   Timestamp: ${data.timestamp}`);
    console.log(`   Content summary: ${result.content[0].text}`);
    console.log(`   Duration: ${duration}ms`);
    console.log('');

    // Verify path matches
    if (data.path !== TEST_PATH) {
      throw new Error(`Path mismatch: expected ${TEST_PATH}, got ${data.path}`);
    }

    // Step 5: Verify the save by fetching again
    console.log('5️⃣  Verifying save by fetching content again...');
    const verifyResponse = await axios.post(
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
        id: 'verify-1'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Mcp-Session-Id': sessionId || ''
        }
      }
    );

    if (verifyResponse.data.error) {
      throw new Error(`Failed to verify: ${verifyResponse.data.error.message}`);
    }

    const verifiedHtml = verifyResponse.data.result.structuredContent.htmlContent;
    if (!verifiedHtml.includes(`<!-- MCP E2E Test: ${timestamp} -->`)) {
      throw new Error('Saved content does not include test marker - save may have failed');
    }

    console.log(`   ✅ Content verified - test marker found in saved HTML`);
    console.log('');

    console.log('✅ save_dalive_content E2E test PASSED!');
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

testSaveContentTool();
