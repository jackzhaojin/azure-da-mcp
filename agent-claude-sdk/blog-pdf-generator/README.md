# Blog PDF Generator

AI-powered blog PDF generation with **timestamped runs and Azure deployment**: Spec Generation (Agent SDK) → PDF Generation (Deterministic) → Bulk Orchestration → Azure Upload.

## What This Does

**Phase 3: Generate blog specifications** (Agent SDK runs a scripted flow):
- **AI Invocation**: Claude reads config and writes specs via Read/Write tools.
- **Config-Driven**: Targets 1-50 specs; validation checks id/title/content/template basics.
- **Default Theme**: Postal tech & logistics trends via `config/default-postal-tech.json`.

**Phases 1-2: Convert specs to PDFs** (Deterministic or Agent SDK wrapper):
- **Templates**: Basic and Featured templates; hero image only used when template is `featured`.
- **YouTube & Images**: Thumbnails with play icon; images optimized (1200px/80%) and embedded as base64.
- **Asset Placement**: Position-based insertion at specified locations (`after-paragraph-3`, `after-section-2`).
- **Asset Tracking**: Relative paths displayed below each asset for downstream reuse.
- **Validation**: Basic checks (file exists, size limit, page count).
- **Agent SDK wrapper**: Writes a small runner that calls the deterministic generator; does not expose custom tools.

**Phase 4: Bulk PDF generation** (Deterministic orchestration):
- **Concurrency Control**: Configurable worker pool (default: 5 parallel workers).
- **Timestamped Output**: Creates `output/pdf-run-YYYY-MM-DD-HHMMSS/` directories.
- **Progress Logging**: Console updates during bulk operations.
- **Results Reporting**: JSON reports with success/failure details.
- **Azure Deployment**: Optional `--deploy` flag uploads to Azure blob storage.

## Two Approaches

### 1. Deterministic (Recommended for Production)
Fast, reliable, hardcoded workflow. **Zero LLM usage, zero token cost.**
- ✅ Predictable performance (~0.8s per PDF)
- ✅ Fixed tool execution order
- ✅ No token costs
- ✅ Position-based asset insertion
- ❌ Cannot adapt to edge cases

### 2. Agent SDK (Experimental)
Claude autonomously decides workflow and tool usage via Agent SDK.
- ✅ Adaptive to content variations
- ✅ Can handle edge cases intelligently
- ✅ Uses Claude's reasoning capabilities
- ❌ Slower (~15-30s estimated)
- ❌ Token costs apply

## Quick Start

```bash
# Install dependencies
npm install

# Make sure .env exists with ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN

# ========================================
# Phase 3: Generate Blog Specifications
# ========================================
# Uses config/default-postal-tech.json
npm run generate:specs

# Use custom config
npm run generate:specs config/my-config.json

# Generate and run lightweight validation
npm run generate:specs:validate

# ========================================
# Phases 1-2: Generate PDFs from Specs
# ========================================
# Deterministic version (fast, recommended) — single spec file only
npm run dev:deterministic output/specs/blog-01-abc.json

# Agent SDK wrapper (writes a runner script that calls deterministic)
npm run dev:agent output/specs/blog-01-abc.json

# Compare both side-by-side (reads the first provided spec path)
npm run dev:compare output/specs/blog-01-abc.json

# Or use archived example specs (deprecated pattern)
npm run dev input/archive/sample-blog-phase2.json

# ========================================
# Phase 4: Bulk PDF Generation + Deployment
# ========================================
# Generate all PDFs from Phase 3 specs (10 PDFs in ~8s)
npm run generate:bulk output/specs

# Deploy to Azure after generation
npm run generate:bulk output/specs --deploy

# Custom output directory
npm run generate:bulk output/specs --output output/my-pdfs

# Adjust concurrency (default: 5 workers)
npm run generate:bulk output/specs --concurrency 10 --deploy
```

## Input Organization (IMPORTANT)

**All inputs MUST be organized in dated folders**: `input/YYYY-MM-DD-<project-name>/`

**Current pattern**:
```
input/
├── 2026-01-10-adobe-summit/  ← Dated folder (REQUIRED)
│   ├── adobe-summit-2026-config.json
│   ├── run-timestamped.sh
│   └── README.md
├── 2026-01-11-my-project/    ← Your new dated folder
└── archive/                  ← Deprecated non-dated examples
    ├── sample-blog.json
    └── sample-blog-phase2.json
```

**Why dated folders?**
- Tracks when input was created
- Allows multiple projects per day
- Keeps history of configs and specs
- Matches output pattern (output/pdf-run-YYYY-MM-DD-HHMMSS/)

