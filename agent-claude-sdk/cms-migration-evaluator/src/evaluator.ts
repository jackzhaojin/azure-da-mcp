/**
 * CMS Migration Evaluator - Phase 1
 * Agent SDK with Skills for PDF → Webpage comparison
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EvaluationInput {
  pdfPath: string;
  migratedUrl: string;
  outputDir?: string;
}

export interface EvaluationResult {
  success: boolean;
  reportPath?: string;
  error?: string;
  messages: string[];
}

/**
 * Evaluate CMS migration quality by comparing PDF to migrated webpage
 * Uses Agent SDK with cms-eval Skill
 */
export async function evaluateMigration(
  input: EvaluationInput
): Promise<EvaluationResult> {
  const messages: string[] = [];

  try {
    messages.push('Starting CMS migration evaluation...');
    messages.push(`PDF: ${input.pdfPath}`);
    messages.push(`Migrated URL: ${input.migratedUrl}`);

    // Validate PDF exists
    const pdfExists = await fs.access(input.pdfPath).then(() => true).catch(() => false);
    if (!pdfExists) {
      return {
        success: false,
        error: `PDF not found: ${input.pdfPath}`,
        messages: [...messages, `✗ PDF not found: ${input.pdfPath}`],
      };
    }

    // Prepare output directory
    const outputDir = input.outputDir || path.join(process.cwd(), 'output', 'reports');
    await fs.mkdir(outputDir, { recursive: true });

    // Extract PDF filename for report ID
    const pdfFilename = path.basename(input.pdfPath, path.extname(input.pdfPath));
    const reportPath = path.join(outputDir, `${pdfFilename}-report.json`);

    messages.push(`Output report: ${reportPath}`);
    messages.push('');
    messages.push('Invoking Agent SDK with cms-eval Skill...');

    // Build evaluation prompt (direct approach, not using Skills)
    const prompt = `You are a CMS migration quality evaluator. Compare a PDF (expected design) to a migrated webpage (actual) and generate a quality report.

**Task:**
1. Read the PDF at: ${input.pdfPath}
2. Navigate to migrated webpage: ${input.migratedUrl} using Playwright MCP tools
3. Compare PDF vs webpage across 5 dimensions with these weights:
   - SEO (25%): Meta tags, headings, readability
   - Accessibility (25%): Alt text, heading hierarchy, basic WCAG checks
   - Visual Fidelity (20%): Layout, typography, spacing
   - Content Quality (20%): Data integrity, structure, completeness
   - Intent Alignment (10%): Messaging, tone consistency (use AI reasoning)
4. Generate a JSON report and save to: ${reportPath}

**Workflow:**
1. Use Read tool to analyze the PDF visually and extract key content
2. Use Playwright MCP tools to capture the webpage:
   - browser_navigate to load the URL
   - browser_wait_for to ensure page loads
   - browser_snapshot to get accessibility tree
   - browser_take_screenshot for visual comparison
3. Compare the two and score each dimension (0-100)
4. Calculate overall weighted score
5. List findings with severity levels
6. Write JSON report using Write tool

**Report Format** (save to ${reportPath}):
\`\`\`json
{
  "summary": {
    "overallScore": 85,
    "seoScore": 90,
    "accessibilityScore": 80,
    "visualFidelityScore": 85,
    "contentQualityScore": 90,
    "intentAlignmentScore": 75,
    "grade": "good"
  },
  "findings": [
    {
      "dimension": "Accessibility",
      "severity": "medium",
      "issue": "2 images missing alt text",
      "recommendation": "Add descriptive alt text",
      "location": "Main content area"
    }
  ],
  "recommendations": ["Add alt text", "Fix meta description"],
  "metadata": {
    "evaluatedAt": "<ISO timestamp>",
    "evaluator": "cms-migration-evaluator-v1.0",
    "source": "${input.pdfPath}",
    "migratedUrl": "${input.migratedUrl}"
  }
}
\`\`\`

**Grade Thresholds:**
- excellent (90-100), good (75-89), acceptable (60-74), needs-improvement (40-59), critical (0-39)

Begin the evaluation now.`;

    // Get project root directory (one level up from src/)
    const projectRoot = path.resolve(__dirname, '..');

    // Invoke Agent SDK with Skills enabled
    const agentMessages: string[] = [];
    let lastMessage = '';

    console.log(`\n🔧 Agent SDK Configuration:`);
    console.log(`   CWD: ${projectRoot}`);
    console.log(`   Permission Mode: auto-approve`);
    console.log('\n📡 Agent Output:\n');

    const abortController = new AbortController();

    for await (const message of query({
      prompt,
      options: {
        cwd: process.cwd(),                      // Work from project root
        abortController,
        maxTurns: 30,                             // Allow enough turns for evaluation
        model: 'claude-sonnet-4-5-20250929',
        allowedTools: [
          'Read',      // Read PDF
          'Write',     // Write report
          'Bash',      // Run external tools
        ],
        // Playwright MCP tools automatically available
      }
    })) {
      // Log all message types
      if (message.type === 'system' && message.subtype === 'init') {
        console.log('🔧 Agent initialized');
        console.log(`   Model: ${message.model}`);
        console.log(`   Tools: ${message.tools?.slice(0, 10).join(', ')}... (${message.tools?.length} total)`);
        if (message.mcp_servers) {
          console.log(`   MCP Servers: ${message.mcp_servers.map((s: any) => `${s.name} (${s.status})`).join(', ')}`);
        }
        console.log('');
      }

      // Assistant messages (text responses)
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) {
            agentMessages.push(block.text);
            lastMessage = block.text;
            console.log(`💭 ${block.text}`);
            console.log('');
          } else if (block.type === 'tool_use') {
            console.log(`🔧 Tool: ${block.name}`);
            console.log(`   Input: ${JSON.stringify(block.input, null, 2).substring(0, 200)}${JSON.stringify(block.input).length > 200 ? '...' : ''}`);
            console.log('');
          }
        }
      }

      // Tool results
      if (message.type === 'user' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'tool_result') {
            const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
            console.log(`✅ Tool result (${block.tool_use_id?.substring(0, 12)}...): ${content.substring(0, 150)}${content.length > 150 ? '...' : ''}`);
            console.log('');
          }
        }
      }

      // Final result
      if (message.type === 'result') {
        console.log('🏁 Agent completed');
        console.log('');
      }

      // Errors
      if (message.error) {
        console.error('❌ Agent error:', message.error);
      }
    }

    console.log('\n✅ Agent stream ended\n');
    console.log(`Total agent messages: ${agentMessages.length}`);

    messages.push('');
    messages.push('✓ Agent SDK evaluation complete');

    // Verify report was created
    const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
    if (!reportExists) {
      return {
        success: false,
        error: 'Evaluation completed but report file was not created',
        messages: [...messages, `✗ Report not found at: ${reportPath}`],
      };
    }

    // Read and validate report
    const reportContent = await fs.readFile(reportPath, 'utf-8');
    const report = JSON.parse(reportContent);

    messages.push(`✓ Report saved: ${reportPath}`);
    messages.push('');
    messages.push('=== Evaluation Summary ===');
    messages.push(`Overall Score: ${report.summary?.overallScore || 'N/A'}/100`);
    messages.push(`Grade: ${report.summary?.grade || 'N/A'}`);
    messages.push('');
    messages.push('Dimension Scores:');
    messages.push(`  SEO: ${report.summary?.seoScore || 'N/A'}/100`);
    messages.push(`  Accessibility: ${report.summary?.accessibilityScore || 'N/A'}/100`);
    messages.push(`  Visual Fidelity: ${report.summary?.visualFidelityScore || 'N/A'}/100`);
    messages.push(`  Content Quality: ${report.summary?.contentQualityScore || 'N/A'}/100`);
    messages.push(`  Intent Alignment: ${report.summary?.intentAlignmentScore || 'N/A'}/100`);
    messages.push('');
    messages.push(`Findings: ${report.findings?.length || 0} issues identified`);

    return {
      success: true,
      reportPath,
      messages,
    };
  } catch (error) {
    messages.push(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      messages,
    };
  }
}
