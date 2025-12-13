# Blog PDF Generator

AI-powered blog PDF generation system with **four-phase architecture**: Spec Generation (Agent SDK) → PDF Generation (Deterministic) → Bulk Orchestration (Deterministic).

## What This Does

**Phase 3: Generate blog specifications** (Agent SDK creates BlogPdfSpec JSONs from config):
- **AI-Generated Content**: Claude writes realistic 500-1500 word blog posts
- **Config-Driven**: Generate 1-50 specs from a single configuration file
- **High Variety**: Diverse topics, templates, media (images, YouTube)
- **Postal Services Theme**: Default config for postal tech & logistics trends

**Phases 1-2: Convert specs to PDFs** (Deterministic or Agent SDK):
- **Multiple Template Layouts**: Basic and Featured templates with hero images
- **YouTube Video Support**: Automatic thumbnail extraction with play button overlays
- **Image Optimization**: Aggressive compression to keep PDFs under 10MB
- **Asset Management**: Downloads, optimizes, and embeds all media
- **Self-Validation**: Ensures output quality before completion
- **Dual Implementation**: Choose between deterministic or agent-driven workflows

**Phase 4: Bulk PDF generation** (Deterministic orchestration of 1-50 PDFs):
- **High-Speed Generation**: Average 0.77s per PDF with parallel processing
- **Concurrency Control**: Configurable worker pool (default: 5 parallel workers)
- **Real-Time Progress**: Live console updates during bulk operations
- **Error Resilience**: Continue processing on individual failures
- **Results Reporting**: JSON reports with success/failure details

## Two Approaches

### 1. Deterministic (Recommended for Production)
Fast, reliable, hardcoded workflow. **Zero LLM usage, zero token cost.**
- ✅ Predictable performance (~2.7s)
- ✅ Fixed tool execution order
- ✅ No token costs
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
# Generate 10 blog specs (postal services theme, ~8-10 min)
npm run generate:specs

# Generate with custom config
npm run generate:specs config/my-config.json

# Generate and validate
npm run generate:specs:validate

# Test with 2 specs (~90s)
npm run generate:specs config/test-small.json

# ========================================
# Phases 1-2: Generate PDFs from Specs
# ========================================
# Deterministic version (fast, recommended)
npm run dev:deterministic output/specs/blog-01-*.json

# Agent SDK version (adaptive, experimental)
npm run dev:agent output/specs/blog-01-*.json

# Compare both side-by-side
npm run dev:compare output/specs/blog-01-*.json

# Or use example specs
npm run dev examples/sample-blog-phase2.json

# ========================================
# Phase 4: Bulk PDF Generation
# ========================================
# Generate all PDFs from Phase 3 specs (10 PDFs in ~8s)
npm run generate:bulk output/specs

# Custom output directory
npm run generate:bulk output/specs --output output/my-pdfs

