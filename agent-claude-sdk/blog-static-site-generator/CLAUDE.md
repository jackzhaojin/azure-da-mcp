# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Purpose

AI-powered static blog site generator that transforms design systems into brand-aware HTML blogs with automated Azure deployment.

**Core Philosophy**: Deterministic HTML/CSS generation (fast, no tokens) + Agent SDK for creative AI content only.

## Commands

### Development
```bash
npm install          # Install dependencies
npm run build        # Build TypeScript → dist/
npm run clean        # Remove dist/ and output/
```

### Generation
```bash
npm run generate <spec-file>      # Generate site from spec
npm run dev <spec-file>            # Same as generate (uses tsx)

# Example
npm run generate examples/spec.md
```

### Execution Script (Adobe Summit example)
```bash
./prompts/2026-01-10-claude-design/run-timestamped.sh
```

This script auto-detects project root and creates timestamped runs.

## Architecture Overview

### 7-Step Generation Pipeline

**Orchestrator**: `src/generator.ts` coordinates all steps sequentially:

1. **Parse Spec** (`tools/parseSpec.ts`)
   - Accepts markdown or JSON spec files
   - Extracts design system path, content config, output preferences, deployment settings
   - Returns `StaticSiteSpec` interface

2. **Parse Design System** (`tools/parseDesignSystem.ts`)
   - **Format 1** (tokens): Reads `tokens/tokens.css`, `foundations/FOUNDATIONS.md`, `blocks/*.md`
   - **Format 2** (consolidated): Reads single markdown file with all tokens + blocks
   - Extracts color/typography/spacing tokens and block definitions
   - Returns `DesignSystem` with tokens and blocks

3. **Generate CSS** (`tools/generateCss.ts`)
   - Converts design tokens → CSS custom properties (`:root { --color-primary: ... }`)
   - Generates base styles from foundations
   - Generates block-specific styles
   - Writes to `output/assets/css/styles.css`

4. **Generate AI Content** (`contentGenerator.ts`)
   - Uses `@anthropic-ai/claude-agent-sdk` to generate N blog posts
   - Agent writes JSON files: `blog-content-001.json`, `blog-content-002.json`, etc.
   - **Critical**: Sanitizes AI-generated JSON (replaces `":=` with `":"` to fix common AI syntax errors)
   - Each JSON contains: id, title, teaser, blocks[], metadata
   - Max turns: 50, Model: claude-sonnet-4-5-20250929 (or env.MODEL)

5. **Generate Blog HTMLs** (`tools/generateBlogHtml.ts`)
   - For each BlogContent, renders blocks using `blockRenderer.ts`
   - Combines rendered blocks with `templates/blog-post.html`
   - Uses `templateRenderer.ts` for {{VAR}} substitution
   - Writes to `output/posts/blog-title.html`

6. **Generate Landing Page** (`tools/generateLandingPage.ts`)
   - Creates index.html with featured post (first blog) + grid of all blogs
   - Uses `templates/landing-page.html` and component templates
   - Only generated if `spec.output.includeLandingPage: true`

7. **Deploy to Azure** (`tools/deployToAzure.ts`)
   - **Authentication**: Uses `--auth-mode login` (requires `az login` first)
   - **Subdirectory deployment**: Each run uploads to `$web/YYYY-MM-DD-HHMMSS/`
   - **Root index update**: Generates and uploads root `index.html` listing all runs
   - Skips deployment if `spec.deployment` not provided

### Key Architectural Patterns

**Template System** (`utils/templateRenderer.ts`):
- Simple {{VAR}} substitution
- Supports conditionals: `{{#if VAR}}...{{/if}}` and `{{#if !VAR}}...{{/if}}`
- All variables passed as `Record<string, string>`

**Block Rendering** (`utils/blockRenderer.ts`):
- Each block type (prose, callout, image, etc.) has its own template in `templates/blocks/`
- Switch statement maps block.type → template name
- Returns rendered HTML string

**Agent SDK Integration**:
- Prompt loaded from `prompts/blog-content-generation.md`
- Agent only has Write and Read tools (writes JSON files)
- Temp directory created in `output/<dir>/.temp-content/`
- Temp directory cleaned up after successful load

**Image Processing** (reused from blog-pdf-generator):
- `tools/fetchImage.ts`: Downloads from URLs
- `tools/optimizeImage.ts`: Sharp optimization (1200px max, 80% quality)
- Uses p-queue for concurrency control

## Spec File Structure

