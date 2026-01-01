/**
 * Minimal test to verify MCP tool usage with Claude Agent SDK
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

console.log('🚀 Starting minimal tool usage test...\n');

// Ultra-explicit prompt that directly commands tool usage
const testPrompt = `You must navigate to https://example.com using the browser_navigate tool right now.

IMMEDIATE ACTION REQUIRED:
1. Use the tool mcp__playwright__browser_navigate with input: {"url": "https://example.com"}
2. After navigation completes, respond with "Navigation complete"

DO NOT respond with text only. YOU MUST CALL THE TOOL FIRST.`;

console.log('📝 Test Prompt:');
console.log(testPrompt);
console.log('\n' + '='.repeat(80) + '\n');

const mcpServers = {
  "playwright": {
    command: "/opt/homebrew/bin/mcp-server-playwright",
    args: ["--headless", "--browser=chromium"]
  }
};

console.log('⚙️  MCP Configuration:', JSON.stringify(mcpServers, null, 2));
console.log('\n' + '='.repeat(80) + '\n');

let toolCallCount = 0;
let messages = [];

try {
  for await (const message of query({
    prompt: testPrompt,
    options: {
      model: 'claude-sonnet-4-5-20250929',
      maxTurns: 5,
      mcpServers,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      cwd: process.cwd(),
    }
  })) {
    console.log(`📨 Message type: ${message.type}`);

    if (message.type === 'system' && message.subtype === 'init') {
      console.log('\n🔌 MCP Servers:', JSON.stringify(message.mcp_servers, null, 2));
      console.log('\n🛠️  Available Playwright tools:');
      const playwrightTools = message.tools.filter(t => t.includes('playwright'));
      playwrightTools.forEach(tool => console.log(`  - ${tool}`));
      console.log('\n' + '='.repeat(80) + '\n');
    }

    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'tool_use') {
          toolCallCount++;
          console.log(`\n✅ TOOL CALL #${toolCallCount}:`);
          console.log(`   Tool: ${block.name}`);
          console.log(`   Input: ${JSON.stringify(block.input, null, 2)}`);
        }
        if (block.type === 'text') {
          messages.push(block.text);
          console.log(`\n💬 Claude response: ${block.text.substring(0, 200)}...`);
        }
      }
    }

    if (message.type === 'result') {
      console.log('\n' + '='.repeat(80));
      console.log(`\n🏁 Test Complete!`);
      console.log(`   Turns: ${message.num_turns}`);
      console.log(`   Tool calls: ${toolCallCount}`);
      console.log(`   Duration: ${message.duration_ms}ms`);
      console.log(`   Status: ${message.subtype}`);

      if (toolCallCount === 0) {
        console.log('\n❌ FAILURE: Claude did not use any tools!');
        console.log('   This confirms the prompt is being ignored.');
      } else {
        console.log('\n✅ SUCCESS: Claude used tools!');
      }
    }
  }
} catch (error) {
  console.error('\n💥 Error:', error.message);
  console.error(error.stack);
}