## Input Format

Create a JSON file with your blog content in a dated folder:

### Basic Example
```json
{
  "id": "my-blog-post",
  "title": "My Amazing Blog Post",
  "teaser": "A short description of the post",
  "content": "<h2>Section</h2><p>Your HTML content here...</p>",
  "metadata": {
    "author": "Your Name",
    "date": "2025-12-13",
    "tags": ["tutorial", "nodejs"]
  }
}
```

See archived examples in `input/archive/sample-blog.json` and `input/archive/sample-blog-phase2.json`.

### Featured Example with Assets
```json
{
  "id": "featured-post",
  "title": "Advanced Blog Post",
  "teaser": "With hero image and rich media",
  "template": "featured",
  "heroImage": "https://example.com/hero-image.jpg",
  "content": "<h2>Section</h2><p>Your content...</p>",
  "images": [
    {
      "url": "https://example.com/image1.jpg",
      "alt": "Image description",
      "position": "after-paragraph-2"
    }
  ],
  "youtube": [
    {
      "videoId": "dQw4w9WgXcQ",
      "caption": "Watch the tutorial",
      "position": "after-section-2"
    }
  ],
  "metadata": {
    "author": "Your Name",
    "date": "2025-12-13",
    "tags": ["tutorial", "advanced"]
  }
}
```

## Output Structure

### Local Output (Release 2.0+)
```
output/
├── pdf-run-2026-01-10-153045/          # Timestamped run folder
│   ├── index.html                      # Gallery view (local + Azure links)
│   ├── pdfs/
│   │   ├── blog-01.pdf
│   │   ├── blog-02.pdf
│   │   └── assets/                     # All images/thumbnails
│   │       ├── hero-*.jpg              # Original + optimized
│   │       ├── image-*-optimized.jpg   # Content images
│   │       └── youtube-*.jpg           # Video thumbnails
│   └── bulk-generation-report.json
├── specs/                              # Phase 3 generated specs (input)
└── archive/
    └── pre-release-2.0/                # Pre-2.0 outputs migrated here
```

### Azure Output (with --deploy flag)
```
contentsource/
├── index.html                          # Root index (all runs)
├── pdf-run-2026-01-10-153045/          # Automated deployment
│   ├── index.html                      # Run-specific gallery
│   ├── pdfs/
│   │   ├── *.pdf
│   │   └── assets/                     # Relative path: pdfs/assets/
│   └── bulk-generation-report.json
└── pdf-run-2026-01-10-160512/          # Another run
```

**Live URLs** (when deployed):
- Run Gallery: `https://dalivemcprg94e3.blob.core.windows.net/contentsource/pdf-run-YYYY-MM-DD-HHMMSS/index.html`
- Root Index: `https://dalivemcprg94e3.blob.core.windows.net/contentsource/index.html`

## Project Structure

```
blog-pdf-generator/
├── src/
│   ├── specGenerator.ts              # Phase 3: Agent SDK spec runner
│   ├── cliSpecGenerator.ts           # Phase 3: Spec generator CLI
│   ├── bulkOrchestrator.ts           # Phase 4: Bulk PDF orchestration
│   ├── cliBulk.ts                    # Phase 4: Bulk generation CLI + deployment
│   ├── agentDeterministic.ts         # Phases 1-2: Deterministic PDF generator
│   ├── agentSdk.ts                   # Phases 1-2: Agent SDK wrapper
│   ├── cliDeterministic.ts           # Phases 1-2: Deterministic CLI
│   ├── cliSdk.ts                     # Phases 1-2: Agent SDK CLI
│   ├── cliComparison.ts              # Phases 1-2: Side-by-side comparison
│   ├── tools/                        # Asset processing & deployment
│   │   ├── generatePdf.ts            # Puppeteer PDF generation
│   │   ├── validatePdf.ts            # PDF validation
│   │   ├── fetchImage.ts             # Image downloading
│   │   ├── fetchYoutubeThumbnail.ts  # YouTube thumbnail + play icon
│   │   ├── optimizeImage.ts          # Image compression (1200px, 80%)
│   │   ├── deployToAzure.ts          # Azure blob upload + index generation
│   │   └── generateIndex.ts          # HTML gallery generation
│   └── utils/
│       ├── templateRenderer.ts       # HTML template engine
│       ├── imageToDataUri.ts         # Base64 image encoding
│       ├── contentProcessor.ts       # Position-based asset insertion
│       └── promptLoader.ts           # Agent SDK prompt template loader
├── prompts/
│   ├── spec-generation.md            # Phase 3: Spec generation prompt
│   └── agent-sdk-pdf-generation.md   # Phases 1-2: PDF generation prompt
├── config/
│   ├── default-postal-tech.json      # Phase 3: Default config
│   └── test-small.json               # Phase 3: Test config (2 specs)
├── templates/
│   ├── basic.html                    # Simple single-column layout
│   └── featured.html                 # Hero image with gradient overlay
├── input/
│   ├── sample-blog.json              # Basic example
│   └── sample-blog-phase2.json       # Featured with YouTube & images
└── output/                           # Generated output (timestamped runs)
```

