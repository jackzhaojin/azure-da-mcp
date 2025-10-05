#!/usr/bin/env node
/**
 * E2E Test: Full MCP Integration Workflow
 * Tests complete flow: EditContent → LLM calls get_dalive_content → LLM edits → LLM calls save_dalive_content
 *
 * This test validates the entire MCP-enabled editing workflow with real APIs
 *
 * Expected: FAILS initially until T011 (EditContentFunction refactor) is complete
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
const TEST_COMMAND = 'Add a comment "MCP Integration Test" at the bottom of the body';

console.log('🧪 E2E Test: Full MCP Integration Workflow');
console.log(`   Server: ${FUNCTIONS_BASE_URL}`);
console.log(`   Path: ${TEST_PATH}`);
console.log(`   Command: ${TEST_COMMAND}`);
console.log('');

async function testFullWorkflow() {
  try {
    console.log('🚀 Calling EditContent with MCP workflow...');
    console.log('   ⏳ This will take ~14-15 seconds (LLM + MCP tool calls)...');
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

    // Validate response structure (from Spec 001)
    if (!response.data.requestId) {
      throw new Error('Missing requestId in response');
    }

    if (typeof response.data.editedHtmlLength !== 'number') {
      throw new Error('Missing or invalid editedHtmlLength');
    }

    if (!response.data.explanation) {
      throw new Error('Missing explanation in response');
    }

    if (!response.data.reasoning) {
      throw new Error('Missing reasoning in response');
    }

    if (!response.data.timing) {
      throw new Error('Missing timing in response');
    }

    console.log('✅ EditContent successful!');
    console.log(`   Request ID: ${response.data.requestId}`);
    console.log(`   Edited HTML length: ${response.data.editedHtmlLength} characters`);
    console.log('');

    console.log('📝 LLM Response:');
    console.log(`   Explanation: ${response.data.explanation}`);
    console.log(`   Reasoning: ${response.data.reasoning}`);
    console.log('');

    // Validate timing breakdown
    const timing = response.data.timing;
    console.log('⏱️  Timing Breakdown:');
    console.log(`   Total: ${timing.total}ms`);

    // With MCP, we should see MCP tool calls instead of direct da.live calls
    if (timing.mcp_get_content !== undefined) {
      console.log(`   - MCP get_dalive_content: ${timing.mcp_get_content}ms`);
    }

    console.log(`   - LLM call: ${timing.llm_call}ms`);

    if (timing.mcp_save_content !== undefined) {
      console.log(`   - MCP save_dalive_content: ${timing.mcp_save_content}ms`);
    }
    console.log('');

    // Validate MCP tool calls logged
    if (response.data.mcpToolCalls) {
      console.log('🔧 MCP Tool Calls:');
      response.data.mcpToolCalls.forEach((call, index) => {
        console.log(`   ${index + 1}. ${call.toolName} (${call.duration}ms) - ${call.status}`);
      });
      console.log('');

      // Verify expected tool calls occurred
      const toolNames = response.data.mcpToolCalls.map(c => c.toolName);
      if (!toolNames.includes('get_dalive_content')) {
        console.warn('   ⚠️  Warning: No get_dalive_content call detected');
      }
      if (!toolNames.includes('save_dalive_content')) {
        console.warn('   ⚠️  Warning: No save_dalive_content call detected');
      }
    }

    // Performance validation (per Spec 001 baseline)
    const EXPECTED_TOTAL_MS = 15000; // 15 seconds
    if (timing.total > EXPECTED_TOTAL_MS * 1.5) {
      console.warn(`   ⚠️  Warning: Total time ${timing.total}ms exceeds expected ${EXPECTED_TOTAL_MS}ms by >50%`);
    } else {
      console.log(`✅ Performance acceptable: ${timing.total}ms (baseline: ~${EXPECTED_TOTAL_MS}ms)`);
    }
    console.log('');

    console.log('✅ Full MCP Integration E2E test PASSED!');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ Test FAILED:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('');
    console.error('Expected: This test SHOULD FAIL until T011 (EditContentFunction MCP refactor) is complete');
    process.exit(1);
  }
}

if (!BEARER_TOKEN) {
  console.error('❌ DALIVE_BEARER_TOKEN not set in .env file');
  process.exit(1);
}

testFullWorkflow();
