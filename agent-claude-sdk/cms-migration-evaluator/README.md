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

**Phase 1 (MVP)**: PDF → Migrated Webpage Comparison
- Agent SDK orchestrates PDF analysis + webpage capture
- Basic automated checks (text/metadata comparison)
- AI reasoning for quality assessment
- JSON reports with scores and findings

**Phase 2 ✅**: AI-Generated Quality Dashboard
- Agent SDK generates interactive HTML dashboards
- Chart.js visualizations (bar charts, donut charts, tables)
- Self-contained HTML (works offline)
- Responsive design (mobile, tablet, desktop)
- WCAG 2.2 AA accessible
- AI-generated executive summaries

## Project Structure

```
cms-migration-evaluator/
├── src/
│   ├── evaluator.ts              # Phase 1: Agent SDK evaluator
│   ├── cliEvaluator.ts           # Phase 1: CLI interface
│   ├── dashboardGenerator.ts     # Phase 2: Dashboard generator
│   └── cliDashboard.ts           # Phase 2: Dashboard CLI
├── output/
│   ├── reports/                  # Phase 1: JSON evaluation reports
│   └── dashboards/               # Phase 2: HTML dashboards
├── config/
│   ├── evaluation-criteria.json  # Scoring weights
│   └── default-config.json       # Default settings
└── examples/
    └── test-migration.json       # Example input
```

## Output Format

```json
{
  "summary": {
    "overallScore": 78,
    "seoScore": 85,
    "accessibilityScore": 72,
    "visualFidelityScore": 80,
    "contentQualityScore": 90,
    "intentAlignmentScore": 65,
    "grade": "good"
  },
  "findings": [
    {
      "dimension": "Accessibility",
      "severity": "high",
      "issue": "3 images missing alt text",
      "recommendation": "Add descriptive alt text to all images"
    }
  ],
  "metadata": {
    "evaluatedAt": "2025-12-13T20:15:00Z",
    "evaluator": "cms-migration-evaluator-v1.0",
    "source": "input/pdfs/ai-powered-package-tracking-2025.pdf"
  }
}
```

## Phase Roadmap

- **Phase 1** ✅ COMPLETE - PDF → Webpage comparison
- **Phase 2** ✅ COMPLETE - AI-generated quality dashboards
- **Phase 3** 📋 Planning - Enhanced visual regression + accessibility (Playwright MCP, Lighthouse, aXe)
- **Phase 4** 📋 Planning - JSON spec → Webpage validation
- **Phase 5** 📋 Planning - Source webpage → Migrated webpage comparison

## Usage

### Phase 1: Evaluate Migration Quality

```bash
# Evaluate single PDF → webpage migration
npm run evaluate examples/test-migration.json

# View report
cat output/reports/ai-powered-package-tracking-2025-report.json
```

**Output**: JSON report with:
- Overall score (0-100) + grade
- Scores per dimension (SEO, Accessibility, Visual, Content, Intent)
- 16+ findings with severity levels (critical, high, medium, low)
- Actionable recommendations

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

## Documentation

- **Full Plan**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/cms-migration-evaluator-plan.md`
- **Phase 1 Handoff**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-1-handoff.md`
- **Phase 2 Handoff**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/phase-2-handoff.md`
- **Init Prompt Log**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/init-prompt.md`

## Requirements

- Node.js 18+
- Anthropic API key (set in `.env`)
- Chart.js 4.4.0 (loaded from CDN in dashboards)
