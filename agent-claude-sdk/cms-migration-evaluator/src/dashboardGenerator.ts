import { query } from "@anthropic-ai/claude-agent-sdk";
import * as fs from "fs";
import * as path from "path";

/**
 * Dashboard Generator using Agent SDK
 *
 * Generates interactive HTML dashboards from Phase 1 JSON evaluation reports.
 * Uses Chart.js for visualizations and generates self-contained HTML files.
 */

interface DashboardConfig {
  reportsDir: string;
  outputPath: string;
  title?: string;
}

interface EvaluationReport {
  summary: {
    overallScore: number;
    seoScore: number;
    accessibilityScore: number;
    visualFidelityScore: number;
    contentQualityScore: number;
    intentAlignmentScore: number;
    grade: string;
  };
  findings: Finding[];
  recommendations: string[];
  metadata: {
    evaluatedAt: string;
    evaluator: string;
    source: string;
    migratedUrl?: string;
  };
}

interface Finding {
  dimension: string;
  severity: string;
  issue: string;
  recommendation: string;
  location?: string;
}

export async function generateDashboard(
  config: DashboardConfig
): Promise<string> {
  console.log("\n🎨 Starting Dashboard Generation");
  console.log(`📂 Reading reports from: ${config.reportsDir}`);

  // Read all JSON reports from output/reports/
  const reportsDir = path.resolve(config.reportsDir);
  const reportFiles = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));

  if (reportFiles.length === 0) {
    throw new Error(`No JSON reports found in ${reportsDir}`);
  }

  console.log(`📊 Found ${reportFiles.length} report(s)`);

  // Load all evaluation reports
  const evaluationReports: EvaluationReport[] = [];
  for (const file of reportFiles) {
    const filePath = path.join(reportsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    evaluationReports.push(JSON.parse(content));
    console.log(`   ✓ Loaded ${file}`);
  }

  // Build prompt for Agent SDK to generate dashboard
  const absoluteOutputPath = path.resolve(config.outputPath);
  const prompt = buildDashboardPrompt(evaluationReports, absoluteOutputPath, config.title);

  console.log("\n🤖 Agent SDK: Generating interactive HTML dashboard...\n");

  const abortController = new AbortController();
  const agentMessages: string[] = [];
  let dashboardGenerated = false;

  for await (const message of query({
    prompt,
    options: {
      cwd: process.cwd(),
      abortController,
      maxTurns: 30,
      model: 'claude-sonnet-4-5-20250929',
      allowedTools: ['Write', 'Read'],
    }
  })) {
    // System init messages
    if (message.type === 'system' && message.subtype === 'init') {
      console.log('🔧 Agent initialized');
      console.log(`   Model: ${message.model}`);
    }

    // Assistant messages (text responses)
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text) {
          agentMessages.push(block.text);
          console.log(`💭 ${block.text}`);
        } else if (block.type === 'tool_use') {
          console.log(`🔧 Tool: ${block.name}`);
          if (block.name === 'Write') {
            console.log(`   Writing to: ${block.input.file_path}`);
            dashboardGenerated = true;
          }
        }
      }
    }

    // Tool results
    if (message.type === 'user' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'tool_result') {
          const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          const preview = content.substring(0, 100);
          console.log(`✅ Tool result: ${preview}${content.length > 100 ? '...' : ''}`);
        }
      }
    }
  }

  console.log('\n🏁 Agent SDK execution complete');
  console.log(`   Total agent messages: ${agentMessages.length}`);

  // Verify dashboard was created
  const outputPath = path.resolve(config.outputPath);
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Dashboard not created at ${outputPath}`);
  }

  console.log(`\n✅ Dashboard generated successfully!`);
  console.log(`📄 Output: ${outputPath}`);
  console.log(`📊 Reports analyzed: ${evaluationReports.length}`);

  return outputPath;
}

function buildDashboardPrompt(
  reports: EvaluationReport[],
  outputPath: string,
  title?: string
): string {
  const dashboardTitle = title || 'CMS Migration Quality Dashboard';

  return `You are an expert dashboard generation specialist. Generate a professional, self-contained HTML dashboard from the provided CMS migration evaluation reports.

