# Blog Static Site Generator

AI-powered static blog generator with brand-aware design systems and Azure deployment.

## Quick Start

```bash
npm install
npm run generate input/spec.md
```

## Usage

Create a spec file (markdown or JSON):

```markdown
## Design System
path: ./design-system/system.md
format: consolidated

## Content
count: 10
theme: Adobe Summit 2026
topics:
  - Edge Delivery Services
  - GenAI

## Output
directory: ./output/2026-01-10-153000
includeLandingPage: true
siteTitle: Summit Blog

## Deployment
storageAccount: mystorage
resourceGroup: my-rg
```

Generate:
```bash
npm run generate spec.md
```

## Architecture

**Input**: Spec file + Design system
**Output**: HTML blog pages + landing page + Azure deployment

**Pipeline**:
1. Parse spec (markdown/JSON)
2. Parse design system (tokens → CSS variables)
3. Generate CSS from design tokens
4. **AI content generation** (Claude Agent SDK)
5. Render blog HTMLs from templates
6. Generate landing page
7. Deploy to Azure Blob Storage (`$web/YYYY-MM-DD-HHMMSS/`)

**Design Systems**: Supports token-based directories or consolidated markdown files.

## Output Directory Structure

**IMPORTANT**: This generator outputs files to the **exact directory specified in your spec**. Unlike blog-pdf-generator which automatically creates timestamped directories, you must specify the timestamp in your spec's output directory.

### Recommended: Timestamped Directories

For multiple runs per day, use timestamp format: `YYYY-MM-DD-HHMMSS`

```markdown
## Output
directory: ./output/2026-01-10-153000
```

**Output structure:**
```
output/
├── 2026-01-10-153000/          # Your specified directory
│   ├── index.html              # Landing page (if enabled)
│   ├── posts/
│   │   ├── post-001.html
│   │   ├── post-002.html
│   │   └── ...
│   └── assets/
│       ├── css/styles.css
│       └── images/...
├── 2026-01-10-160000/          # Another run
└── 2026-01-10-173000/          # Yet another run
```

### Single Output (Not Recommended)

If you don't need multiple runs, you can use a static directory:

```markdown
## Output
directory: ./output
```

But this will **overwrite previous generations** each time you run.

### For Agent SDK / Programmatic Use

If you're invoking this from another agent, **you must**:
1. Generate the timestamp yourself
2. Set the `directory` field in the spec to include the timestamp
3. Pass the spec file path to the generator

Example (from another agent):
```typescript
const timestamp = new Date().toISOString()
  .slice(0, 19)
  .replace(/[-:]/g, '')
  .replace('T', '-')
  .slice(0, 15);  // "2026-01-10-153000"

// Modify spec to use timestamped directory
spec.output.directory = `./output/${timestamp}`;
```

## Environment

Create `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
```

## Azure Deployment

### Prerequisites

```bash
# Login to Azure (one-time)
az login

# Verify authentication
az account show
```

Requires:
- Azure CLI installed
- Azure AD authentication (`az login`)
- Storage account with static website enabled

### How Deployment Works

The deployment uses **the basename of your output directory** as the Azure subdirectory:

```markdown
## Output
directory: ./output/2026-01-10-153000    # Basename: "2026-01-10-153000"

## Deployment
storageAccount: mystorage
resourceGroup: my-rg
```

Deploys to: `$web/2026-01-10-153000/` → `https://mystorage.z20.web.core.windows.net/2026-01-10-153000/`

### Root Index

After each deployment, a **root index.html** is auto-generated in `$web/index.html` listing all runs:

- `https://mystorage.z20.web.core.windows.net/` → Lists all runs
- `https://mystorage.z20.web.core.windows.net/2026-01-10-153000/` → Specific run

**IMPORTANT**: If your output directory is `./output` (no timestamp), it deploys to `$web/output/` which is probably not what you want. Always use timestamped directories for Azure deployment.

## Scripts

- `npm run build` - Build TypeScript
- `npm run clean` - Remove dist/ and output/
- `npm run generate <spec>` - Generate site

## Block Types

Supports 11 block types: prose, blockquote, image, video, code, callout, table, stats, cta, toc, author-card.

See `CLAUDE.md` for detailed architecture and implementation details.

## Comparison with blog-pdf-generator

| Feature | blog-pdf-generator | blog-static-site-generator |
|---------|-------------------|---------------------------|
| **Timestamping** | Automatic (bulkOrchestrator creates `pdf-run-YYYY-MM-DD-HHMMSS/`) | Manual (you specify in spec) |
| **Invocation** | `npm run generate:bulk output/specs` | `npm run generate spec.md` |
| **Agent Use** | Can be called directly by agents | Agents must create timestamped spec |
| **Best For** | Bulk operations, automated workflows | Single runs, custom control |

**Why different?**
- **blog-pdf-generator**: Designed for bulk processing many specs → automatic timestamping makes sense
- **blog-static-site-generator**: Designed for single spec → you control the output directory explicitly

If you want automatic timestamping for blog-static-site-generator, wrap it in an orchestrator script or agent that generates the timestamp before calling it.

## License

ISC