**Required sections** (markdown format):
```markdown
## Design System
path: <relative-or-absolute-path>
format: consolidated | tokens

## Content
count: <number>
theme: <main-theme>
topics:
  - Topic 1
  - Topic 2

## Output
directory: <output-path>
includeLandingPage: true | false
siteTitle: <title>
siteDescription: <optional>

## Deployment (optional)
storageAccount: <azure-account>
resourceGroup: <azure-rg>
containerName: <optional, default: $web>
```

**Alternative**: JSON format with same structure (see `examples/spec.json`)

## Block Types

Supported blocks in AI-generated content:

| Type | Template | Purpose |
|------|----------|---------|
| `prose` | Simple wrapper | Body text with HTML |
| `blockquote` | Quote with citation | Pull quotes, testimonials |
| `image` | Figure with caption | Images with alt text |
| `video` | YouTube iframe | Embedded videos |
| `code` | Pre + code tags | Syntax-highlighted code |
| `callout` | Alert box | Tips, warnings, notes |
| `table` | HTML table | Data tables |
| `stats` | Metric cards | Key numbers display |
| `cta` | Button/banner | Call-to-action |
| `toc` | Nav list | Table of contents |
| `author-card` | Profile card | Author bio |

Each block can have variants (e.g., callout: tip/warning/danger).

## Azure Deployment Details

**Authentication**: Storage account `dalivemcprg94e3` requires Azure AD authentication (`--auth-mode login`), not key-based. All `az storage` commands include this flag.

**Deployment flow**:
1. Copy files to temp directory with timestamp subfolder structure
2. Upload temp directory to `$web` container (preserves subfolder)
3. List all runs by finding blob names matching `YYYY-MM-DD-HHMMSS/index.html`
4. Generate root index.html with links to all runs
5. Upload root index separately

**Root index features**:
- Gradient design matching Adobe brand
- Shows total run count and latest run timestamp
- Links to each run's landing page
- Auto-updates on every deployment

## Important Implementation Details

**JSON Sanitization** (`contentGenerator.ts` line 79-82):
```typescript
// AI sometimes generates "type":="value" instead of "type":"value"
fileContent = fileContent.replace(/":\s*=/g, '":');
```
This prevents parsing errors from malformed AI output.

**Hidden File Exclusion** (`deployToAzure.ts` copyDirectory function):
- Skips files starting with `.` (e.g., `.DS_Store`, `.temp-content`)
- Prevents uploading macOS metadata and temp files

**Async Template Rendering**:
- All template rendering is async (reads files from disk)
- Block rendering returns `Promise<string>`
- Use `await Promise.all()` when rendering multiple blocks

**Error Handling**:
- Each step returns `{ success: boolean, error?: string, ... }`
- Generator collects messages array for logging
- Failures in non-critical steps (landing page, deployment) continue execution

## Environment Variables

Required in `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
# or
CLAUDE_CODE_OAUTH_TOKEN=...

# Optional
MODEL=claude-sonnet-4-5-20250929  # Default model for Agent SDK
```

## Testing

There are no automated tests. Manual testing workflow:

1. Run example spec: `npm run generate examples/spec.md`
2. Check output in `output/` directory
3. Open `output/index.html` in browser
4. Verify all blocks render correctly
5. Check deployed site (if deployment configured)

For Adobe Summit example:
```bash
./prompts/2026-01-10-claude-design/run-timestamped.sh
```

Typical generation time: 4-5 minutes for 10 blogs.

## Troubleshooting

**TypeScript errors after editing templates**:
- Templates are not type-checked
- Rebuild with `npm run build` to catch errors in .ts files

**AI content generation fails**:
- Check Agent SDK has Write and Read tools only
- Verify temp directory is writable
- Check API key is valid
- Review prompt in `prompts/blog-content-generation.md`

**Azure deployment fails**:
- Run `az login` first
- Verify storage account name and resource group are correct
- Check that storage account allows static website hosting
- Ensure `--auth-mode login` is in all `az storage` commands

**CSS not loading in generated HTML**:
- Verify relative path from `posts/*.html` to `assets/css/styles.css` is `../assets/css/styles.css`
- Check CSS file was generated in step 3

**Landing page missing blogs**:
- Ensure `includeLandingPage: true` in spec
- Check that blog HTMLs were generated successfully in step 5
- Verify blogPages array is populated before landing page generation

## Files Not to Modify

**Reused from blog-pdf-generator** (stable, tested):
- `src/tools/fetchImage.ts`
- `src/tools/optimizeImage.ts`
- `src/utils/promptLoader.ts`

These were copied directly and should only be updated if blog-pdf-generator changes.

**Templates** (modify with caution):
- Changing template structure requires updating corresponding rendering code
- Template variables must match what's passed in rendering functions