**TASK**: Create a single HTML file that visualizes migration quality across ${reports.length} evaluation report(s).

**REQUIREMENTS**:

1. **Self-Contained HTML**:
   - Single HTML file with inline CSS and JavaScript
   - Use Chart.js 4.4.0 from CDN: https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
   - Embed all evaluation data directly in <script> tag (no external JSON files)
   - Should work offline after initial load

2. **Responsive Design**:
   - Use CSS Grid for layout (mobile-first approach)
   - Responsive breakpoints for mobile, tablet, desktop
   - Cards should reflow gracefully on smaller screens
   - Use CSS Custom Properties for theming

3. **Accessibility (WCAG 2.2 AA)**:
   - Semantic HTML5 (header, main, section, article)
   - ARIA labels on all charts and interactive elements
   - Color contrast ≥4.5:1 for all text
   - Keyboard navigation support
   - lang="en" attribute on <html>

4. **Print-Friendly**:
   - @media print styles to hide interactive controls
   - page-break-inside: avoid on cards
   - Charts should render clearly when printed

5. **Modern Design**:
   - Minimalist with ample white space
   - Limited color palette: primary (#2563eb), success (#10b981), warning (#f59e0b), danger (#ef4444)
   - Clean typography (system font stack)
   - Consistent spacing and visual hierarchy

**DASHBOARD STRUCTURE**:

1. **Header Section**:
   - Dashboard title: "${dashboardTitle}"
   - Generation timestamp
   - Summary statistics (total reports, average score, critical issues count)

2. **Executive Summary Card**:
   - Overall quality score (average of all reports): X/100 with grade badge
   - Total pages evaluated
   - Issue breakdown: Critical: X | High: X | Medium: X | Low: X
   - AI-generated narrative summary (2-3 sentences):
     * Analyze patterns across all reports
     * Connect technical findings to business impact
     * Highlight top 3 priority actions

3. **Charts Section** (use Chart.js):

   a) **Dimension Scores Bar Chart**:
      - Show average scores for: SEO, Accessibility, Visual Fidelity, Content Quality, Intent Alignment
      - Color-coded bars (use color palette above)
      - Horizontal bar chart for better label readability
      - Y-axis: Dimension names
      - X-axis: Score (0-100)

   b) **Overall Scores Distribution**:
      - If multiple reports: Show individual report scores
      - Use labels like "Report 1", "Report 2", etc. or extract page names from metadata
      - Grouped bar chart showing all 5 dimensions per report

   c) **Severity Breakdown Donut Chart**:
      - Total findings by severity across all reports
      - Segments: Critical (red), High (orange), Medium (yellow), Low (blue)
      - Center label showing total findings count

4. **Findings Table**:
   - Sortable and filterable table showing all findings
   - Columns: Dimension | Severity | Issue | Recommendation | Location
   - Filter buttons at top: [All] [Critical] [High] [Medium] [Low]
   - Sort by severity (critical first) by default
   - Severity badges with color coding
   - Responsive: stack columns on mobile

5. **Recommendations Section**:
   - Prioritized list of top recommendations across all reports
   - Group by severity
   - Show count of reports affected by each issue

6. **Footer**:
   - Report metadata (evaluator version, evaluation dates)
   - "Generated by CMS Migration Evaluator Phase 2"

**OUTPUT FILE**:
- CRITICAL: You MUST save the HTML file to this EXACT absolute path:
  ${outputPath}

**EVALUATION DATA**:
${JSON.stringify(reports, null, 2)}

**INSTRUCTIONS**:
1. Read the evaluation data above
2. Analyze patterns, calculate averages, identify top issues
3. Generate the complete HTML code (including <!DOCTYPE html>, <html>, <head>, <body>, inline <style>, inline <script>)
4. Use the Write tool to save the HTML to the EXACT path specified above: ${outputPath}
5. The dashboard should be production-ready and work when opened directly in a browser

Generate a beautiful, professional dashboard that stakeholders can use to understand migration quality at a glance.`;
}
