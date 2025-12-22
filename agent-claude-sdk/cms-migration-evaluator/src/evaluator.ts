/**
 * CMS Migration Evaluator - Phases 1-3
 * Agent SDK for PDF → Webpage comparison with enhanced visual regression,
 * accessibility testing, and performance audits
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTimestampedOutputDirs } from './utils/outputPaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EvaluationInput {
  pdfPath: string;
  migratedUrl: string;
  outputDir?: string;
  outputFolderName?: string; // Optional name for the output folder (e.g., "test-migration")
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

    // Create timestamped output directories
    // Use outputFolderName if provided, otherwise extract from PDF filename
    const folderName = input.outputFolderName || path.basename(input.pdfPath, path.extname(input.pdfPath));
    const outputDirs = await createTimestampedOutputDirs(input.outputDir, folderName);
    const { runDir, reportsDir, screenshotsDir, lighthouseDir, axeDir } = outputDirs;

    // Extract PDF filename for report ID
    const pdfFilename = path.basename(input.pdfPath, path.extname(input.pdfPath));
    const reportPath = path.join(reportsDir, `${pdfFilename}-report.json`);

    messages.push(`Run directory: ${runDir}`);
    messages.push(`Output report: ${reportPath}`);
    messages.push('');
    messages.push('Invoking Agent SDK with cms-eval Skill...');

    // Build enhanced evaluation prompt with Phase 4.5 capabilities
    const prompt = `You are an expert CMS migration quality evaluator. Compare a PDF (expected design) to a migrated webpage (actual) using Playwright MCP tools and AI reasoning.

**Task:** Comprehensive migration quality evaluation across 5 dimensions

**CRITICAL: You MUST use Playwright MCP tools directly. DO NOT create scripts.**

**Required Tool Workflow:**

### 1. PDF Analysis (Baseline)
Read PDF at: ${input.pdfPath}

Use the Read tool to extract:
- Text content and structure
- Headings, sections, paragraphs
- Image descriptions (if visible)
- Metadata (title, author, etc.)

### 2. Webpage Capture with Playwright MCP

Navigate to: ${input.migratedUrl}

**Step 1: Navigate to webpage**
\`\`\`typescript
mcp__playwright__browser_navigate({
  url: "${input.migratedUrl}"
})
\`\`\`

**Step 2: Wait for page to load**
\`\`\`typescript
mcp__playwright__browser_wait_for({
  time: 3  // Wait 3 seconds for page load
})
\`\`\`

**Step 3: Capture accessibility snapshot**
\`\`\`typescript
mcp__playwright__browser_snapshot({
  filename: "${screenshotsDir}/accessibility-snapshot-${pdfFilename}.md"
})
\`\`\`

**Step 4: Take screenshot**
\`\`\`typescript
mcp__playwright__browser_take_screenshot({
  filename: "${screenshotsDir}/migrated-${pdfFilename}.png",
  fullPage: true
})
\`\`\`

**Step 5: Extract Core Web Vitals via JavaScript evaluation**
\`\`\`typescript
mcp__playwright__browser_evaluate({
  function: \`() => {
    return JSON.stringify({
      lcp: performance.getEntriesByType('largest-contentful-paint')[0]?.startTime || 0,
      fcp: performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')?.startTime || 0,
      cls: 0  // CLS requires observation over time
    });
  }\`
})
\`\`\`

**IMPORTANT:**
- DO NOT use the Bash tool to create scripts
- DO NOT try to install or run external tools (Lighthouse, aXe)
- Focus on what Playwright MCP provides: navigation, snapshots, screenshots, JavaScript evaluation
- For accessibility: Analyze the accessibility snapshot for ARIA issues, missing alt text, heading hierarchy
- For performance: Extract Core Web Vitals via browser performance APIs (LCP, FCP)

### 3. Phase 4.5 Simplified Testing (MCP Tools Only)

#### 3A. Visual Comparison
- Read PDF to understand expected visual layout
- Compare PDF content description vs webpage screenshot (visual analysis)
- Identify missing images, layout differences, styling changes
- Note: Pixel-perfect diff not available without external tools (acceptable limitation)

#### 3B. Accessibility Analysis (from Accessibility Snapshot)
Analyze the accessibility snapshot (\`browser_snapshot\` output) for:
- Missing alt text on images (check for img elements without alt)
- Poor color contrast (review CSS styles in snapshot)
- Invalid heading hierarchy (check H1→H2→H3 order)
- Missing form labels (check for inputs without associated labels)
- ARIA attribute errors (review ARIA attributes in snapshot)

Categorize violations by severity:
- Critical: Blocks users completely (e.g., no alt text on key images)
- High: Major barriers (e.g., poor contrast <3:1)
- Medium: Annoying but not blocking (e.g., minor heading order issues)
- Low: Best practice improvements (e.g., missing optional ARIA)

Note: Full WCAG 2.2 AA compliance requires external tools (aXe). This is manual analysis only.

#### 3C. Performance Metrics (from Browser APIs)
Use \`browser_evaluate\` to extract Core Web Vitals:
- LCP (Largest Contentful Paint): Target <2.5s
- FCP (First Contentful Paint): Target <1.8s
- CLS (Cumulative Layout Shift): Note - requires observation over time, may report 0

Note: Full Lighthouse audit requires external tools. CWV extraction is basic.

#### 3D. Estimated Lighthouse Scores
Based on analysis above, estimate Lighthouse scores (0-100):
- Performance: Based on LCP/FCP values
- Accessibility: Based on manual accessibility analysis from snapshot
- SEO: Based on meta tags, heading structure from snapshot
- Best Practices: Based on HTTPS, console errors (if visible)

### 4. Scoring (0-100 per dimension)

**SEO (25%)**: Based on meta tags + heading structure + content readability
**Accessibility (25%)**: Based on manual accessibility analysis from snapshot
**Visual Fidelity (20%)**: Based on visual comparison of PDF vs screenshot
**Content Quality (20%)**: Based on text completeness + structure preservation
**Intent Alignment (10%)**: Based on AI reasoning about messaging/tone consistency

**Overall Score** = weighted average using above percentages

**Grade Thresholds:**
- excellent (90-100), good (75-89), acceptable (60-74), needs-improvement (40-59), critical (0-39)

### 5. Generate Enhanced JSON Report

Save to: ${reportPath}

**Enhanced Report Format:**
\`\`\`json
{
  "summary": {
    "overallScore": 85,
    "seoScore": 90,
    "accessibilityScore": 80,
    "visualFidelityScore": 85,
    "contentQualityScore": 90,
    "intentAlignmentScore": 75,
    "grade": "good",
    "coreWebVitals": {
      "lcp": 0.424,
      "fcp": 0.424,
      "cls": 0,
      "passing": true
    },
    "estimatedLighthouseScores": {
      "performance": 95,
      "accessibility": 80,
      "seo": 90,
      "bestPractices": 85
    }
  },
  "findings": [
    {
      "dimension": "Accessibility",
      "severity": "critical",
      "issue": "5 images missing alt text",
      "recommendation": "Add descriptive alt text to all images",
      "location": "Main content area"
    },
    {
      "dimension": "Visual Fidelity",
      "severity": "medium",
      "issue": "Hero section appears compressed compared to PDF",
      "recommendation": "Review spacing in hero section"
    }
  ],
  "recommendations": [
    "Fix 5 images missing alt text (critical)",
    "Review hero section spacing (medium)"
  ],
  "artifacts": {
    "accessibilitySnapshot": "${screenshotsDir}/accessibility-snapshot-${pdfFilename}.md",
    "migratedScreenshot": "${screenshotsDir}/migrated-${pdfFilename}.png"
  },
  "metadata": {
    "evaluatedAt": "<ISO timestamp>",
    "evaluator": "cms-migration-evaluator-v1.0-phase4.5",
    "phase": "4.5",
    "source": "${input.pdfPath}",
    "migratedUrl": "${input.migratedUrl}",
    "tools": {
      "webpageCapture": "Playwright MCP (browser_navigate, browser_snapshot, browser_take_screenshot)",
      "accessibility": "Manual analysis of accessibility snapshot",
      "performance": "Browser Performance APIs (via browser_evaluate)",
      "coreWebVitals": "Browser Performance APIs"
    },
    "limitations": "Full Lighthouse and aXe scans not available with MCP tools only. Manual analysis used."
  }
}
\`\`\`

**Important Notes:**
1. Use Playwright MCP tools directly (mcp__playwright__browser_navigate, browser_snapshot, browser_take_screenshot, browser_evaluate)
2. DO NOT create scripts or use Bash tool for Playwright operations
3. Focus on manual analysis of accessibility snapshot
4. Extract Core Web Vitals via browser_evaluate
5. Provide estimated Lighthouse scores based on manual analysis
6. Save accessibility snapshot and screenshot to specified directories
7. Ensure all findings have severity levels and actionable recommendations

Begin the comprehensive Phase 4.5 evaluation now using ONLY Playwright MCP tools.`;

    // Get project root directory (one level up from src/)
    const projectRoot = path.resolve(__dirname, '..');

    // Invoke Agent SDK with Skills enabled
    const agentMessages: string[] = [];

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
        settingSources: ['user', 'project'],      // Load MCP servers from user config
        allowDangerouslySkipPermissions: true,    // Auto-approve MCP tool usage (needed for Playwright MCP)
        permissionMode: 'bypassPermissions',      // Bypass all permission prompts
        allowedTools: [
          'Read',      // Read PDF
          'Write',     // Write report
          // Playwright MCP tools automatically available via Agent SDK when MCP server loaded
        ],
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
