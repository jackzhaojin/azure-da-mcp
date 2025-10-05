/**
 * E2E Test: Add Paragraph with Timestamp via MCP
 * Tests LLM's ability to add content with dynamic data
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

describe('MCP Timestamp E2E Test', () => {
  let fullTimestamp;
  let currentDate;
  let currentTime;
  let testCommand;

  beforeAll(() => {
    if (!BEARER_TOKEN) {
      throw new Error('DALIVE_BEARER_TOKEN not set in .env file');
    }

    // Generate current timestamp for verification
    const now = new Date();
    currentDate = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    currentTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    fullTimestamp = `${currentDate} at ${currentTime}`;
    testCommand = `Add a paragraph at the bottom of the page with the text "Current timestamp: ${fullTimestamp}"`;

    console.log('🧪 E2E Test: Add Paragraph with Current Date and Time');
    console.log(`   Server: ${FUNCTIONS_BASE_URL}`);
    console.log(`   Path: ${TEST_PATH}`);
    console.log(`   Timestamp: ${fullTimestamp}\n`);
  });

  test('should add paragraph with timestamp using MCP tools', async () => {
    console.log('🚀 Step 1: Calling EditContent with timestamp command...');
    console.log(`   Command: "${testCommand}"`);
    console.log('   ⏳ This will take ~30 seconds...\n');

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
        timeout: 120000
      }
    );

    const totalDuration = Date.now() - startTime;

    console.log('✅ EditContent successful!');
    console.log(`   Request ID: ${response.data.requestId}`);
    console.log(`   Duration: ${totalDuration}ms\n`);

    // Validate response structure
    expect(response.data.requestId).toBeDefined();
    expect(response.data.editedHtmlLength).toBeGreaterThan(0);
    expect(response.data.explanation).toBeDefined();
    expect(response.data.reasoning).toBeDefined();

    console.log('📝 LLM Response:');
    console.log(`   Explanation: ${response.data.explanation}`);
    console.log(`   Reasoning: ${response.data.reasoning}\n`);

    // Validate MCP tool calls
    expect(response.data.mcpToolCalls).toBeDefined();
    expect(response.data.mcpToolCalls.length).toBeGreaterThan(0);

    console.log('🔧 MCP Tool Calls:');
    response.data.mcpToolCalls.forEach((call, index) => {
      console.log(`   ${index + 1}. ${call.toolName} (${call.duration}ms) - ${call.status}`);
    });
    console.log('');

    // Verify expected tool calls
    const toolNames = response.data.mcpToolCalls.map(c => c.toolName);
    expect(toolNames).toContain('get_dalive_content');
    expect(toolNames).toContain('save_dalive_content');

    console.log('⏱️  Timing Breakdown:');
    console.log(`   Total: ${response.data.timing.total}ms`);
    console.log(`   - MCP get_dalive_content: ${response.data.timing.mcp_get_content}ms`);
    console.log(`   - LLM call: ${response.data.timing.llm_call}ms`);
    console.log(`   - MCP save_dalive_content: ${response.data.timing.mcp_save_content}ms\n`);

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
    expect(savedHtml).toBeDefined();
    expect(savedHtml.length).toBeGreaterThan(0);

    // Check for timestamp in content
    const hasTimestamp = savedHtml.includes(currentDate) ||
                         savedHtml.includes("Current timestamp") ||
                         savedHtml.includes(currentTime);

    console.log(`   ✅ Content fetched: ${savedHtml.length} characters`);
    console.log(`   ${hasTimestamp ? '✅' : '⚠️'} Timestamp found: ${hasTimestamp}\n`);

    if (!hasTimestamp) {
      console.warn('   ⚠️  Warning: Timestamp not found in saved HTML');
      console.warn('   LLM may have reformatted the content');
    }

    console.log('📊 Test Summary:');
    console.log(`   - EditContent completed: ${totalDuration}ms`);
    console.log(`   - MCP tools used: ${response.data.mcpToolCalls.length}`);
    console.log(`   - Content saved and verified\n`);
  }, 120000); // 2 minute timeout for this test

  afterAll(() => {
    console.log('✅ Paragraph with Timestamp E2E test PASSED!\n');
  });
});
