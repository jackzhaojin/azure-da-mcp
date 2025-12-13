# Blog PDF Generator

AI-powered blog PDF generation using Claude Agent SDK and Puppeteer.

## What This Does

Converts blog post content (JSON) into professional PDF documents using an autonomous Claude agent that:
- Renders HTML from templates
- Downloads and embeds images
- Generates PDFs with Puppeteer
- Self-validates output quality

## Quick Start

```bash
# Install dependencies
npm install

# Make sure .env exists with ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN

# Generate a PDF (development mode with auto-rebuild)
npm run dev examples/sample-blog.json

# Or build and run production
npm run build
npm run generate examples/sample-blog.json
```

## Input Format

Create a JSON file with your blog content:

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

## Output

PDFs are generated in the `output/` directory with the filename `{id}.pdf`.

## Project Structure

```
blog-pdf-generator/
├── src/
│   ├── agent.ts              # Agent SDK setup and orchestration
│   ├── cli.ts                # Command-line interface
│   ├── tools/                # Agent tools
│   │   ├── generatePdf.ts    # Puppeteer PDF generation
│   │   ├── validatePdf.ts    # PDF quality validation
│   │   └── fetchImage.ts     # Image downloading
│   └── utils/
│       └── templateRenderer.ts  # HTML template rendering
├── templates/
│   └── basic.html            # Blog post HTML template
├── examples/
│   └── sample-blog.json      # Sample blog content
└── output/                   # Generated PDFs (git-ignored)
```

## How It Works

1. **Input**: JSON file with blog post content
2. **Agent Processing**: Claude agent uses tools to:
   - Render HTML from template
   - Fetch images if needed
   - Generate PDF with Puppeteer
   - Validate PDF quality
3. **Output**: Professional PDF + validation report

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
```

## Current Implementation (Phase 1)

This is Phase 1 of the blog PDF generator:
- ✅ Single PDF generation per execution
- ✅ Puppeteer-based HTML→PDF conversion
- ✅ Self-validation of PDF output
- ✅ Basic HTML template
- ✅ CLI interface

**Not yet implemented:**
- ❌ YouTube thumbnail support (Phase 2)
- ❌ Multiple template options (Phase 2)
- ❌ Bulk orchestration (1-50 PDFs) (Phase 3)
- ❌ Image optimization (Phase 2)

See `/Users/jackjin/dev/eds-ai-editor-ai-instructions/ai-docs/agents/blog-pdf-generator/blog-pdf-generator-plan.md` for full roadmap.

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
