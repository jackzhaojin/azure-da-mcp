# CMS Migration Evaluator

> **⚠️ DEPRECATED (2025-12-27)**
>
> This Claude Agent SDK implementation is deprecated. A new Next.js-based implementation is being developed at `azure-da-mcp/content-authoring-eval/`.
>
> **Why deprecated:**
> - Complex context management with Agent SDK
> - Script generation issues requiring Phase 4.5 fix
> - Difficult to extend with parallel agents
>
> **New approach:** Next.js + ShadCN with 4 parallel evaluation agents (Structure, Accessibility, Content Fidelity, Visual Correctness), each with deterministic + agentic components.
>
> **Planning docs:** See `eds-ai-editor-ai-instructions/ai-docs/content-authoring-eval/`

---

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

# Single evaluation: PDF → Webpage comparison
npm run evaluate examples/test-migration.json

# Batch evaluation: Process 1-50 migrations
npm run evaluate:batch input/test-migration.json

# Generate interactive HTML dashboard
npm run dashboard

# Open dashboard in browser
open output/dashboards/migration-quality-dashboard.html
```

**Example Input** (`examples/single-test.json`):
```json
{
  "outputFolderName": "single-test-2025-12-21-2030",
  "pdfPath": "../blog-pdf-generator/output/bulk-pdfs/ai-powered-package-tracking-2025.pdf",
  "migratedUrl": "https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-2025-12-13/ai-powered-package-tracking"
}
```

**Important:** The `outputFolderName` field determines the exact output folder name (e.g., `output/single-test-2025-12-21-2030/`). **You control the timestamp/date in the JSON file** - the code does not add timestamps automatically. Format recommendation: `{name}-YYYY-MM-DD-HHmm`

## Architecture: Deterministic vs Agentic

This project uses a **hybrid architecture** where deterministic TypeScript code orchestrates AI agents to perform complex evaluation tasks.

### The Pattern

```
┌─────────────────────────────────────────────────────────┐
│  DETERMINISTIC (TypeScript)                            │
│  ├── File I/O validation                               │
│  ├── Batch orchestration (loops, error handling)       │
│  ├── Prompt construction                               │
│  ├── Agent SDK invocation                              │
│  └── Output validation                                 │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  AGENTIC (Claude via Agent SDK)                        │
│  ├── PDF content analysis                              │
│  ├── Webpage testing (Playwright MCP)                  │
│  ├── Quality scoring (AI reasoning)                    │
│  ├── Finding recommendations                           │
│  └── HTML dashboard generation                         │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────┐
│  TOOLS (via MCP)                                        │
│  ├── Read (PDFs, files)                                │
│  ├── Write (JSON reports, HTML dashboards)             │
│  └── Playwright MCP (browser automation)               │
└─────────────────────────────────────────────────────────┘
```

### Deterministic vs Agentic Breakdown

| Component | Type | Responsibility | Technology |
|-----------|------|----------------|------------|
| **CLI Entry Points** | Deterministic | Parse arguments, load input files | TypeScript |
| **Batch Orchestrator** | Deterministic | Sequential processing, error handling, aggregate statistics | TypeScript (for loop, try/catch) |
| **Prompt Builder** | Deterministic | Construct detailed prompts with runtime values | TypeScript template strings |
| **Agent SDK Invocation** | Deterministic | Configure and invoke `query()`, process streaming messages | TypeScript (`@anthropic-ai/claude-agent-sdk`) |
| **Output Validation** | Deterministic | Verify files created, check JSON structure | TypeScript (file system checks) |
| **PDF Analysis** | Agentic | Extract text, identify structure, understand content | Claude (via Read tool) |
| **Webpage Testing** | Agentic | Navigate, capture snapshots, extract metrics | Claude (via Playwright MCP) |
| **Quality Scoring** | Agentic | Evaluate SEO, accessibility, visual fidelity, content, intent | Claude (AI reasoning + automated checks) |
| **Finding Generation** | Agentic | Identify issues, categorize severity, recommend fixes | Claude (AI analysis) |
| **Dashboard Generation** | Agentic | Analyze reports, create visualizations, generate HTML | Claude (via Write tool) |

### Example: Evaluator Flow

**Deterministic Code** (`evaluator.ts:32-70`):
```typescript
export async function evaluateMigration(input: EvaluationInput) {
  // 1. Validate inputs (deterministic)
  const pdfExists = await fs.access(input.pdfPath).then(() => true).catch(() => false);
  if (!pdfExists) {
    return { success: false, error: `PDF not found: ${input.pdfPath}` };
  }

  // 2. Prepare output directories (deterministic)
  const outputDir = input.outputDir || path.join(process.cwd(), 'output', 'reports');
  await fs.mkdir(outputDir, { recursive: true });

  // 3. Build prompt with runtime values (deterministic)
  const prompt = buildEvaluationPrompt(input);

  // 4. Invoke agent (agentic)
  for await (const message of query({ prompt, options: {...} })) {
    // Handle streaming messages...
  }

  // 5. Validate output (deterministic)
  const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
  if (!reportExists) {
    return { success: false, error: 'Report not created' };
  }

  return { success: true, reportPath };
}
```

**Agentic Work** (Inside `query()` via prompt):
- Claude reads PDF using Read tool
- Claude navigates to webpage using `mcp__playwright__browser_navigate`
- Claude captures accessibility snapshot using `mcp__playwright__browser_snapshot`
- Claude extracts Core Web Vitals using `mcp__playwright__browser_evaluate`
- Claude compares PDF vs webpage (AI reasoning)
- Claude scores each dimension (0-100)
- Claude generates findings with recommendations
- Claude writes JSON report using Write tool

## Output Folder Structure

Each evaluation run creates a **named directory** (you control the name via JSON):

**Key Principle:** The `outputFolderName` field in your JSON determines the actual folder name. Other fields like `batchName` are for display/logging only.

```
output/
├── 2025-12-20-or-before/         # Archive of pre-timestamp runs
├── test-migration-2025-12-21-1545/  # Single evaluation run (format: {name}-{timestamp})
│   ├── reports/
│   │   └── ai-powered-package-tracking-2025-report.json
│   ├── screenshots/
│   │   └── migrated-*.png
│   ├── dashboards/
│   │   └── migration-quality-dashboard.html
│   ├── lighthouse-reports/
│   └── axe-reports/
└── batch-migration-2025-12-21-1612/  # Batch evaluation run
    ├── reports/
    │   ├── page-1-report.json
    │   ├── page-2-report.json
    │   └── batch-summary.json
    ├── screenshots/
    ├── dashboards/
    │   └── migration-batch-dashboard.html
    ├── lighthouse-reports/
    └── axe-reports/