## How It Works

### Phase 3: Spec Generation (Agent SDK)

1. **Input**: Config file (JSON) with generation parameters
2. **Agent SDK Execution**: Claude runs a scripted flow to read the config and write specs
   - Reads config file to understand requirements
   - Generates topics and writes HTML content (length/structure prompt-guided)
   - Generates Unsplash-style image URLs and YouTube IDs
   - Chooses template based on config distribution
   - Writes each spec as separate JSON file
   - Validation limited to id/title/content/template checks
3. **Output**: 1-50 BlogPdfSpec JSON files ready for PDF generation

### Phases 1-2: PDF Generation

#### Deterministic Approach

1. **Input**: JSON file with blog post content, template selection, and media assets
2. **Asset Processing** (hardcoded workflow):
   - Fetches hero image (if featured template) → optimize to 1600px/85%
   - Downloads images → optimize to 1200px/80% → convert to data URI
   - Fetches YouTube thumbnails → overlay play button → convert to data URI
   - Calculates relative paths for each asset (for downstream tracking)
3. **Content Processing**:
   - Parses position hints (`after-paragraph-3`, `after-section-2`)
   - Inserts assets at specified positions (not appended at end)
   - Displays asset paths below each image/video
   - Shows YouTube URLs as clickable blue links
4. **PDF Generation**:
   - Renders HTML from selected template with embedded assets
   - Generates PDF with Puppeteer (headless Chrome)
   - Validates PDF quality and integrity
5. **Output**: Professional PDF with positioned assets + validation report

### Agent SDK Approach

1. **Input**: JSON spec saved to temporary file
2. **Prompt**: Instructions direct Claude to write a runner that imports deterministic generator
3. **Execution**: Claude uses built-in tools to create and run that script
4. **Workflow**: Follows deterministic generator path
5. **Output**: PDF generated by deterministic path + agent execution log

### Phase 4: Bulk PDF Generation

1. **Input**: Directory of BlogPdfSpec JSON files (from Phase 3)
2. **Orchestration Setup**:
   - Load all JSON specs from directory
   - Generate timestamp: `YYYY-MM-DD-HHMMSS`
   - Create output directory: `output/pdf-run-{timestamp}/`
   - Initialize p-queue with concurrency limit (default: 5 workers)
3. **Parallel Processing**:
   - Spawn deterministic PDF generator for each spec
   - Process up to N specs concurrently (configurable via .env)
   - Track progress in real-time with console updates
   - Continue processing on individual failures
4. **Results Aggregation**:
   - Collect success/failure status for each PDF
   - Calculate performance metrics (total time, average time per PDF)
   - Generate JSON results report
   - Create local index.html gallery with card-based layout
5. **Azure Deployment** (optional, with `--deploy` flag):
   - Upload PDFs + assets to `contentsource/pdf-run-{timestamp}/`
   - Preserve relative directory structure (assets in `pdfs/assets/`)
   - Generate run-specific index in Azure
   - Update root index listing all runs
6. **Output**: N PDFs + JSON report + index.html (local + Azure)

**Performance**: 10 PDFs in ~8s (0.8s per PDF average) with 5 workers

## Requirements

- Node.js 18+
- Anthropic API key or Claude OAuth token in `.env`
- Chromium (auto-installed by Puppeteer)
- Azure CLI (for deployment, authenticated via `az login`)

## Environment Variables

Create a `.env` file:

```bash
# Required: Authentication
ANTHROPIC_API_KEY=sk-ant-...           # Or CLAUDE_CODE_OAUTH_TOKEN

# Optional: Model selection
MODEL=claude-sonnet-4-5-20250929

# Optional: Bulk PDF generation
BULK_CONCURRENCY=5                     # Parallel workers (default: 5)

# Optional: Azure deployment (for --deploy flag)
AZURE_STORAGE_ACCOUNT=dalivemcprg94e3
AZURE_RESOURCE_GROUP=da-live-mcp-rg
AZURE_CONTAINER=contentsource
```

