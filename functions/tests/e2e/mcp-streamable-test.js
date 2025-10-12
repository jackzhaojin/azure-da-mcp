/**
 * Test: MCP Streamable HTTP Transport (JSON mode, no SSE)
 * Tests the /api/mcp-streamable endpoint with n8n-compatible transport
 */

import axios from 'axios';

const BASE_URL = process.env.MCP_SERVER_URL || 'http://localhost:7071';
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;

console.log('Testing MCP Streamable endpoint...\n');

async function testInitialize() {
  console.log('1. Testing initialize...');

  const response = await axios.post(`${BASE_URL}/api/mcp-streamable`, {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    },
    id: '1'
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`
    }
  });

  console.log('   Status:', response.status);
  console.log('   Session ID:', response.headers['x-mcp-session-id']);
  console.log('   Result:', JSON.stringify(response.data, null, 2));

  return response.headers['x-mcp-session-id'];
}

async function testToolsList(sessionId) {
  console.log('\n2. Testing tools/list...');

  const response = await axios.post(`${BASE_URL}/api/mcp-streamable`, {
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: '2'
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'X-MCP-Session-Id': sessionId
    }
  });

  console.log('   Status:', response.status);
  console.log('   Tools:', response.data.result.tools.map(t => t.name).join(', '));
}

async function testToolCall(sessionId) {
  console.log('\n3. Testing tools/call (get_dalive_content)...');

  const response = await axios.post(`${BASE_URL}/api/mcp-streamable`, {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'get_dalive_content',
      arguments: {
        path: '/source/adobe/tests/test'
      }
    },
    id: '3'
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'X-MCP-Session-Id': sessionId
    }
  });

  console.log('   Status:', response.status);
  console.log('   Content length:', response.data.result?.content?.[0]?.text?.length || 0);
  console.log('   Success!');
}

async function runTest() {
  try {
    // Step 1: Initialize
    const sessionId = await testInitialize();

    // Step 2: List tools
    await testToolsList(sessionId);

    // Step 3: Call tool
    await testToolCall(sessionId);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

runTest();