```

**Recommended Timestamp Format:** `YYYY-MM-DD-HHmm` (e.g., `2025-12-21-1545` = Dec 21, 2025 at 3:45 PM)

**Folder Naming:**
- Single evaluations: Use `outputFolderName` in JSON (e.g., `"single-test-2025-12-21-2030"`)
- Batch evaluations: Use `config.outputFolderName` in JSON (e.g., `"batch-migration-2025-12-21-2030"`)
- If omitted: Falls back to PDF filename or batch name (without timestamp)

**Benefits:**
- Each run is isolated (no file conflicts)
- Easy to compare runs over time
- Clean separation between test cases
- **You control the naming** - timestamp/date in JSON, not code
- Archive old runs without losing history

## Project Structure

```
cms-migration-evaluator/
├── src/
│   ├── evaluator.ts              # Single evaluation (deterministic wrapper + agentic evaluation)
│   ├── cliEvaluator.ts           # CLI for single evaluation
│   ├── batchEvaluator.ts         # Batch orchestration (deterministic)
│   ├── cliBatch.ts               # CLI for batch evaluation
│   ├── dashboardGenerator.ts     # Dashboard generation (deterministic wrapper + agentic HTML generation)
│   ├── cliDashboard.ts           # CLI for dashboard
│   ├── batchDashboardGenerator.ts # Batch dashboard (agentic)
│   ├── cliBatchDashboard.ts      # CLI for batch dashboard
│   └── utils/
│       └── outputPaths.ts        # Timestamped directory management
├── input/
│   └── *.json                    # Evaluation inputs (single or batch)
├── output/
│   └── {name}-{timestamp}/       # Timestamped run directories (see above)
├── config/
│   ├── evaluation-criteria.json  # Scoring weights and thresholds
│   └── default-config.json       # Default settings
└── .claude/skills/cms-eval/
    └── SKILL.md                  # Skill documentation for Claude Code
