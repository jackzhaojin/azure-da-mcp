/**
 * PHASE 25.8: Test if ULTRA-SIMPLE prompt works in structure agent context
 *
 * This test uses the EXACT pattern from the working standalone test,
 * but within the structure agent's environment (Next.js imports, etc.)
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getMCPServersConfig } from '../../src/lib/mcp-config';

// EXACT pattern from working standalone test
const ULTRA_SIMPLE_SYSTEM = `You are a web analyzer. Use browser tools to analyze pages.`;

const ULTRA_SIMPLE_USER = `Navigate to https://example.com and analyze its structure.

FIRST: Use mcp__playwright__browser_navigate with {"url": "https://example.com"}
SECOND: Use mcp__playwright__browser_snapshot
THIRD: Tell me what you found

DO NOT respond with text only. USE THE TOOLS FIRST.`;

async function testUltraSimplePrompt() {
  console.log('🧪 PHASE 25.8: Testing ultra-simple prompt pattern...\n');

  const mcpServers = getMCPServersConfig();

  console.log('📋 Configuration:');
  console.log('  System prompt length:', ULTRA_SIMPLE_SYSTEM.length);
  console.log('  User prompt length:', ULTRA_SIMPLE_USER.length);
  console.log('\n' + '='.repeat(80) + '\n');

  let toolCallCount = 0;

  try {
    for await (const message of query({
      prompt: ULTRA_SIMPLE_USER,
      options: {
        model: 'claude-sonnet-4-5-20250929',
        maxTurns: 10,
        systemPrompt: ULTRA_SIMPLE_SYSTEM,
        mcpServers,
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
      }
    })) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'tool_use') {
            toolCallCount++;
            console.log(`✅ TOOL CALL #${toolCallCount}: ${block.name}`);
          }
        }
      }

      if (message.type === 'result') {
        console.log('\n' + '='.repeat(80));
        console.log(`\n🏁 Result: ${toolCallCount} tool calls`);

        if (toolCallCount > 0) {
          console.log('\n✅ SUCCESS: Simple pattern works even in structure agent context!');
          console.log('   This confirms the issue is 100% prompt complexity.');
        } else {
          console.log('\n❌ FAILURE: Even simple pattern fails in this context!');
          console.log('   This suggests a deeper environment issue.');
        }
      }
    }
  } catch (error: any) {
    console.error('\n💥 Error:', error.message);
  }
}

testUltraSimplePrompt().catch(console.error);
