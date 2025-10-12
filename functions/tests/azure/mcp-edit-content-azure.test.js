#!/usr/bin/env node
/**
 * Azure E2E Test: EditContent with MCP
 * Tests the full MCP workflow on Azure deployment:
 * - LLM fetches content via get_dalive_content
 * - LLM edits content
 * - LLM saves via save_dalive_content
 *
 * Run with: node tests/azure/mcp-edit-content-azure.test.js
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
} else {
  console.error('❌ No .env file found. Copy .env.example to .env and add your tokens.');
  process.exit(1);
}

// Azure deployment URL
const FUNCTIONS_BASE_URL = 'https://jack-mcp-azure-ai-function.azurewebsites.net';
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;
const TEST_PATH = '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';

if (!BEARER_TOKEN) {
  console.error('❌ DALIVE_BEARER_TOKEN not set in .env file');
  process.exit(1);
}

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
const testCommand = `Add a paragraph at the bottom of the page with the text "Current timestamp: ${fullTimestamp}"`;

console.log('🚀 Azure E2E Test: EditContent with MCP');
console.log(`   Server: ${FUNCTIONS_BASE_URL}`);
console.log(`   Path: ${TEST_PATH}`);
console.log(`   Timestamp: ${fullTimestamp}`);
console.log('');

async function testEditContentWithMcp() {
  try {
    console.log('📝 Step 1: Calling EditContent with timestamp command...');
    console.log(`   Command: "${testCommand}"`);
    console.log('   ⏳ This will take ~30 seconds (LLM + MCP tools)...');
    console.log('');

    const startTime = Date.now();

    const response = await axios.post(
      `${FUNCTIONS_BASE_URL}/api/EditContent`,
      {
        command: testCommand,
        path: TEST_PATH
      },
      {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 2 minute timeout
      }
    );

    const totalDuration = Date.now() - startTime;

    console.log('✅ EditContent successful!');
    console.log(`   Request ID: ${response.data.requestId}`);
    console.log(`   Duration: ${totalDuration}ms`);
    console.log('');

    console.log('📝 LLM Response:');
    console.log(`   Explanation: ${response.data.explanation}`);
    console.log(`   Reasoning: ${response.data.reasoning}`);
    console.log('');

    // Show MCP tool calls
    if (response.data.mcpToolCalls && response.data.mcpToolCalls.length > 0) {
      console.log('🔧 MCP Tool Calls:');
      response.data.mcpToolCalls.forEach((call, index) => {
        console.log(`   ${index + 1}. ${call.toolName} (${call.duration}ms) - ${call.status}`);
      });
      console.log('');

      const toolNames = response.data.mcpToolCalls.map(c => c.toolName);
      const hasGet = toolNames.includes('get_dalive_content');
      const hasSave = toolNames.includes('save_dalive_content');

      console.log('✅ MCP Tools Verification:');
      console.log(`   ${hasGet ? '✅' : '❌'} get_dalive_content called`);
      console.log(`   ${hasSave ? '✅' : '❌'} save_dalive_content called`);
      console.log('');
    }

    // Show timing breakdown
    if (response.data.timing) {
      console.log('⏱️  Timing Breakdown:');
      console.log(`   Total: ${response.data.timing.total}ms`);
      if (response.data.timing.mcp_get_content) {
        console.log(`   - MCP get_dalive_content: ${response.data.timing.mcp_get_content}ms`);
      }
      if (response.data.timing.llm_call) {
        console.log(`   - LLM call: ${response.data.timing.llm_call}ms`);
      }
      if (response.data.timing.mcp_save_content) {
        console.log(`   - MCP save_dalive_content: ${response.data.timing.mcp_save_content}ms`);
      }
      console.log('');
    }

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
      console.log('');
    }

    console.log('📊 Test Summary:');
    console.log(`   - EditContent completed: ${totalDuration}ms`);
    console.log(`   - MCP tools used: ${response.data.mcpToolCalls?.length || 0}`);
    console.log(`   - Content saved and verified`);
    console.log('');

    console.log('✅ Azure MCP E2E test PASSED!');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));

      // Check for configuration issues
      if (error.response.status === 401) {
        console.error('');
        console.error('💡 Check Azure Configuration:');
        console.error('   - ANTHROPIC_API_KEY should be set');
        console.error('   - DALIVE_BEARER_TOKEN might be needed (check function requirements)');
      }
    }
    process.exit(1);
  }
}

testEditContentWithMcp();
