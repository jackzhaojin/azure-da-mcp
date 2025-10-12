#!/usr/bin/env node
/**
 * E2E Test for MCP Streamable Endpoint with get_dalive_content tool
 * Tests direct MCP protocol communication using JSON-RPC 2.0
 *
 * Run with: node tests/e2e/azure-mcp-streamable-get-test.js
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error('❌ No .env file found. Copy .env.example to .env and add your tokens.');
  process.exit(1);
}

const FUNCTIONS_BASE_URL = 'http://localhost:7071';
const MCP_STREAMABLE_URL = `${FUNCTIONS_BASE_URL}/api/mcp-streamable`;
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;
const TEST_PATH = process.env.E2E_TEST_PATH || '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';

// Get current date and time for unique content
const now = new Date();
const dateStr = now.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
const timeStr = now.toLocaleTimeString('en-US', {
  hour: '2-digit',
  minute: '2-digit'
});

console.log('🚀 Testing MCP Streamable Endpoint with get_dalive_content tool (Azure variant)');
console.log(`   Server: ${MCP_STREAMABLE_URL}`);
console.log(`   Test Path: ${TEST_PATH}`);
console.log(`   Date: ${dateStr}`);
console.log(`   Time: ${timeStr}`);
console.log('');

async function sendMcpRequest(method, params = {}, sessionId = null) {
  const requestId = randomUUID();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${BEARER_TOKEN}`
  };

  if (sessionId) {
    headers['X-MCP-Session-Id'] = sessionId;
  }

  const jsonRpcRequest = {
    jsonrpc: '2.0',
    method,
    params,
    id: requestId
  };

  console.log(`📤 Sending MCP request: ${method}`);
  console.log(`   Request ID: ${requestId}`);
  if (sessionId) {
    console.log(`   Session ID: ${sessionId}`);
  }

  const response = await axios.post(MCP_STREAMABLE_URL, jsonRpcRequest, {
    headers,
    timeout: 60000 // 60 second timeout
  });

  return {
    ...response.data,
    sessionId: response.headers['x-mcp-session-id'] || sessionId
  };
}

async function testMcpStreamableGet() {
  try {
    console.log('🔄 Step 1: Initialize MCP session...');
    
    // Step 1: Initialize MCP session
    const initResponse = await sendMcpRequest('initialize', {
      protocolVersion: '2025-03-26',
      clientInfo: {
        name: 'azure-mcp-streamable-test',
        version: '1.0.0'
      }
    });

    if (initResponse.error) {
      throw new Error(`Initialize failed: ${initResponse.error.message}`);
    }

    const sessionId = initResponse.sessionId;
    console.log(`✅ Session initialized: ${sessionId}`);
    console.log(`   Protocol version: ${initResponse.result.protocolVersion}`);
    console.log(`   Server: ${initResponse.result.serverInfo.name} v${initResponse.result.serverInfo.version}`);
    console.log('');

    // Step 2: Send initialized notification
    console.log('🔄 Step 2: Send initialized notification...');
    await sendMcpRequest('initialized', {}, sessionId);
    console.log('✅ Initialized notification sent');
    console.log('');

    // Step 3: List available tools
    console.log('🔄 Step 3: List available tools...');
    const toolsResponse = await sendMcpRequest('tools/list', {}, sessionId);

    if (toolsResponse.error) {
      throw new Error(`Tools list failed: ${toolsResponse.error.message}`);
    }

    console.log(`✅ Found ${toolsResponse.result.tools.length} tools:`);
    toolsResponse.result.tools.forEach(tool => {
      console.log(`   • ${tool.name}: ${tool.description}`);
    });
    console.log('');

    // Verify get_dalive_content tool is available
    const getContentTool = toolsResponse.result.tools.find(t => t.name === 'get_dalive_content');
    if (!getContentTool) {
      throw new Error('get_dalive_content tool not found');
    }

    // Step 4: Call get_dalive_content tool
    console.log('🔄 Step 4: Call get_dalive_content tool...');
    console.log(`   Path: ${TEST_PATH}`);
    console.log('   ⏳ This may take a few seconds...');

    const toolCallResponse = await sendMcpRequest('tools/call', {
      name: 'get_dalive_content',
      arguments: {
        path: TEST_PATH
      }
    }, sessionId);

    if (toolCallResponse.error) {
      throw new Error(`Tool call failed: ${toolCallResponse.error.message}`);
    }

    console.log('✅ Tool call completed successfully!');
    console.log('');

    // Parse the result - MCP tools return in Claude message format
    let result;
    if (toolCallResponse.result.content && toolCallResponse.result.content[0] && toolCallResponse.result.content[0].text) {
      // Parse the JSON string from the text field
      result = JSON.parse(toolCallResponse.result.content[0].text);
    } else {
      // Direct result format
      result = toolCallResponse.result;
    }

    console.log('📋 Tool Call Results:');
    console.log('─'.repeat(50));
    console.log(`Path: ${result.path}`);
    console.log(`Last Modified: ${result.lastModified}`);
    console.log(`Content Length: ${result.htmlContent.length} characters`);
    console.log('');

    // Show a preview of the HTML content
    if (result.htmlContent) {
      const preview = result.htmlContent.substring(0, 200);
      console.log('📄 HTML Content Preview:');
      console.log('─'.repeat(50));
      console.log(preview + (result.htmlContent.length > 200 ? '...' : ''));
      console.log('─'.repeat(50));
      console.log('');
    }

    // Verify the content looks like valid HTML
    if (!result.htmlContent.includes('<body') && !result.htmlContent.includes('<html') && !result.htmlContent.includes('<!DOCTYPE')) {
      console.log('⚠️  Warning: Content does not appear to be HTML');
    } else {
      console.log('✅ Content appears to be valid HTML');
    }

    console.log('');
    console.log('📊 Test Summary:');
    console.log(`   ✅ MCP session initialized: ${sessionId}`);
    console.log(`   ✅ Tools listed: ${toolsResponse.result.tools.length} available`);
    console.log(`   ✅ get_dalive_content tool called successfully`);
    console.log(`   ✅ Retrieved ${result.htmlContent.length} characters of content`);
    console.log('');
    console.log('🎉 All tests passed!');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

testMcpStreamableGet();