# CMS Migration Evaluator

AI-powered quality evaluation for CMS migrations using Claude Agent SDK.

## What This Does

Compares expected content (PDFs, specs, original pages) against actual migrated webpages to assess migration quality across 5 dimensions:

- **SEO** (25%): Metadata, heading structure, readability
- **Accessibility** (25%): WCAG compliance, alt text, contrast
- **Visual Fidelity** (20%): Layout preservation, typography, spacing
- **Content Quality** (20%): Data integrity, structure, completeness
- **Intent Alignment** (10%): Messaging, tone, purpose (AI reasoning)

## Quick Start

```bash
# Install dependencies
npm install

# Phase 1: PDF → Webpage comparison
npm run evaluate examples/test-migration.json

# Phase 2: Generate AI-powered dashboard
npm run dashboard

# Phase 4: Batch evaluation (1-50 pages)
npm run evaluate:batch input/test-migration.json

# Phase 4: Generate cumulative batch dashboard
npm run dashboard:batch

# Open dashboard in browser
open output/dashboards/migration-quality-dashboard.html
```

**Example Input** (`examples/test-migration.json`):
```json
{
  "pdfPath": "../blog-pdf-generator/output/bulk-pdfs/ai-powered-package-tracking-2025.pdf",
  "migratedUrl": "https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-2025-12-13/ai-powered-package-tracking"
}
```

## Architecture

**Phase 1+3+4.5 ✅**: Enhanced PDF → Migrated Webpage Comparison (MCP Tools Only)
- Agent SDK orchestrates comprehensive migration evaluation using Playwright MCP tools
- **Visual Comparison**: PDF content description vs webpage screenshot (visual analysis)
- **Accessibility**: Manual WCAG 2.2 AA analysis from accessibility snapshots
- **Performance**: Core Web Vitals (LCP, FCP, CLS) via browser performance APIs
- **Content Quality**: Text/metadata/structure validation
- **AI Reasoning**: Intent alignment and subjective quality assessment
- Enhanced JSON reports with estimated Lighthouse scores
- **Phase 4.5 Fix**: Evaluator uses Playwright MCP tools directly (no script creation)

**Phase 2 ✅**: AI-Generated Quality Dashboard
- Agent SDK generates interactive HTML dashboards
- Chart.js visualizations (bar charts, donut charts, tables)
- Self-contained HTML (works offline)
- Responsive design (mobile, tablet, desktop)
- WCAG 2.2 AA accessible
- AI-generated executive summaries

**Phase 4 ✅**: Batch Orchestration + Cumulative Dashboard
- Sequential processing of 1-50 migration entries
- Batch summary with aggregate statistics
- Continue-on-error pattern with detailed logging
- Cumulative dashboard with aggregate + individual views
- Interactive filtering (score range, dimension, severity, search)
- Best/worst performing pages, common issues analysis
- Core Web Vitals pass rate tracking

## Project Structure

```
cms-migration-evaluator/
├── src/
│   ├── evaluator.ts              # Phase 1+3: Enhanced Agent SDK evaluator
│   ├── cliEvaluator.ts           # Phase 1+3: CLI interface
│   ├── dashboardGenerator.ts     # Phase 2: Dashboard generator
│   ├── cliDashboard.ts           # Phase 2: Dashboard CLI
│   ├── batchEvaluator.ts         # Phase 4: Batch orchestrator
│   ├── cliBatch.ts               # Phase 4: Batch evaluation CLI
│   ├── batchDashboardGenerator.ts # Phase 4: Cumulative dashboard generator
│   └── cliBatchDashboard.ts      # Phase 4: Batch dashboard CLI
├── input/
│   └── test-migration.json       # Batch input (3 entries)
├── output/
│   ├── reports/                  # Phase 1+3+4: JSON evaluation reports + batch summaries
│   ├── screenshots/              # Phase 3: Baseline + migrated + diff images
│   ├── axe-reports/              # Phase 3: WCAG 2.2 AA violation reports
│   ├── lighthouse-reports/       # Phase 3: Performance audit reports
│   ├── dashboards/               # Phase 2+4: Interactive HTML dashboards
│   └── playwright-validation/    # Temporary test scripts (if generated)
├── config/
│   ├── evaluation-criteria.json  # Scoring weights
│   └── default-config.json       # Default settings
└── examples/
    └── batch-migrations.json     # Example batch input
```

## Output Format (Phase 3 Enhanced)

```json
{
  "summary": {
    "overallScore": 73,
    "seoScore": 100,
    "accessibilityScore": 55,
    "visualFidelityScore": 40,
    "contentQualityScore": 80,
    "intentAlignmentScore": 100,
    "grade": "acceptable",
    "coreWebVitals": {
      "lcp": 0.424,
      "inp": 0,
      "cls": 0,
      "fcp": 0.424,
      "passing": true
    },
    "estimatedLighthouseScores": {
      "performance": 95,
      "accessibility": 55,
      "seo": 100,
      "bestPractices": 90
    }
  },
  "findings": [
    {
      "dimension": "Accessibility",
      "severity": "high",
      "wcagLevel": "WCAG 2.2 AA",
      "rule": "color-contrast",
      "issue": "Elements must meet minimum color contrast ratio thresholds",
      "recommendation": "Ensure contrast meets WCAG 2 AA minimum (4.5:1)",
      "affectedElements": ["a[href$=\"docs/\"]"],
      "impact": "Element has insufficient color contrast of 3.67",
      "helpUrl": "https://dequeuniversity.com/rules/axe/4.10/color-contrast"
    }
  ],
  "artifacts": {
    "baselineScreenshot": "output/screenshots/baseline-*.png",
    "migratedScreenshot": "output/screenshots/migrated-*.png",
    "visualDiff": "output/screenshots/diff-*.png",
    "lighthouseJson": "output/lighthouse-reports/*-lighthouse.json",
    "axeReport": "output/axe-reports/*-axe-report.json"
  },
  "metadata": {
    "evaluatedAt": "2025-12-13T20:15:00Z",
    "evaluator": "cms-migration-evaluator-v1.0-phase3",
    "phase": 3,
    "source": "input/pdfs/ai-powered-package-tracking-2025.pdf"
  }
}
```