# Adjust concurrency (default: 5 workers)
npm run generate:bulk output/specs --concurrency 10
```

## Input Format

Create a JSON file with your blog content:

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

### Featured Example (Phase 2)
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

## Output

PDFs are generated in the `output/` directory with the filename `{id}.pdf`.

## Project Structure

```
blog-pdf-generator/
├── src/
│   ├── specGenerator.ts              # Phase 3: Agent SDK spec generator
│   ├── cliSpecGenerator.ts           # Phase 3: Spec generator CLI
│   ├── bulkOrchestrator.ts           # Phase 4: Bulk PDF orchestration
│   ├── cliBulk.ts                    # Phase 4: Bulk generation CLI
│   ├── agentDeterministic.ts         # Phases 1-2: Deterministic PDF generator
│   ├── agentSdk.ts                   # Phases 1-2: Agent SDK PDF generator
│   ├── cliDeterministic.ts           # Phases 1-2: Deterministic CLI
│   ├── cliSdk.ts                     # Phases 1-2: Agent SDK CLI
│   ├── cliComparison.ts              # Phases 1-2: Side-by-side comparison
│   ├── tools/                        # Asset processing tools
│   │   ├── generatePdf.ts            # Puppeteer PDF generation
│   │   ├── validatePdf.ts            # PDF quality validation
│   │   ├── fetchImage.ts             # Image downloading
│   │   ├── fetchYoutubeThumbnail.ts  # YouTube thumbnail + play icon
│   │   ├── optimizeImage.ts          # Image compression (1200px, 80% quality)
│   │   └── renderTemplate.ts         # Template variable substitution
│   └── utils/
│       ├── templateRenderer.ts       # HTML template engine
│       ├── imageToDataUri.ts         # Base64 image encoding
│       ├── contentProcessor.ts       # Asset injection into HTML
│       └── promptLoader.ts           # Agent SDK prompt template loader
├── prompts/
│   ├── spec-generation.md            # Phase 3: Spec generation prompt
│   └── agent-sdk-pdf-generation.md   # Phases 1-2: PDF generation prompt
├── config/
│   ├── default-postal-tech.json      # Phase 3: Default config (postal services)
│   └── test-small.json               # Phase 3: Test config (2 specs)
├── templates/
│   ├── basic.html                    # Simple single-column layout
│   └── featured.html                 # Hero image with gradient overlay
├── examples/
│   ├── sample-blog.json              # Basic example
│   └── sample-blog-phase2.json       # Featured with YouTube & images
└── output/                           # Generated output
    ├── specs/                        # Phase 3: Generated BlogPdfSpec JSONs
    ├── bulk-pdfs/                    # Phase 4: Bulk generated PDFs + reports
    ├── deterministic/                # Phases 1-2: PDFs from deterministic
    ├── agent-sdk/                    # Phases 1-2: PDFs from Agent SDK
    └── generated-specs-test/         # Phase 3: Test output (preserved)
```

## How It Works

### Phase 3: Spec Generation (Agent SDK)

1. **Input**: Config file (JSON) with generation parameters
2. **Agent SDK Execution**: Claude autonomously creates blog specs
   - Reads config file to understand requirements
   - Generates N unique blog topics based on theme
   - Writes realistic 500-1500 word blog posts (AI-generated content)
   - Creates appropriate HTML structure (h2, p, ul, blockquote)
   - Generates Unsplash image URLs relevant to blog topic
   - Creates YouTube video IDs (50% probability per config)
   - Chooses template based on distribution (30% basic, 70% featured)
   - Writes each spec as separate JSON file
   - Validates output quality
3. **Output**: 1-50 BlogPdfSpec JSON files ready for PDF generation

### Phases 1-2: PDF Generation

#### Deterministic Approach

1. **Input**: JSON file with blog post content, template selection, and media assets
2. **Asset Processing** (hardcoded workflow):
   - Fetches hero image (if featured template)
   - Downloads YouTube thumbnails and overlays play button
   - Fetches and optimizes images (resize to 1200px, 80% quality)
   - Converts all assets to base64 data URIs for PDF embedding
3. **PDF Generation**:
   - Renders HTML from selected template
   - Injects embedded assets into content
   - Generates PDF with Puppeteer (headless Chrome)
   - Validates PDF quality and integrity
4. **Output**: Professional PDF + validation report + asset metadata

### Agent SDK Approach

1. **Input**: JSON spec saved to temporary file
2. **Prompt**: Detailed instructions for Claude describing the task and available tools
3. **Autonomous Execution**: Claude uses Agent SDK with built-in tools:
   - `Bash` - Execute TypeScript modules via tsx
   - `Read` - Read spec file and templates
   - `Write` - Create intermediate files if needed
   - `Glob` - Find template files
   - `TodoWrite` - Track progress (optional)
4. **Adaptive Workflow**: Claude decides which tools to use and in what order based on the content
5. **Output**: Professional PDF (same quality as deterministic) + agent execution log

### Phase 4: Bulk PDF Generation (Deterministic Orchestration)

1. **Input**: Directory of BlogPdfSpec JSON files (from Phase 3)
2. **Orchestration Setup**:
   - Load all JSON specs from directory
   - Create p-queue with concurrency limit (default: 5 workers)
   - Initialize progress tracking
3. **Parallel Processing**:
   - Spawn deterministic PDF generator for each spec
   - Process up to N specs concurrently (configurable via .env)
   - Track progress in real-time with console updates
   - Continue processing on individual failures
4. **Results Aggregation**:
   - Collect success/failure status for each PDF
   - Calculate performance metrics (total time, average time per PDF)
   - Generate JSON results report
5. **Output**: N PDFs + JSON results report with detailed metrics

**Performance**: 10 PDFs in ~8s (0.77s per PDF average) with 5 workers

## Requirements

- Node.js 18+
- Anthropic API key or Claude OAuth token in `.env`
- Chromium (auto-installed by Puppeteer)

## Environment Variables

Create a `.env` file:

```bash
# Option 1: API Key (pay-per-use)
ANTHROPIC_API_KEY=sk-ant-...

