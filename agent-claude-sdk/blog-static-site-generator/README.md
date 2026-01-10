# Blog Static Site Generator

AI-powered static blog generator with brand-aware design systems and Azure deployment.

## Quick Start

```bash
npm install
npm run generate examples/spec.md
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
directory: ./output
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

**Deployment**: Automatic timestamped subdirectories. Root index auto-updates with all runs.

## Environment

Create `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
```

## Azure Deployment

Requires:
- `az login` (Azure AD authentication)
- Storage account with static website enabled

Each run deploys to `https://<account>.z20.web.core.windows.net/YYYY-MM-DD-HHMMSS/`

## Scripts

- `npm run build` - Build TypeScript
- `npm run clean` - Remove dist/ and output/
- `npm run generate <spec>` - Generate site

## Block Types

Supports 11 block types: prose, blockquote, image, video, code, callout, table, stats, cta, toc, author-card.

See `CLAUDE.md` for detailed architecture and implementation details.

## License

ISC
