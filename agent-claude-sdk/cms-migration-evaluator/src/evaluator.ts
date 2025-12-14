/**
 * CMS Migration Evaluator - Phases 1-3
 * Agent SDK for PDF → Webpage comparison with enhanced visual regression,
 * accessibility testing, and performance audits
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

    // Prepare output directories for Phase 3 artifacts
    const screenshotsDir = path.join(process.cwd(), 'output', 'screenshots');
    const lighthouseDir = path.join(process.cwd(), 'output', 'lighthouse-reports');
    const axeDir = path.join(process.cwd(), 'output', 'axe-reports');
    await fs.mkdir(screenshotsDir, { recursive: true });
    await fs.mkdir(lighthouseDir, { recursive: true });
    await fs.mkdir(axeDir, { recursive: true });

    // Build enhanced evaluation prompt with Phase 3 capabilities
    const prompt = `You are an expert CMS migration quality evaluator with advanced testing capabilities. Compare a PDF (expected design) to a migrated webpage (actual) using automated testing tools and AI reasoning.

**Task:** Comprehensive migration quality evaluation across 5 dimensions

**Phase 1+3 Workflow:**

### 1. PDF Analysis (Baseline)
- Read PDF at: ${input.pdfPath}
- Extract text content, structure, and metadata
- Convert first page to PNG baseline screenshot for visual comparison

### 2. Webpage Capture with Playwright MCP
Navigate to: ${input.migratedUrl}

Use Playwright MCP tools:
- \`mcp__playwright__browser_navigate\` to load URL
- \`mcp__playwright__browser_wait_for\` to ensure page loads
- \`mcp__playwright__browser_snapshot\` to capture accessibility tree
- \`mcp__playwright__browser_take_screenshot\` to save visual screenshot

### 3. Phase 3 Enhanced Testing

#### 3A. Visual Regression Testing
- Convert PDF first page to PNG baseline: \`${screenshotsDir}/baseline-${pdfFilename}.png\`
- Compare baseline PNG vs webpage screenshot using visual analysis
- Calculate pixel difference percentage
- Save diff visualization if significant differences found
- **Threshold**: 10% acceptable difference (0.1)

#### 3B. Accessibility Testing (WCAG 2.2 AA)
Use Playwright + aXe to scan for:
- Missing alt text on images
- Poor color contrast (<4.5:1)
- Invalid heading hierarchy
- Missing form labels
- Keyboard navigation issues
- ARIA attribute errors

Scan with WCAG 2.2 AA rules and categorize violations by severity:
- Critical: Blocks users completely
- High: Major barriers
- Medium: Annoying but not blocking
- Low: Best practice improvements

Save detailed aXe report to: \`${axeDir}/${pdfFilename}-axe-report.json\`

#### 3C. Lighthouse Audit
Run Lighthouse audit for:
- **Performance**: LCP, TBT, CLS, Speed Index
- **SEO**: Meta tags, structured data, crawlability
- **Accessibility**: Lighthouse a11y checks (complements aXe)
- **Best Practices**: HTTPS, console errors, deprecated APIs

**Thresholds**:
- Performance: ≥75
- Accessibility: ≥90
- SEO: ≥85
- Best Practices: ≥80

Save Lighthouse JSON report to: \`${lighthouseDir}/${pdfFilename}-lighthouse.json\`

#### 3D. Core Web Vitals Measurement
Measure real user experience metrics:
- **LCP (Largest Contentful Paint)**: Target <2.5s
- **INP (Interaction to Next Paint)**: Target <200ms
- **CLS (Cumulative Layout Shift)**: Target <0.1

Use Lighthouse or browser performance APIs to capture these metrics.

### 4. Scoring (0-100 per dimension)

**SEO (25%)**: Based on Lighthouse SEO + meta tags + heading structure
**Accessibility (25%)**: Based on aXe violations + Lighthouse a11y + manual checks
**Visual Fidelity (20%)**: Based on visual diff analysis + layout comparison
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
      "lcp": 2.1,
      "inp": 180,
      "cls": 0.08,
      "passing": true
    }
  },
  "findings": [
    {
      "dimension": "Accessibility",
      "severity": "critical",
      "wcagLevel": "WCAG 2.2 AA",
      "rule": "image-alt",
      "issue": "5 images missing alt text",
      "recommendation": "Add descriptive alt text to all images",
      "affectedElements": ["img#hero", "img.product-1"],
      "impact": "Blocks screen reader users"
    },
    {
      "dimension": "Visual Fidelity",
      "severity": "medium",
      "issue": "Layout shift detected: 12,453 pixel difference (2.3%)",
      "recommendation": "Review spacing in hero section - appears compressed vs PDF",
      "diffImage": "output/screenshots/diff-${pdfFilename}.png"
    },
    {
      "dimension": "Performance",
      "severity": "high",
      "lighthouse": true,
      "issue": "LCP of 3.2s exceeds 2.5s threshold",
      "recommendation": "Optimize hero image: compress, resize, use WebP format"
    },
    {
      "dimension": "SEO",
      "severity": "medium",
      "lighthouse": true,
      "issue": "Missing meta description",
      "recommendation": "Add descriptive meta description (150-160 characters)"
    }
  ],
  "recommendations": [
    "Fix 5 images missing alt text (critical)",
    "Optimize hero image to improve LCP (high)",
    "Add meta description for SEO (medium)"
  ],
  "artifacts": {
    "baselineScreenshot": "${screenshotsDir}/baseline-${pdfFilename}.png",
    "migratedScreenshot": "${screenshotsDir}/migrated-${pdfFilename}.png",
    "visualDiff": "${screenshotsDir}/diff-${pdfFilename}.png",
    "lighthouseJson": "${lighthouseDir}/${pdfFilename}-lighthouse.json",
    "axeReport": "${axeDir}/${pdfFilename}-axe-report.json"
  },
  "metadata": {
    "evaluatedAt": "<ISO timestamp>",
    "evaluator": "cms-migration-evaluator-v1.0-phase3",
    "phase": 3,
    "source": "${input.pdfPath}",
    "migratedUrl": "${input.migratedUrl}",
    "tools": {
      "visualRegression": "odiff-bin + pdf2pic",
      "accessibility": "@axe-core/playwright",
      "performance": "playwright-lighthouse",
      "coreWebVitals": "Lighthouse + browser APIs"
    }
  }
}
\`\`\`

**Important Notes:**
1. Use Playwright MCP tools (already available) - do NOT try to install Playwright manually
2. For accessibility testing, use the @axe-core/playwright library via Bash
3. For Lighthouse, use playwright-lighthouse library via Bash
4. For visual comparison, analyze screenshots visually and calculate approximate pixel differences
5. Save all artifacts (screenshots, reports) to specified output directories
6. Ensure all findings have severity levels and actionable recommendations

Begin the comprehensive Phase 1+3 evaluation now.`;

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