## Azure Deployment

### Prerequisites
```bash
# Login to Azure (one-time)
az login

# Verify authentication
az account show
```

### Deploy PDFs
```bash
# Generate and deploy to Azure
npm run generate:bulk output/specs --deploy

# Custom Azure settings (overrides .env)
npm run generate:bulk output/specs --deploy \
  --storage dalivemcprg94e3 \
  --resource-group da-live-mcp-rg \
  --container contentsource
```

### What Gets Deployed
- Timestamped folder: `contentsource/pdf-run-YYYY-MM-DD-HHMMSS/`
- All PDFs in `pdfs/` subdirectory
- All assets in `pdfs/assets/` subdirectory (preserving relative paths)
- Run-specific index.html
- Root index.html (auto-updated with all runs)

## Asset Display in PDFs

### Content Images (Position-Based Insertion)
```
[Image embedded at specified position]
Asset: assets/image-blog-id-0-optimized.jpg
```

### YouTube Videos
```
[Thumbnail embedded at specified position]
Video: https://www.youtube.com/watch?v=videoId (clickable blue link)
Thumbnail: assets/youtube-videoId.jpg
```

### Hero Images (Featured Template)
```
[Hero image with gradient overlay]
[Bottom-right badge: "Asset: assets/hero-blog-id-optimized.jpg"]
```

## Current Implementation

### Phase 1 ✅ (Complete)
- ✅ Single PDF generation per execution
- ✅ Puppeteer-based HTML→PDF conversion
- ✅ Self-validation of PDF output
- ✅ Basic HTML template
- ✅ CLI interface

### Phase 2 ✅ (Complete)
- ✅ YouTube thumbnail support with play icon overlay
- ✅ Multiple template options (basic, featured)
- ✅ Image optimization (max 1200px width, 80% quality)
- ✅ Hero image support for featured template
- ✅ Asset management and caching
- ✅ Position-based asset insertion
- ✅ Asset path tracking for downstream reuse
- ✅ YouTube URLs as clickable links

### Phase 3 ✅ (Complete)
- ✅ Agent SDK spec generation (1-50 specs from config prompt)
- ⚠️ Content length/structure is prompt-guided only
- ✅ Image URL and YouTube ID generation
- ✅ Real-time progress output
- ⚠️ Validation limited to id/title/content/template fields
- ✅ Default postal services theme

### Phase 4 ✅ (Complete)
- ✅ Bulk PDF orchestration (1-50 PDFs in single execution)
- ✅ Concurrency control with p-queue (configurable workers)
- ✅ Timestamped output directories (`pdf-run-YYYY-MM-DD-HHMMSS`)
- ✅ Real-time progress tracking and reporting
- ✅ Results aggregation with JSON reports
- ✅ Error-resilient processing (continues on individual failures)
- ✅ Azure deployment with `--deploy` flag
- ✅ Root index generation listing all runs
- ✅ Local and Azure gallery pages with card-based layout

## Performance

Timing varies with network (asset downloads), Puppeteer startup, and spec content. The codebase does not record or enforce performance targets. Deterministic paths avoid LLM cost; Agent SDK paths incur LLM usage during spec generation.

### When to Use Each

**Use Deterministic** when:
- You need fast, predictable performance
- Cost is a concern (zero token cost)
- Workflow is well-understood and doesn't vary
- Production environment with high volume

**Use Agent SDK** when:
- You want specs generated from a config using the prompt
- You need the Agent SDK wrapper flow (which still calls deterministic)
- Experimentation and prototyping where LLM cost is acceptable

## Migration from Release 1.0

If upgrading from Release 1.0, old output folders can be archived:

```bash
# One-time migration script
./scripts/migrate-to-release-2.0.sh

# This moves old folders to archive/pre-release-2.0/
# - bulk-pdfs/
# - deterministic/
# - agent-sdk/
# - generated-specs-test/
```

## Troubleshooting

**"No authentication found"**
- Ensure `.env` file exists and contains ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN

**Puppeteer errors**
- Puppeteer will auto-download Chromium on first `npm install`
- If issues persist, try: `npx puppeteer browsers install chrome`

**PDF validation fails**
- Check agent log for specific validation errors
- Ensure HTML content is well-formed
- Verify images are accessible if using image URLs

**Azure deployment fails**
- Ensure logged into Azure CLI: `az login`
- Verify storage account exists: `az storage account show --name dalivemcprg94e3`
- Check .env has correct AZURE_STORAGE_ACCOUNT, AZURE_RESOURCE_GROUP

## License

MIT
