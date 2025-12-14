import { query } from "@anthropic-ai/claude-agent-sdk";
import * as fs from "fs";
import * as path from "path";

/**
 * Batch Dashboard Generator - Phase 4
 *
 * Generates cumulative HTML dashboards from batch evaluation results.
 * Features: Aggregate view (stats, trends), Individual view (per-page cards),
 * Interactive filtering (score range, dimension, severity), search by page ID.
 */

interface BatchDashboardConfig {
  batchSummaryPath: string;
  reportsDir: string;
  outputPath: string;
  title?: string;
}

interface BatchSummary {
  batchName: string;
  totalEntries: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    id: string;
    success: boolean;
    reportPath?: string;
  }>;
  aggregateStatistics: {
    averageOverallScore: number;
    averageSeoScore: number;
    averageAccessibilityScore: number;
    averageVisualFidelityScore: number;
    averageContentQualityScore: number;
    averageIntentAlignmentScore: number;
    totalFindings: number;
    findingsBySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    coreWebVitalsPassRate: number;
    bestPerformingPage?: {
      id: string;
      score: number;
    };
    worstPerformingPage?: {
      id: string;
      score: number;
    };
    commonIssues: Array<{
      issue: string;
      count: number;
      severity: string;
    }>;
  };
  metadata: {
    startedAt: string;
    completedAt: string;
    totalDuration: number;
  };
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
    coreWebVitals?: {
      lcp: number;
      inp: number;
      cls: number;
      fcp: number;
      passing: boolean;
    };
    estimatedLighthouseScores?: {
      performance: number;
      accessibility: number;
      seo: number;
      bestPractices: number;
    };
  };
  findings: Array<{
    dimension: string;
    severity: string;
    issue: string;
    recommendation: string;
    wcagLevel?: string;
    rule?: string;
    affectedElements?: string[];
    impact?: string;
    helpUrl?: string;
  }>;
  recommendations: string[];
  metadata: {
    evaluatedAt: string;
    evaluator: string;
    source: string;
    migratedUrl?: string;
  };
}

