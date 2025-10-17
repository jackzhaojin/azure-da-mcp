#!/usr/bin/env node
/**
 * Simple E2E Test for ClaudeAgentSdk
 * Tests the Claude Agent SDK endpoint with a simple haiku request
 *
 * Run with: node tests/e2e/claude-agent-sdk-haiku.test.js
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

console.log('🚀 Testing ClaudeAgentSdk with Simple Haiku Request');
console.log(`   Server: ${FUNCTIONS_BASE_URL}`);
console.log(`   Date: ${dateStr}`);
console.log(`   Time: ${timeStr}`);
console.log('');

async function testClaudeAgentSdkHaiku() {
  try {
    console.log('📝 Requesting haiku from Claude Agent SDK...');
    console.log('   ⏳ This may take 5-10 seconds...');

    const response = await axios.post(
      `${FUNCTIONS_BASE_URL}/api/ClaudeAgentSdk`,
      {
        prompt: {
          systemInstructions: 'You are a creative poet who writes haikus. Always respond with valid JSON.',
          userCommand: `Write a haiku about today being ${dateStr} at ${timeStr}. Return your response as JSON with this exact structure: {"editedHtml": "your haiku here", "explanation": "brief explanation of the haiku", "reasoning": "why you chose this imagery"}`,
          pageContext: '',
          editingGuidelines: 'Be creative and include the date and time naturally. Return valid JSON only, no markdown code blocks.'
        }
        // No mcpConfig needed for this simple test
        // Model will use default from CLAUDE_MODEL env var
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout
      }
    );

    console.log('');
    console.log('✅ Haiku received!');
    console.log('');
    console.log('📜 Response:');
    console.log('─'.repeat(50));
    console.log(response.data.editedHtml || response.data.explanation || 'No content');
    console.log('─'.repeat(50));
    console.log('');

    if (response.data.explanation) {
      console.log('💭 Explanation:', response.data.explanation);
      console.log('');
    }

    console.log('📊 Metrics:');
    console.log(`   Token usage: ${response.data.tokenUsage?.inputTokens || 0} in / ${response.data.tokenUsage?.outputTokens || 0} out`);
    console.log(`   Duration: ${response.data.timing?.total || 0}ms`);
    console.log(`   MCP tools called: ${response.data.mcpToolCalls?.length || 0}`);
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

testClaudeAgentSdkHaiku();
