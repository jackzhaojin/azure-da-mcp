#!/usr/bin/env node
/**
 * E2E Test for ClaudeAgentSdk with MCP Tool Call
 * Tests Claude Agent SDK with get_dalive_content MCP tool call + haiku generation
 *
 * Run with: node tests/e2e/claude-agent-sdk-mcp-get.test.js
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
} else {
  console.error('❌ No .env file found. Copy .env.example to .env and add your tokens.');
  process.exit(1);
}

const FUNCTIONS_BASE_URL = 'http://localhost:7071';
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;
const TEST_PATH = process.env.E2E_TEST_PATH || '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';

// Get current date and time for unique haiku
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

console.log('🚀 Testing ClaudeAgentSdk with MCP Tool Call (get_dalive_content)');
console.log(`   Server: ${FUNCTIONS_BASE_URL}`);
console.log(`   Test Path: ${TEST_PATH}`);
console.log(`   Date: ${dateStr}`);
console.log(`   Time: ${timeStr}`);
console.log('');

async function testClaudeAgentSdkMcpGet() {
  try {
    console.log('📝 Requesting Claude Agent SDK to use MCP tool + write haiku...');
    console.log('   ⏳ This may take 10-20 seconds (includes MCP tool call)...');

    const response = await axios.post(
      `${FUNCTIONS_BASE_URL}/api/ClaudeAgentSdk`,
      {
        prompt: {
          systemInstructions: 'You are a creative poet who writes haikus. You have access to MCP tools to read content from da.live. Always respond with valid JSON.',
          userCommand: `First, use the get_dalive_content tool to read the content from path: ${TEST_PATH}. Then, write a haiku about today being ${dateStr} at ${timeStr}. Return your response as JSON with this exact structure: {"editedHtml": "your haiku here", "explanation": "brief explanation of the haiku and mention what content you found", "reasoning": "why you chose this imagery"}`,
          pageContext: `You should call get_dalive_content with path: ${TEST_PATH}`,
          editingGuidelines: 'First use the get_dalive_content tool to fetch the content, then be creative with your haiku incorporating the date and time. Return valid JSON only, no markdown code blocks.'
        },
        mcpConfig: {
          serverUrl: 'http://localhost:7071/api/mcp',
          bearerToken: BEARER_TOKEN
        }
        // Model will use default from CLAUDE_MODEL env var
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 second timeout for MCP tool call
      }
    );

    console.log('');
    console.log('✅ Response received!');
    console.log('');
    console.log('📜 Haiku:');
    console.log('─'.repeat(50));
    console.log(response.data.editedHtml || 'No haiku');
    console.log('─'.repeat(50));
    console.log('');

    if (response.data.explanation) {
      console.log('💭 Explanation:', response.data.explanation);
      console.log('');
    }

    if (response.data.reasoning) {
      console.log('🤔 Reasoning:', response.data.reasoning);
      console.log('');
    }

    console.log('📊 Metrics:');
    console.log(`   Token usage: ${response.data.tokenUsage?.inputTokens || 0} in / ${response.data.tokenUsage?.outputTokens || 0} out`);
    console.log(`   Duration: ${response.data.timing?.total || 0}ms`);
    console.log(`   MCP tools called: ${response.data.mcpToolCalls?.length || 0}`);

    if (response.data.mcpToolCalls && response.data.mcpToolCalls.length > 0) {
      console.log('');
      console.log('🔧 MCP Tool Calls:');
      response.data.mcpToolCalls.forEach((call, index) => {
        console.log(`   ${index + 1}. ${call.toolName}`);
        console.log(`      Status: ${call.status}`);
        if (call.duration) {
          console.log(`      Duration: ${call.duration}ms`);
        }
        if (call.parameters) {
          console.log(`      Parameters: ${JSON.stringify(call.parameters)}`);
        }
      });
    }

    console.log('');

    // Verify that MCP tool was actually called
    if (!response.data.mcpToolCalls || response.data.mcpToolCalls.length === 0) {
      console.error('⚠️  Warning: No MCP tools were called! Expected get_dalive_content to be called.');
    } else {
      const getContentCall = response.data.mcpToolCalls.find(c => c.toolName === 'get_dalive_content');
      if (!getContentCall) {
        console.error('⚠️  Warning: get_dalive_content tool was not called!');
      } else if (getContentCall.status !== 'completed') {
        console.error(`⚠️  Warning: get_dalive_content tool call failed with status: ${getContentCall.status}`);
      } else {
        console.log('✅ MCP tool get_dalive_content was successfully called!');
      }
    }

    console.log('');
    console.log('✅ Test passed!');

  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testClaudeAgentSdkMcpGet();
