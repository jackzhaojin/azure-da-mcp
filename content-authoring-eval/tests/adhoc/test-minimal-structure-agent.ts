/**
 * PHASE 25.7: Minimal structure agent test to isolate the issue
 *
 * This test replicates the structure agent but with MINIMAL complexity:
 * - Simple system prompt
 * - Simple user prompt (no JSON schema, no metrics)
 * - Same MCP configuration
 *
 * Goal: Find out if complexity is preventing tool usage
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getMCPServersConfig } from '../../src/lib/mcp-config';

const SIMPLE_SYSTEM_PROMPT = `You are a web structure analyzer.

CRITICAL INSTRUCTION: You MUST use browser automation tools before responding.

Your workflow:
1. Navigate to the target URL using mcp__playwright__browser_navigate
2. Take a snapshot using mcp__playwright__browser_snapshot
3. Respond with what you found

DO NOT skip tools. USE THEM FIRST.`;

const SIMPLE_USER_PROMPT = `Analyze https://example.com

FIRST: Navigate to the URL using mcp__playwright__browser_navigate
SECOND: Take a snapshot using mcp__playwright__browser_snapshot
THIRD: Tell me what you found

You MUST use the tools. Do it now.`;

async function testMinimalStructureAgent() {
  console.log('🧪 PHASE 25.7: Testing minimal structure agent...\n');

  const mcpServers = getMCPServersConfig();

  console.log('📋 Configuration:');
  console.log('  System prompt length:', SIMPLE_SYSTEM_PROMPT.length);
  console.log('  User prompt length:', SIMPLE_USER_PROMPT.length);
  console.log('  MCP servers:', Object.keys(mcpServers));
  console.log('\n' + '='.repeat(80) + '\n');

  let toolCallCount = 0;
  let turnCount = 0;

  try {
    for await (const message of query({
      prompt: SIMPLE_USER_PROMPT,
      options: {
        model: 'claude-sonnet-4-5-20250929',
        maxTurns: 10,
        systemPrompt: SIMPLE_SYSTEM_PROMPT,
        mcpServers,
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
      }
    })) {
      console.log(`\n📨 Message type: ${message.type}`);

      if (message.type === 'system' && message.subtype === 'init') {
        console.log('🔌 MCP Servers:', message.mcp_servers?.map((s: any) => `${s.name}: ${s.status}`));
        console.log('🛠️  Tool count:', message.tools?.length);
      }

      if (message.type === 'assistant') {
        turnCount++;
        console.log(`  Turn: ${turnCount}`);

        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              toolCallCount++;
              console.log(`  ✅ TOOL CALL #${toolCallCount}: ${block.name}`);
              console.log(`     Input: ${JSON.stringify(block.input)}`);
            }
            if (block.type === 'text') {
              console.log(`  💬 Text: ${block.text.substring(0, 150)}...`);
            }
          }
        }
      }

      if (message.type === 'result') {
        console.log('\n' + '='.repeat(80));
        console.log(`\n🏁 Test Complete!`);
        console.log(`   Total turns: ${message.num_turns}`);
        console.log(`   Tool calls: ${toolCallCount}`);
        console.log(`   Duration: ${message.duration_ms}ms`);
        console.log(`   Status: ${message.subtype}`);

        if (toolCallCount === 0) {
          console.log('\n❌ FAILURE: No tools used even with minimal complexity!');
          console.log('   This suggests the issue is NOT prompt complexity.');
        } else {
          console.log('\n✅ SUCCESS: Tools used with minimal prompts!');
          console.log('   This suggests prompt complexity is the issue.');
        }
      }
    }
  } catch (error: any) {
    console.error('\n💥 Error:', error.message);
    console.error(error.stack);
  }
}

testMinimalStructureAgent().catch(console.error);