export async function generateBatchDashboard(
  config: BatchDashboardConfig
): Promise<string> {
  console.log("\n🎨 Starting Cumulative Batch Dashboard Generation");
  console.log(`📂 Batch Summary: ${config.batchSummaryPath}`);
  console.log(`📂 Reports Directory: ${config.reportsDir}`);

  // Read batch summary
  const batchSummaryContent = fs.readFileSync(config.batchSummaryPath, 'utf-8');
  const batchSummary: BatchSummary = JSON.parse(batchSummaryContent);

  console.log(`📊 Batch: "${batchSummary.batchName}"`);
  console.log(`   Total Entries: ${batchSummary.totalEntries}`);
  console.log(`   Success: ${batchSummary.successCount}`);
  console.log(`   Failures: ${batchSummary.failureCount}`);

  // Read all successful individual reports
  const individualReports: Array<{ id: string; report: EvaluationReport }> = [];

  for (const result of batchSummary.results) {
    if (result.success && result.reportPath) {
      try {
        const reportContent = fs.readFileSync(result.reportPath, 'utf-8');
        const report: EvaluationReport = JSON.parse(reportContent);
        individualReports.push({ id: result.id, report });
        console.log(`   ✓ Loaded report: ${result.id}`);
      } catch (error) {
        console.warn(`   ⚠️  Failed to load report: ${result.id}`);
      }
    }
  }

  console.log(`📊 Loaded ${individualReports.length} individual report(s)\n`);

  // Build prompt for Agent SDK to generate cumulative dashboard
  const absoluteOutputPath = path.resolve(config.outputPath);
  const prompt = buildBatchDashboardPrompt(
    batchSummary,
    individualReports,
    absoluteOutputPath,
    config.title
  );

  console.log("🤖 Agent SDK: Generating cumulative HTML dashboard...\n");

  const abortController = new AbortController();
  const agentMessages: string[] = [];

  for await (const message of query({
    prompt,
    options: {
      cwd: process.cwd(),
      abortController,
      maxTurns: 40,
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

  console.log(`\n✅ Cumulative Dashboard generated successfully!`);
  console.log(`📄 Output: ${outputPath}`);
  console.log(`📊 Batch: ${batchSummary.batchName}`);
  console.log(`📊 Reports visualized: ${individualReports.length}`);

  return outputPath;
}

function buildBatchDashboardPrompt(
  batchSummary: BatchSummary,
  individualReports: Array<{ id: string; report: EvaluationReport }>,
  outputPath: string,
  title?: string
): string {
  const dashboardTitle = title || `${batchSummary.batchName} - Migration Quality Dashboard`;

  return `You are an expert cumulative dashboard generation specialist. Generate a professional, interactive HTML dashboard from batch migration evaluation results.

**TASK**: Create a cumulative dashboard visualizing migration quality across ${batchSummary.successCount} page(s) from batch "${batchSummary.batchName}".

**REQUIREMENTS**:

1. **Self-Contained HTML**:
   - Single HTML file with inline CSS and JavaScript
   - Use Chart.js 4.4.0 from CDN: https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js
   - Embed all batch + individual report data in <script> tag
   - Should work offline after initial load

2. **Responsive Design**:
   - CSS Grid for layout (mobile-first)
   - Breakpoints for mobile, tablet, desktop
   - Cards should reflow on smaller screens
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
   - Charts render clearly when printed

5. **Modern Design (2025 Best Practices)**:
   - Minimalist with ample white space
   - Color palette:
     - Primary: #2563eb (blue)
     - Success: #10b981 (green)
     - Warning: #f59e0b (orange)
     - Danger: #ef4444 (red)
     - Excellent (90-100): #10b981 (green)
     - Good (75-89): #3b82f6 (blue)
     - Acceptable (60-74): #f59e0b (yellow)
     - Needs Improvement (40-59): #f97316 (orange)
     - Critical (0-39): #ef4444 (red)
   - Clean typography (system font stack)
   - Consistent spacing and visual hierarchy

**DASHBOARD STRUCTURE**:

### 1. Header Section
- Dashboard title: "${dashboardTitle}"
- Generation timestamp
- Batch metadata:
  - Total Pages: ${batchSummary.totalEntries}
  - Evaluated Successfully: ${batchSummary.successCount}
  - Failed: ${batchSummary.failureCount}
  - Batch Duration: ${(batchSummary.metadata.totalDuration / 1000 / 60).toFixed(1)} minutes

### 2. Aggregate Summary Card

**Key Metrics Grid** (4 columns on desktop, 2 on tablet, 1 on mobile):
- **Average Overall Score**: ${batchSummary.aggregateStatistics.averageOverallScore.toFixed(1)}/100 with grade badge
- **Total Findings**: ${batchSummary.aggregateStatistics.totalFindings}
  - Critical: ${batchSummary.aggregateStatistics.findingsBySeverity.critical}
  - High: ${batchSummary.aggregateStatistics.findingsBySeverity.high}
  - Medium: ${batchSummary.aggregateStatistics.findingsBySeverity.medium}
  - Low: ${batchSummary.aggregateStatistics.findingsBySeverity.low}
- **Core Web Vitals Pass Rate**: ${batchSummary.aggregateStatistics.coreWebVitalsPassRate.toFixed(0)}%
- **Pages Evaluated**: ${batchSummary.successCount} of ${batchSummary.totalEntries}

**Best/Worst Performing Pages**:
${batchSummary.aggregateStatistics.bestPerformingPage ? `- 🏆 Best: "${batchSummary.aggregateStatistics.bestPerformingPage.id}" (${batchSummary.aggregateStatistics.bestPerformingPage.score}/100)` : ''}
${batchSummary.aggregateStatistics.worstPerformingPage ? `- ⚠️ Worst: "${batchSummary.aggregateStatistics.worstPerformingPage.id}" (${batchSummary.aggregateStatistics.worstPerformingPage.score}/100)` : ''}

**AI-Generated Narrative Summary** (3-4 sentences):
- Analyze overall batch quality trends
- Highlight most common issues (from aggregate statistics)
- Connect technical findings to business impact
- Mention Core Web Vitals pass rate
- Recommend top 3 priority actions across entire batch

### 3. Aggregate Charts Section (Chart.js)

**a) Score Distribution Histogram**:
- X-axis: Score ranges (0-39 Critical, 40-59 Needs Improvement, 60-74 Acceptable, 75-89 Good, 90-100 Excellent)
- Y-axis: Number of pages
- Color-coded bars by score range
- Show distribution of overall scores across all pages

**b) Average Dimension Scores (Horizontal Bar Chart)**:
- Y-axis: Dimension names (SEO, Accessibility, Visual Fidelity, Content Quality, Intent Alignment)
- X-axis: Average score (0-100)
- Show aggregate average scores from batch summary:
  - SEO: ${batchSummary.aggregateStatistics.averageSeoScore.toFixed(1)}/100
  - Accessibility: ${batchSummary.aggregateStatistics.averageAccessibilityScore.toFixed(1)}/100
  - Visual Fidelity: ${batchSummary.aggregateStatistics.averageVisualFidelityScore.toFixed(1)}/100
  - Content Quality: ${batchSummary.aggregateStatistics.averageContentQualityScore.toFixed(1)}/100
  - Intent Alignment: ${batchSummary.aggregateStatistics.averageIntentAlignmentScore.toFixed(1)}/100

**c) Findings Severity Distribution (Donut Chart)**:
- Segments: Critical (${batchSummary.aggregateStatistics.findingsBySeverity.critical}), High (${batchSummary.aggregateStatistics.findingsBySeverity.high}), Medium (${batchSummary.aggregateStatistics.findingsBySeverity.medium}), Low (${batchSummary.aggregateStatistics.findingsBySeverity.low})
- Center label: Total findings (${batchSummary.aggregateStatistics.totalFindings})
- Color-coded by severity

**d) Common Issues Bar Chart (Top 10)**:
- X-axis: Issue description (truncate if too long, show tooltip with full text)
- Y-axis: Number of pages affected
- Color-coded by severity
- Show top 10 most common issues from batch summary

### 4. Interactive Filters (Sticky Toolbar)

**Filter Controls** (horizontal button groups):
- **Score Range**: [All] [Excellent 90-100] [Good 75-89] [Acceptable 60-74] [Needs Improvement 40-59] [Critical 0-39]
- **Dimension**: [All] [SEO] [Accessibility] [Visual Fidelity] [Content Quality] [Intent Alignment]
- **Severity**: [All] [Critical] [High] [Medium] [Low]
- **Search Box**: "Search by page ID..." (filters individual page cards in real-time)

**Filter Behavior**:
- Clicking a filter button toggles it (active = highlighted with border)
- Filters apply to Individual Page Cards section (hide/show cards)
- Multiple filters combine with AND logic
- Reset button to clear all filters

### 5. Individual Page Cards Section

**Grid Layout**:
- 3 columns on desktop (>1200px)
- 2 columns on tablet (768px-1200px)
- 1 column on mobile (<768px)
- Cards should have equal heights in each row

**Each Card Contains**:

**a) Card Header**:
- Page ID as title (e.g., "ai-powered-package-tracking")
- Overall score badge (e.g., "73/100 - Acceptable") with color-coded background
- Collapsible toggle button (▼ expand / ▲ collapse)

**b) Mini Radar Chart** (Chart.js radar chart, 150px x 150px):
- 5 dimensions: SEO, Accessibility, Visual Fidelity, Content Quality, Intent Alignment
- Show individual page scores on radar
- Scale: 0-100
- Fill area with semi-transparent color

**c) Top 3 Findings** (collapsed by default, expand on click):
- Show severity badge, dimension, and issue description
- Truncate long issues with "..." and show full text in tooltip
- Color-coded by severity (critical: red, high: orange, medium: yellow, low: blue)

**d) Core Web Vitals Status** (if available):
- Show "✅ Passing" or "⚠️ Failing" based on coreWebVitals.passing
- Display LCP, INP, CLS values if available

**e) Quick Stats**:
- Total Findings: X
- Critical: X | High: X | Medium: X | Low: X

**f) Link to Full Report**:
- Button: "View Full Report →" (links to individual JSON report path, or shows "Report not available" if file missing)

### 6. Footer
- Batch metadata:
  - Batch Name: "${batchSummary.batchName}"
  - Evaluated: ${batchSummary.metadata.startedAt} to ${batchSummary.metadata.completedAt}
  - Total Duration: ${(batchSummary.metadata.totalDuration / 1000 / 60).toFixed(1)} minutes
- "Generated by CMS Migration Evaluator Phase 4"

**OUTPUT FILE**:
- CRITICAL: You MUST save the HTML file to this EXACT absolute path:
  ${outputPath}

**BATCH SUMMARY DATA**:
${JSON.stringify(batchSummary, null, 2)}

**INDIVIDUAL REPORTS DATA**:
${JSON.stringify(individualReports, null, 2)}

**INSTRUCTIONS**:
1. Read the batch summary and individual reports data above
2. Analyze aggregate trends, calculate score distributions, identify top common issues
3. Generate the complete HTML code (including <!DOCTYPE html>, <html>, <head>, <body>, inline <style>, inline <script>)
4. Implement interactive filtering with vanilla JavaScript (filter cards based on score range, dimension, severity, search)
5. Use Chart.js 4.4.0 for all charts (score distribution histogram, average dimension scores, severity donut, common issues bar, mini radar charts)
6. Ensure all data is embedded inline (no external JSON files)
7. Use the Write tool to save the HTML to the EXACT path specified above: ${outputPath}
8. The dashboard should be production-ready, work offline, and provide stakeholders with both high-level aggregate insights and detailed per-page drilldown

Generate a beautiful, professional cumulative dashboard that helps stakeholders understand migration quality across the entire batch at a glance, with the ability to drill down into individual pages.`;
}
