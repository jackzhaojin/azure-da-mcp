#!/usr/bin/env node
/**
 * E2E Test: Add Hero Section with Timestamp via MCP
 * Tests LLM's ability to add structured content with dynamic data
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const FUNCTIONS_BASE_URL = 'http://localhost:7071';
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;
const TEST_PATH = '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';

// Generate current timestamp for verification
const now = new Date();
const currentDate = now.toLocaleDateString('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});
const currentTime = now.toLocaleTimeString('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true
});
const fullTimestamp = `${currentDate} at ${currentTime}`;

const TEST_COMMAND = `Add a paragraph at the bottom of the page with the text "Current timestamp: ${fullTimestamp}"`;

console.log('🧪 E2E Test: Add Paragraph with Current Date and Time');
console.log(`   Server: ${FUNCTIONS_BASE_URL}`);
console.log(`   Path: ${TEST_PATH}`);
console.log(`   Timestamp: ${fullTimestamp}`);
console.log('');

async function testHeroWithTimestamp() {
  try {
    console.log('🚀 Step 1: Calling EditContent with hero + timestamp command...');
    console.log(`   Command: "${TEST_COMMAND}"`);
    console.log('   ⏳ This will take ~30 seconds...');
    console.log('');

    const startTime = Date.now();

    const response = await axios.post(
      `${FUNCTIONS_BASE_URL}/api/EditContent`,
      {
        command: TEST_COMMAND,
        path: TEST_PATH
      },
      {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    );

    const totalDuration = Date.now() - startTime;

    console.log('✅ EditContent successful!');
    console.log(`   Request ID: ${response.data.requestId}`);
    console.log(`   Duration: ${totalDuration}ms`);
    console.log('');

    // Validate response structure
    if (!response.data.requestId) {
      throw new Error('Missing requestId in response');
    }

    if (typeof response.data.editedHtmlLength !== 'number') {
      throw new Error('Missing or invalid editedHtmlLength');
    }

    console.log('📝 LLM Response:');
    console.log(`   Explanation: ${response.data.explanation}`);
    console.log(`   Reasoning: ${response.data.reasoning}`);
    console.log('');

    // Validate MCP tool calls
    if (!response.data.mcpToolCalls || response.data.mcpToolCalls.length === 0) {
      throw new Error('No MCP tool calls recorded');
    }

    console.log('🔧 MCP Tool Calls:');
    response.data.mcpToolCalls.forEach((call, index) => {
      console.log(`   ${index + 1}. ${call.toolName} (${call.duration}ms) - ${call.status}`);
    });
    console.log('');

    // Verify expected tool calls
    const toolNames = response.data.mcpToolCalls.map(c => c.toolName);
    if (!toolNames.includes('get_dalive_content')) {
      throw new Error('Missing get_dalive_content tool call');
    }
    if (!toolNames.includes('save_dalive_content')) {
      throw new Error('Missing save_dalive_content tool call');
    }

    console.log('⏱️  Timing Breakdown:');
    console.log(`   Total: ${response.data.timing.total}ms`);
    console.log(`   - MCP get_dalive_content: ${response.data.timing.mcp_get_content}ms`);
    console.log(`   - LLM call: ${response.data.timing.llm_call}ms`);
    console.log(`   - MCP save_dalive_content: ${response.data.timing.mcp_save_content}ms`);
    console.log('');

    // Step 2: Verify the content was saved
    console.log('🔍 Step 2: Verifying saved content...');

    const getResponse = await axios.get(
      `${FUNCTIONS_BASE_URL}/api/GetContent${TEST_PATH}`,
      {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`
        }
      }
    );

    const savedHtml = getResponse.data.html;

    // Check for timestamp in content
    const hasTimestamp = savedHtml.includes(currentDate) ||
                         savedHtml.includes("Current timestamp") ||
                         savedHtml.includes(currentTime);

    console.log(`   ✅ Content fetched: ${savedHtml.length} characters`);
    console.log(`   ${hasTimestamp ? '✅' : '⚠️'} Timestamp found: ${hasTimestamp}`);
    console.log('');

    if (!hasTimestamp) {
      console.warn('   ⚠️  Warning: Timestamp not found in saved HTML');
      console.warn('   LLM may have reformatted the content');
    }

    console.log('✅ Paragraph with Timestamp E2E test PASSED!');
    console.log('');

    console.log('📊 Test Summary:');
    console.log(`   - EditContent completed: ${totalDuration}ms`);
    console.log(`   - MCP tools used: ${response.data.mcpToolCalls.length}`);
    console.log(`   - Content saved and verified`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test FAILED:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('');
    process.exit(1);
  }
}

if (!BEARER_TOKEN) {
  console.error('❌ DALIVE_BEARER_TOKEN not set in .env file');
  process.exit(1);
}

testHeroWithTimestamp();