# Option 2: OAuth Token (Claude Pro/Max)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-...

# Optional: Model selection
MODEL=claude-sonnet-4-5-20250929

# Phase 4: Bulk PDF Generation Configuration
# Number of parallel workers for bulk PDF generation (default: 5)
BULK_CONCURRENCY=5
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

### Phase 3 ✅ (Complete)
- ✅ Agent SDK spec generation (1-50 specs from config)
- ✅ AI-generated realistic blog content (500-1500 words)
- ✅ Config-driven variety (topics, templates, media)
- ✅ Image URL and YouTube ID generation
- ✅ Real-time progress output
- ✅ Spec validation
- ✅ Default postal services theme

### Phase 4 ✅ (Complete)
- ✅ Bulk PDF orchestration (1-50 PDFs in single execution)
- ✅ Concurrency control with p-queue (configurable workers)
- ✅ Real-time progress tracking and reporting
- ✅ Results aggregation with JSON reports
- ✅ Error-resilient processing (continues on individual failures)

See `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/blog-pdf-generator/blog-pdf-generator-plan.md` for full roadmap.

## Performance

### Phase 3: Spec Generation (Agent SDK)
- **Performance**: ~48s per spec
- **Test Results** (2 specs): 95.77s total
- **Full Generation** (10 specs): ~8-10 minutes estimated
- **Token Cost**: ~$0.50-1.00 per 10 specs
- **Content Quality**: Professional, realistic, indistinguishable from human-written

### Phases 1-2: PDF Generation

#### Deterministic Version
- **Phase 1 Baseline**: 2.9s per PDF (basic template)
- **Phase 2 with Rich Content**: 2.7s per PDF
  - Hero image + 2 optimized images + 1 YouTube thumbnail
  - 5 pages, 3.33MB output (base64-encoded assets)
  - Compression ratios: 10-22% across all images
- **Token Cost**: $0 (no LLM usage)

#### Agent SDK Version (Experimental)
- **Expected**: 15-30s per PDF
  - Includes LLM reasoning time
  - Agent decides workflow autonomously
  - Same quality output as deterministic
- **Token Cost**: ~$0.01-0.05 per PDF (depends on content complexity)

### Phase 4: Bulk PDF Generation (Deterministic)
- **Test Results** (10 PDFs): 7.69s total
- **Average**: 0.77s per PDF
- **Concurrency**: 5 parallel workers
- **Success Rate**: 100% (10/10 successful)
- **Token Cost**: $0 (uses deterministic PDF generator)
- **Scalability**: Estimated ~40s for 50 PDFs with 5 workers

### When to Use Each

**Use Deterministic** when:
- You need fast, predictable performance
- Cost is a concern (zero token cost)
- Workflow is well-understood and doesn't vary
- Production environment with high volume

**Use Agent SDK** when:
- You need adaptive behavior for edge cases
- Content structure varies significantly
- You want intelligent error recovery
- Experimentation and prototyping

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

## License

MIT
