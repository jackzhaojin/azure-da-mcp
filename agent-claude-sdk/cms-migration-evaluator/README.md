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

# Run Phase 1: PDF → Webpage comparison
npm run evaluate examples/test-migration.json

# Example input file:
{
  "pdfPath": "input/pdfs/ai-powered-package-tracking-2025.pdf",
  "migratedUrl": "https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-2025-12-13/ai-powered-package-tracking"
}
```

## Architecture

**Phase 1 (MVP)**: PDF → Migrated Webpage Comparison
- Agent SDK orchestrates PDF analysis + webpage capture
- Basic automated checks (text/metadata comparison)
- AI reasoning for quality assessment
- JSON reports with scores and findings

## Project Structure

```
cms-migration-evaluator/
├── src/
│   ├── evaluator.ts              # Agent SDK orchestrator
│   ├── cliEvaluator.ts           # CLI interface
│   └── utils/
│       └── promptLoader.ts       # Load evaluation prompts
├── prompts/
│   └── pdf-webpage-evaluation.md # Agent SDK evaluation prompt
├── input/
│   └── pdfs/                     # PDF files to evaluate
├── output/
│   └── reports/                  # JSON evaluation reports
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

- **Phase 1** ✅ MVP - PDF → Webpage comparison (current)
- **Phase 2** 📋 Planning - AI-generated dashboard
- **Phase 3** 📋 Planning - Enhanced visual regression + accessibility
- **Phase 4** 📋 Planning - JSON spec → Webpage validation
- **Phase 5** 📋 Planning - Source webpage → Migrated webpage

## Documentation

- **Plan**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/cms-migration-evaluator-plan.md`
- **Init Prompt Log**: `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/cms-migration-evaluator/init-prompt.md`