```

## Capabilities

### 1. Single Migration Evaluation

**Command:**
```bash
npm run evaluate examples/test-migration.json
```

**What's Deterministic:**
- Input file parsing
- PDF path validation
- Output directory creation
- Prompt construction
- Result validation

**What's Agentic:**
- PDF content extraction and analysis
- Webpage navigation and testing
- Quality scoring across 5 dimensions
- Finding generation with severity levels
- JSON report writing

**Output:** `output/{name}-{timestamp}/reports/{name}-report.json`

Example: `output/test-migration-2025-12-21-1545/reports/ai-powered-package-tracking-2025-report.json`

### 2. Batch Processing

**Command:**
```bash
npm run evaluate:batch input/batch-migrations.json
```

**Batch Input Format:**
```json
{
  "batchName": "Q4 2025 Migration Batch",
  "entries": [
    {
      "id": "page-1",
      "pdfPath": "input/pdfs/page-1.pdf",
      "migratedUrl": "https://site.com/page-1"
    },
    {
      "id": "page-2",
      "pdfPath": "input/pdfs/page-2.pdf",
      "migratedUrl": "https://site.com/page-2"
    }
  ],
  "config": {
    "continueOnError": true,
    "outputFolderName": "batch-migration-2025-12-21-2030"
  }
}
```

**Field Purposes:**
- **`batchName`** - Display name shown in logs and reports (for humans)
- **`config.outputFolderName`** - **Actual folder name** that determines output directory

**Important:** Only `outputFolderName` drives the folder creation. The `batchName` is just for nomenclature/display. **Include the timestamp in the JSON** - the code does not add it automatically. If `outputFolderName` is omitted, falls back to sanitized `batchName` (lowercase, hyphens).

**What's Deterministic:**
- Sequential processing (for loop)
- Error handling (try/catch, continueOnError)
- Progress logging
- Aggregate statistics calculation
- Batch summary generation

**What's Agentic:**
- Each individual evaluation (same as single evaluation)

**Output:** (all within one timestamped directory)
- Individual reports: `output/{name}-{timestamp}/reports/{id}-report.json` (one per entry)
- Batch summary: `output/{name}-{timestamp}/reports/batch-summary.json`

Example: `output/q4-migration-2025-12-21-1612/reports/batch-summary.json`

### 3. Interactive Dashboard Generation

**Command:**
```bash
npm run dashboard
```

**What's Deterministic:**
- Load JSON reports from disk
- Build dashboard generation prompt
- Invoke Agent SDK
- Verify HTML file created

**What's Agentic:**
- Analyze reports for patterns
- Generate executive summary (AI narrative)
- Create Chart.js visualizations
- Build responsive HTML with inline CSS/JS
- Implement filtering/sorting logic

**Output:** `output/{latest-run}/dashboards/migration-quality-dashboard.html`

The dashboard is generated in the **latest evaluation run directory**. The CLI automatically finds the most recent timestamped directory.

**Dashboard Features:**
- Executive summary with AI-generated insights
- Overall quality score + grade badge
- Dimension scores bar chart (SEO, Accessibility, Visual Fidelity, Content Quality, Intent Alignment)
- Core Web Vitals metrics (LCP, INP, CLS, FCP)
- Estimated Lighthouse scores
- Filterable findings table (by severity)
- Prioritized recommendations
- Responsive design (mobile, tablet, desktop)
- WCAG 2.2 AA accessible
- Self-contained (works offline after initial load)

## Output Format

### Evaluation Report (JSON)

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
      "fcp": 0.424,
      "cls": 0,
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
      "issue": "5 images missing alt text",
      "recommendation": "Add descriptive alt text to all images",
      "location": "Main content section"
    }
  ],
  "recommendations": [
    "Fix 5 images missing alt text (critical)",
    "Review hero section spacing (medium)"
  ],
  "metadata": {
    "evaluatedAt": "2025-12-13T20:15:00Z",
    "evaluator": "cms-migration-evaluator-v1.0",
    "source": "input/pdfs/blog-post.pdf",
    "migratedUrl": "https://site.com/migrated/blog-post"
  }
}
```

### Batch Summary (JSON)

Saved to: `output/{outputFolderName}/reports/batch-summary.json`

```json
{
  "batchName": "Q4 2025 Migration Batch",
  "totalEntries": 50,
  "successCount": 48,
  "failureCount": 2,
  "aggregateStatistics": {
    "averageOverallScore": 78.5,
    "totalFindings": 234,
    "findingsBySeverity": {
      "critical": 12,
      "high": 45,
      "medium": 98,
      "low": 79
    },
    "coreWebVitalsPassRate": 92,
    "bestPerformingPage": { "id": "homepage", "score": 95 },
    "worstPerformingPage": { "id": "legacy-form", "score": 42 },
    "commonIssues": [
      { "issue": "Missing alt text on images", "count": 23, "severity": "high" },
      { "issue": "Poor color contrast", "count": 18, "severity": "medium" }
    ]
  }
}
```

## How Prompts Work

Prompts are **detailed instructions embedded in TypeScript** that tell Claude exactly what to do. They're constructed deterministically but executed by AI.

**Example Prompt Snippet** (`evaluator.ts:73-106`):
```typescript
const prompt = `You are an expert CMS migration quality evaluator.

**Task:** Comprehensive migration quality evaluation across 5 dimensions

**Required Tool Workflow:**

### 1. PDF Analysis (Baseline)
Read PDF at: ${input.pdfPath}