## Phase Roadmap

- **Phase 1** ✅ COMPLETE - PDF → Webpage comparison
- **Phase 2** ✅ COMPLETE - AI-generated quality dashboards
- **Phase 3** ✅ COMPLETE - Enhanced visual regression + accessibility + performance
- **Phase 4** ✅ COMPLETE - Batch orchestration + cumulative dashboard
- **Phase 4.5** ✅ COMPLETE - Evaluator fix (Playwright MCP tools only, no script creation)
- **Phase 5** 📋 Planning - JSON spec → Webpage validation
- **Phase 6** 📋 Planning - Source webpage → Migrated webpage comparison

## Usage

### Phase 1+3: Evaluate Migration Quality (Enhanced)

```bash
# Run comprehensive evaluation (includes Phase 3 enhancements)
npm run evaluate examples/test-migration.json

# View enhanced report
cat output/reports/ai-powered-package-tracking-2025-report.json

# View Core Web Vitals
cat output/reports/ai-powered-package-tracking-2025-report.json | jq '.summary.coreWebVitals'

# View accessibility violations
cat output/axe-reports/ai-powered-package-tracking-2025-axe-report.json | jq '.violations[] | {rule: .id, severity: .impact, nodes: .nodes | length}'

# Compare visual screenshots
open output/screenshots/baseline-ai-powered-package-tracking-2025.png
open output/screenshots/migrated-ai-powered-package-tracking-2025.png
```

**Output**: Enhanced JSON report with:
- **Overall score** (0-100) + grade
- **Dimension scores**: SEO, Accessibility, Visual Fidelity, Content Quality, Intent Alignment
- **Core Web Vitals**: LCP, INP, CLS, FCP with passing status
- **Estimated Lighthouse scores**: Performance, Accessibility, SEO, Best Practices
- **Enhanced findings** with:
  - Severity levels (critical, high, medium, low)
  - WCAG 2.2 AA rule violations
  - Affected elements (CSS selectors)
  - Help URLs for fixing issues
  - Impact descriptions
- **Artifacts**:
  - Baseline screenshot (PDF first page as PNG)
  - Migrated webpage screenshot
  - Visual diff image (when differences found)
  - aXe accessibility report (JSON)
  - Lighthouse audit (JSON)

### Phase 2: Generate Dashboard

```bash
# Generate interactive HTML dashboard from all reports
npm run dashboard

# Or with custom title
npm run dashboard -- --title "Q4 2025 Migration Report"

# Open in browser
open output/dashboards/migration-quality-dashboard.html
```

**Output**: Self-contained HTML dashboard with:
- Executive summary with AI-generated insights
- Interactive charts (Chart.js)
- Filterable findings table
- Prioritized recommendations
- Works offline, responsive, accessible (WCAG 2.2 AA)

## Phase 4.5 Note: Simplified MCP-Only Approach

**What Changed**: Evaluator now uses Playwright MCP tools directly instead of creating temporary scripts.

**What We Lost** (vs Phase 3 with scripts):
- ❌ Full Lighthouse audit (official scores)
- ❌ Full aXe WCAG scan (automated violation detection)
- ❌ Pixel-perfect visual diff (ODiff comparison)
- ❌ PDF→PNG baseline conversion

**What We Gained**:
- ✅ No script failures (playwright-lighthouse setup errors eliminated)
- ✅ Cleaner codebase (no temporary scripts in root)
- ✅ Reliable batch processing (no script-related failures)
- ✅ Follows architecture principle (MCP tools via Agent SDK)

**Report Quality**: Still provides actionable findings with estimated scores based on manual analysis.

**Documentation**:
- **Phase 4.5 Handoff**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-4.5-handoff.md` - Implementation details and trade-offs
- **Phase 4.5 Plan**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-4.5-plan.md` - Original plan

## Documentation

- **Full Plan**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/cms-migration-evaluator-plan.md`
- **Phase 1 Handoff**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-1-handoff.md`
- **Phase 2 Handoff**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-2-handoff.md`
- **Phase 3 Handoff**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-3-handoff.md`
- **Phase 4 Handoff**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-4-handoff.md`
- **Phase 4.5 Handoff**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-4.5-handoff.md`
- **Init Prompt Log**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/init-prompt.md`

## Requirements

**Runtime**:
- Node.js 18+
- Anthropic API key (set in `.env`)

**Phase 1+3 Dependencies**:
- `@anthropic-ai/claude-agent-sdk` - Agent orchestration
- `pdf-parse`, `pdf2pic` - PDF processing
- `playwright`, `@axe-core/playwright` - Accessibility testing
- `playwright-lighthouse`, `lighthouse` - Performance audits
- `web-vitals` - Core Web Vitals measurement
- `odiff-bin`, `pixelmatch`, `pngjs` - Visual regression
- PyMuPDF (`pip3 install PyMuPDF`) - PDF→PNG conversion

**Phase 2 Dependencies**:
- Chart.js 4.4.0 (loaded from CDN in dashboards)
