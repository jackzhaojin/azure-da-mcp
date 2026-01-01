/**
 * PHASE 25.9: Test EXACT complex prompts from structure.json in standalone context
 *
 * This uses the EXACT same prompts and formatting that the structure agent uses,
 * but in a standalone test outside of Next.js.
 *
 * If this works: Problem is Next.js/logging/structure agent context
 * If this fails: Problem is prompt complexity
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { getMCPServersConfig } from '../../src/lib/mcp-config';

// EXACT system prompt from structure.json
const COMPLEX_SYSTEM = `You are a web structure quality analyst.

**YOUR WORKFLOW**:
1. First, use browser automation tools to gather live page data
2. Then, analyze and return structured JSON

**CRITICAL RULE**: You MUST use browser tools BEFORE responding with JSON. The static metrics provided are incomplete - you need live page data.`;

// EXACT user prompt template from structure.json, with sample data
const COMPLEX_USER = `Analyze the structure of: https://example.com

# Available Static Metrics

The following metrics were extracted via HTML parsing (incomplete - you need live page data):

## Meta Tags
Title: Example Domain
Description: (missing)
Keywords: (missing)
Charset: (missing)
Viewport: width=device-width, initial-scale=1
OG Title: (missing)
OG Description: (missing)
OG Image: (missing)

## Heading Hierarchy
H1: Example Domain (1 instance)
H2: (none)
H3: (none)
Proper nesting: Yes
Issues: None detected

## Document Structure
Has <main>: No
Has <header>: No
Has <footer>: No
Has <nav>: No
Section count: 0
Article count: 0

## Link Analysis
Total links: 1
Internal links: 0
External links: 1
Broken anchors: 0
Links without text: 0

# Required JSON Response Format

After gathering live page data with tools, return JSON with:

\`\`\`json
{
  "findings": [
    {
      "dimension": "structure",
      "severity": "critical" | "serious" | "moderate" | "minor",
      "issue": "Brief description",
      "recommendation": "Specific fix",
      "impact": "Why it matters (SEO/accessibility/UX)"
    }
  ],
  "score": 0-100,
  "summary": "1-2 sentence assessment"
}
\`\`\`

# Scoring Guidelines

**Meta Tags (30 points)**: Missing title (-10), description (-8), viewport (-5), OG tags (-5)
**Heading Hierarchy (30 points)**: No H1 (-15), multiple H1s (-10), improper nesting (-5 per skip)
**Semantic HTML (20 points)**: No main (-8), header (-4), footer (-4), nav (-4)
**Link Structure (20 points)**: Broken anchors (-5 each), no text (-3 each), no internal links (-5)

---

# CRITICAL: TOOL EXECUTION REQUIRED

🚨 BEFORE YOU RESPOND WITH JSON, YOU MUST EXECUTE THESE TOOLS IN ORDER:

**STEP 1**: Call \`mcp__playwright__browser_navigate\` with \`{"url": "https://example.com"}\` to load the live page

**STEP 2**: Call \`mcp__playwright__browser_snapshot\` to inspect the DOM

**STEP 3** (Optional): Call \`Bash\` with \`lighthouse --only-categories=seo https://example.com --output=json --quiet\` for SEO validation

**STEP 4**: Combine tool results with static metrics above and generate the JSON response

🚫 DO NOT skip tools and respond with JSON directly. The static metrics are INCOMPLETE.

✅ Execute tools FIRST, analyze SECOND, respond with JSON LAST.`;

async function testComplexPromptStandalone() {
  console.log('🧪 PHASE 25.9: Testing EXACT complex prompts in standalone context...\n');

  const mcpServers = getMCPServersConfig();

  console.log('📋 Configuration:');
  console.log('  System prompt length:', COMPLEX_SYSTEM.length);
  console.log('  User prompt length:', COMPLEX_USER.length);
  console.log('  Total:', COMPLEX_SYSTEM.length + COMPLEX_USER.length);
  console.log('\n' + '='.repeat(80) + '\n');

  let toolCallCount = 0;
  let turnCount = 0;

  try {
    for await (const message of query({
      prompt: COMPLEX_USER,
      options: {
        model: 'claude-sonnet-4-5-20250929',
        maxTurns: 20,
        systemPrompt: COMPLEX_SYSTEM,
        mcpServers,
        permissionMode: 'bypassPermissions' as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
      }
    })) {
      if (message.type === 'system' && message.subtype === 'init') {
        console.log('🔌 MCP Servers:', message.mcp_servers?.map((s: any) => `${s.name}: ${s.status}`));
      }

      if (message.type === 'assistant') {
        turnCount++;
        console.log(`\n📨 Turn ${turnCount}`);

        if (message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'tool_use') {
              toolCallCount++;
              console.log(`  ✅ TOOL CALL #${toolCallCount}: ${block.name}`);
              console.log(`     Input: ${JSON.stringify(block.input).substring(0, 100)}`);
            }
            if (block.type === 'text') {
              console.log(`  💬 Text length: ${block.text.length} chars`);
            }
          }
        }
      }

      if (message.type === 'result') {
        console.log('\n' + '='.repeat(80));
        console.log(`\n🏁 Test Complete!`);
        console.log(`   Turns: ${message.num_turns}`);
        console.log(`   Tool calls: ${toolCallCount}`);
        console.log(`   Duration: ${message.duration_ms}ms`);

        if (toolCallCount === 0) {
          console.log('\n❌ FAILURE: Complex prompts fail even in standalone!');
          console.log('   This CONFIRMS the issue is prompt complexity, NOT Next.js/logging.');
        } else {
          console.log('\n✅ SUCCESS: Complex prompts work in standalone!');
          console.log('   This means the issue IS with Next.js/logging/structure agent context.');
        }
      }
    }
  } catch (error: any) {
    console.error('\n💥 Error:', error.message);
    console.error(error.stack);
  }
}

testComplexPromptStandalone().catch(console.error);
