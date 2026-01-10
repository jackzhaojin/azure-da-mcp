# Blog PDF Generator

Generate professional blog PDFs from JSON specs with images, YouTube videos, and automatic Azure deployment.

**Workflow**: Config → Spec Generation (Agent SDK) → Bulk PDF Generation (Deterministic) → Azure Upload

## What This Does

Generate 1-50 blog PDFs in a single run:

1. **Spec Generation** (Agent SDK): Claude reads your config and writes blog spec JSON files
   - Config-driven: count, theme, topics, word count
   - Generates Unsplash image URLs and YouTube video IDs
   - Output: JSON files in `output/specs/`

2. **Bulk PDF Generation** (Deterministic): Fast parallel PDF creation from specs
   - Downloads and optimizes images (1200px, 80% quality)
   - Fetches YouTube thumbnails with play button overlay
   - Inserts assets at specified positions (not appended at end)
   - Displays asset paths for downstream reuse
   - Output: Timestamped folder `output/pdf-run-YYYY-MM-DD-HHMMSS/`

3. **Azure Deployment** (Optional): One-command upload with gallery index
   - Uploads PDFs + assets to Azure blob storage
   - Generates card-based gallery index
   - Updates root index with all runs

## Typical Workflow (Recommended)

**For production use** - fast and cost-effective:

```bash
# 1. Generate specs from config (Agent SDK - writes JSON files)
npm run generate:specs input/2026-01-10-adobe-summit/adobe-summit-2026-config.json

# 2. Bulk generate PDFs and deploy (Deterministic - no LLM cost)
npm run generate:bulk output/specs --deploy
```

**Result**: 10-20 PDFs generated in ~10 seconds, uploaded to Azure with gallery index

**Why this works well**:
- ✅ Agent SDK for spec generation (creative, adaptive content)
- ✅ Deterministic for PDF generation (fast, zero token cost)
- ✅ Parallel processing with configurable workers
- ✅ Automatic Azure deployment with gallery pages

## Quick Start

```bash
# Install and setup
npm install
# Create .env with ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN

# Complete workflow: Config → Specs → PDFs → Azure
npm run generate:specs input/2026-01-10-adobe-summit/adobe-summit-2026-config.json
npm run generate:bulk output/specs --deploy

# Generate specs only (no PDFs yet)
npm run generate:specs input/2026-01-10-adobe-summit/adobe-summit-2026-config.json

# Generate PDFs from existing specs
npm run generate:bulk output/specs                    # Local only
npm run generate:bulk output/specs --deploy           # Upload to Azure
npm run generate:bulk output/specs --concurrency 10   # Adjust parallel workers

# Single PDF from spec (for testing)
npm run dev:deterministic output/specs/blog-01-abc.json
```

**Example configs**: See `input/2026-01-10-adobe-summit/adobe-summit-2026-config.json`

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

### Step 1: Spec Generation

**Input**: Config JSON with count, theme, topics, word count ranges

**Process**:
- Agent SDK reads config and generates blog specs
- Creates realistic content with proper HTML structure
- Generates Unsplash image URLs and YouTube video IDs
- Chooses template (basic/featured) based on config distribution

**Output**: JSON files in `output/specs/` (e.g., `blog-01-edge-delivery-services.json`)

### Step 2: Bulk PDF Generation

**Input**: Directory of spec JSON files

**Process** (parallel, deterministic):
1. Downloads and optimizes images (1200px, 80% quality)
2. Fetches YouTube thumbnails and adds play button overlay
3. Inserts assets at specified positions (`after-paragraph-3`, `after-section-2`)
4. Displays asset paths below each image/video for downstream use
5. Renders HTML template with embedded assets
6. Generates PDF with Puppeteer (headless Chrome)

**Output**: Timestamped folder `output/pdf-run-YYYY-MM-DD-HHMMSS/` with:
- PDFs in `pdfs/` subdirectory
- Assets in `pdfs/assets/` subdirectory
- Gallery `index.html` with local + Azure links
- JSON generation report

**Performance**: ~10 PDFs in 10 seconds (5 parallel workers)

### Step 3: Azure Deployment (Optional)

**With `--deploy` flag**:
- Uploads entire run folder to `contentsource/pdf-run-{timestamp}/`
- Preserves relative paths (PDFs reference `assets/image-*.jpg`)
- Generates run-specific gallery index
- Updates root index listing all runs

**URLs**:
- Run: `https://dalivemcprg94e3.blob.core.windows.net/contentsource/pdf-run-{timestamp}/`
- Root: `https://dalivemcprg94e3.blob.core.windows.net/contentsource/`

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

## Performance & Costs

**Spec Generation** (Agent SDK):
- LLM cost: ~$0.50-2.00 for 10-20 specs (depends on content length)
- Time: 2-5 minutes for 10 specs

**PDF Generation** (Deterministic):
- LLM cost: $0 (no API calls)
- Time: ~1 second per PDF (parallel processing)
- Bottleneck: Image downloads from Unsplash

**Total for 10 PDFs**: ~$1-2 LLM cost, ~5 minutes end-to-end

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
