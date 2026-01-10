# Blog Static Site Generator

AI-powered static blog site generator with brand-aware design and Azure deployment.

## Overview

**Input**: One spec file (markdown or JSON) containing design system path, content config, and output preferences

**Output**: N blog HTML pages + optional landing page, deployable to Azure Blob Storage Static Website

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` file:

```env
ANTHROPIC_API_KEY=your_api_key_here
# or
CLAUDE_CODE_OAUTH_TOKEN=your_token_here

# Optional
MODEL=claude-sonnet-4-5-20250929
```

### 3. Create Spec File

Example `spec.md`:

```markdown
## Design System
path: ./design-system/adobe-summit-blog-design-system.md
format: consolidated

## Content
count: 5
theme: Adobe Summit 2026
topics:
  - Edge Delivery Services
  - GenAI

## Output
directory: ./output
includeLandingPage: true
siteTitle: Summit Blog

## Deployment
storageAccount: mystorage
resourceGroup: my-rg
```

### 4. Generate Site

```bash
npm run generate spec.md
```

## Spec File Format

### Markdown Format (Recommended)

```markdown
## Design System
path: <path-to-design-files>
format: consolidated|tokens

## Content
count: <number-of-blogs>
theme: <main-theme>
topics:
  - Topic 1
  - Topic 2

## Output
directory: <output-directory>
includeLandingPage: true|false
siteTitle: <site-title>
siteDescription: <optional-description>

## Deployment (optional)
storageAccount: <azure-storage-account>
resourceGroup: <azure-resource-group>
containerName: <optional-container-name>
```

### JSON Format (Alternative)

```json
{
  "designSystem": {
    "path": "./design-system/adobe-summit-blog-design-system.md",
    "format": "consolidated"
  },
  "content": {
    "count": 5,
    "theme": "Adobe Summit 2026",
    "topics": ["Edge Delivery Services", "GenAI"]
  },
  "output": {
    "directory": "./output",
    "includeLandingPage": true,
    "siteTitle": "Summit Blog"
  },
  "deployment": {
    "storageAccount": "mystorage",
    "resourceGroup": "my-rg"
  }
}
```

## Design System Formats

### Format 1: Token-Based (Directory)

```
design-system/
├── tokens/tokens.css          # CSS variables
├── foundations/FOUNDATIONS.md # Typography/layout/color rules
├── blocks/*.md                # Block specs
└── pages/*.md                 # Page recipes
```

### Format 2: Consolidated (Single File)

```
design-system/
└── adobe-summit-blog-design-system.md  # All tokens + blocks in one file
```

## Output Structure

```
output/
├── index.html              # Landing page (if includeLandingPage: true)
├── posts/
│   ├── edge-delivery-101.html
│   ├── genai-personalization.html
│   └── ...
└── assets/
    ├── css/
    │   └── styles.css      # Generated from design tokens
    └── images/
        └── ...             # Optimized images
```

## Available Block Types

The generator supports these content blocks:

| Block         | Purpose                 | Variants                            |
| ------------- | ----------------------- | ----------------------------------- |
| `prose`       | Body text               | -                                   |
| `blockquote`  | Pull quotes             | default, large, centered            |
| `image`       | Images with captions    | default, wide, full                 |
| `video`       | YouTube embeds          | default, wide, full                 |
| `code`        | Code snippets           | default, wide, no-line-numbers      |
| `callout`     | Tips, warnings, notes   | tip, note, warning, danger, success |
| `table`       | Data tables             | default, striped, wide              |
| `stats`       | Key metrics display     | dark, light, brand                  |
| `cta`         | Call-to-action banners  | brand, dark, light                  |
| `toc`         | Table of contents       | -                                   |
| `author-card` | Author bio              | default, centered                   |

## Azure Deployment

### Prerequisites

1. Install Azure CLI: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
2. Login: `az login`
3. Create storage account (if needed):

```bash
az storage account create \
  --name <storage-account> \
  --resource-group <resource-group> \
  --location <location> \
  --sku Standard_LRS \
  --kind StorageV2
```

### Deployment

The generator automatically deploys to Azure if deployment config is provided in spec:

```markdown
## Deployment
storageAccount: mystorage
resourceGroup: my-rg
```

Or skip deployment by omitting the Deployment section.

## Scripts

- `npm run build` - Build TypeScript to dist/
- `npm run clean` - Remove dist and output directories
- `npm run dev` - Run CLI with tsx (development)
- `npm run generate <spec-file>` - Generate static site

## Architecture

**Deterministic HTML/CSS Generation** (fast, no tokens):

- Spec parsing (markdown/JSON)
- Design system parsing (Format 1/2)
- CSS generation from tokens
- Blog HTML generation from templates

**Agent SDK for AI Content** (creative, adaptive):

- Content generation with Claude
- Uses design system blocks
- Generates realistic blog posts

**Reused Tools** (from blog-pdf-generator):

- Sharp image optimization (1200px max, 80% quality)
- Template rendering ({{VAR}} substitution)
- Prompt loading

## Development

### Adding New Block Types

1. Create template: `templates/blocks/new-block.html`
2. Add case to `src/utils/blockRenderer.ts`
3. Update CSS: `src/tools/generateCss.ts`

### Customizing CSS

Edit `generateCss.ts` to modify:

- CSS variable generation
- Base styles
- Block-specific styles

## Troubleshooting

**Error: "Missing API key"**

- Set `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` in `.env`

**Error: "Azure CLI not installed"**

- Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

**Error: "Not logged in to Azure CLI"**

- Run: `az login`

**Error: "Failed to parse design system"**

- Verify design system path is correct
- Check format matches actual file structure

## License

ISC