Use the Read tool to extract:
- Text content and structure
- Headings, sections, paragraphs
- Image descriptions (if visible)

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
  time: 3
})
\`\`\`

... (200+ lines of detailed instructions)

Save report to: ${reportPath}
`;
```

**Key Characteristics:**
- Runtime values injected via template strings (`${input.pdfPath}`)
- Step-by-step workflow with exact tool syntax
- Output format specification (JSON schema)
- Edge case handling instructions
- Tool usage examples with TypeScript code blocks

## Requirements

**Runtime:**
- Node.js 18+
- Anthropic API key (set in `.env`)

**Dependencies:**
- `@anthropic-ai/claude-agent-sdk` - Agent orchestration
- `pdf-parse` - PDF text extraction
- Playwright MCP server configured in `~/.config/claude/settings.json`

**MCP Setup:**

Add Playwright MCP server to your Claude settings:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@executeautomation/playwright-mcp-server"]
    }
  }
}
```

## Configuration

### Evaluation Criteria (`config/evaluation-criteria.json`)

```json
{
  "weights": {
    "seo": 0.25,
    "accessibility": 0.25,
    "visualFidelity": 0.20,
    "contentQuality": 0.20,
    "intentAlignment": 0.10
  },
  "thresholds": {
    "excellent": 90,
    "good": 75,
    "acceptable": 60,
    "needsImprovement": 40,
    "critical": 0
  },
  "wcagLevel": "AA",
  "minContrast": 4.5
}
```

### Default Config (`config/default-config.json`)

```json
{
  "evaluation": {
    "includeAIReasoning": true,
    "captureScreenshots": true,
    "runAutomatedChecks": true,
    "verbose": false
  },
  "playwright": {
    "viewport": { "width": 1920, "height": 1080 },
    "timeout": 30000
  }
}
```

## Trade-offs: MCP-Only Approach

This evaluator uses **only Playwright MCP tools** (no external scripts). This design choice has trade-offs:

**Benefits:**
- ✅ No script failures (eliminates playwright-lighthouse setup errors)
- ✅ Cleaner codebase (no temporary scripts in project root)
- ✅ Reliable batch processing (fewer moving parts)
- ✅ Follows Agent SDK architecture principles

**Limitations:**
- ❌ No official Lighthouse scores (estimated scores based on manual analysis)
- ❌ No automated aXe WCAG scans (manual accessibility analysis from snapshots)
- ❌ No pixel-perfect visual diff (visual analysis only)

**Result Quality:** Still provides actionable findings with estimated scores suitable for migration quality assessment.

## Usage Examples

### Single Evaluation

```bash
# Create input file
cat > examples/my-migration.json <<EOF
{
  "pdfPath": "input/pdfs/my-page.pdf",
  "migratedUrl": "https://site.com/migrated/my-page"
}
EOF

# Run evaluation
npm run evaluate examples/my-migration.json

# View report
cat output/reports/my-page-report.json | jq '.summary'
```

### Batch Evaluation

```bash
# Create batch input
cat > input/my-batch.json <<EOF
{
  "batchName": "Homepage Migration",
  "entries": [
    {
      "id": "homepage",
      "pdfPath": "input/pdfs/homepage.pdf",
      "migratedUrl": "https://site.com/homepage"
    },
    {
      "id": "about",
      "pdfPath": "input/pdfs/about.pdf",
      "migratedUrl": "https://site.com/about"
    }
  ],
  "config": {
    "continueOnError": true,
    "outputFolderName": "homepage-migration-2025-12-21-1600"
  }
}
EOF

# Run batch evaluation
npm run evaluate:batch input/my-batch.json

# Generate dashboard
npm run dashboard

# Open dashboard
open output/dashboards/migration-quality-dashboard.html
```

### View Batch Statistics

```bash
# View batch summary
cat output/reports/batch-summary-*.json | jq '.aggregateStatistics'

# Find worst performing pages
cat output/reports/batch-summary-*.json | jq '.aggregateStatistics.worstPerformingPage'

# List common issues
cat output/reports/batch-summary-*.json | jq '.aggregateStatistics.commonIssues[:5]'
```

## Development

```bash
# Build TypeScript
npm run build

# Run in development mode (with tsx)
npm run dev

# Clean output directories
npm run clean
```

## Project Philosophy

This project demonstrates a **hybrid architecture pattern** for Agent SDK:

1. **TypeScript handles orchestration** - File I/O, loops, error handling, validation
2. **Prompts encode expertise** - Detailed instructions as "code written in English"
3. **Agents execute complex tasks** - PDF analysis, webpage testing, quality scoring, HTML generation
4. **Tools provide capabilities** - Read/Write for files, Playwright MCP for browser automation

The key insight: **You're using the Agent SDK as a "programmable expert"** where you provide expert-level instructions (prompts) and Claude executes them using available tools, while your TypeScript code provides the deterministic scaffolding around this agentic work.
