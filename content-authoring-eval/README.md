# Content Authoring Eval

AI-powered CMS migration quality evaluator built with Next.js. Compares expected content (PDFs, specs, original pages) against actual migrated webpages to assess migration quality across multiple dimensions.

## Overview

This system uses **4 AI agents** to evaluate webpage migrations:
- **Structure Agent**: SEO, meta tags, heading hierarchy, semantic HTML
- **Accessibility Agent**: WCAG compliance, keyboard navigation, color contrast
- **Content Fidelity Agent**: PDF vs. web content comparison, semantic alignment
- **Visual Correctness Agent**: Screenshot comparison, layout analysis

Each agent combines **deterministic analysis** (Cheerio, axe-core, unpdf, Playwright) with **agentic intelligence** (Claude 4.5 Agent SDK with tool access).

## Quick Start

### Prerequisites
- Node.js 20.x LTS
- npm 9.x or later
- Claude Code OAuth token (for agents)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local

# Add your Claude OAuth token to .env.local
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
CLAUDE_MODEL=claude-sonnet-4-5-20250929
```

### Development Workflow (Recommended)

**For agent development, prompt iteration, and testing:**

```bash
# Start development server (1.2s startup, instant hot reload)
npm run dev

# Server runs at http://localhost:3000
# Code changes auto-reload - no restart needed
```

**Test agents via API:**

```bash
# Test Structure Agent
curl -X POST http://localhost:3000/api/evaluate/structure \
  -H "Content-Type: application/json" \
  -d '{"migratedUrl": "https://example.com"}'

# Test Accessibility Agent
curl -X POST http://localhost:3000/api/evaluate/accessibility \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Test Content Agent
curl -X POST http://localhost:3000/api/evaluate/content \
  -H "Content-Type: application/json" \
  -d '{"pdfUrl": "https://example.com/doc.pdf", "migratedUrl": "https://example.com"}'

# Test Visual Agent
curl -X POST http://localhost:3000/api/evaluate/visual \
  -H "Content-Type: application/json" \
  -d '{"migratedUrl": "https://example.com"}'
```

**Development workflow:**
1. Edit agent code or prompt JSON files
2. Save file (changes auto-reload in < 1 second)
3. Test agent with curl
4. Iterate - no server restart needed

### Production Deployment (Docker)

**For production deployment to Oracle VM:**

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete Docker deployment instructions.

```bash
# Build Docker image locally (optional)
docker build -t content-authoring-eval:latest .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

**Note**: Docker is for production deployment only. For daily development, use `npm run dev` (much faster).

## Architecture

### Technology Stack
- **Frontend**: Next.js 14, React 18, ShadCN UI, TailwindCSS 3.4
- **Backend**: Next.js API Routes, Claude Agent SDK
- **Deterministic Tools**: Cheerio (HTML parsing), axe-core (a11y), unpdf (PDF extraction), Playwright (screenshots)
- **Agentic Tools**: Playwright MCP (browser automation), Bash (CLI tools), Read/Write (file I/O)
- **Infrastructure**: Docker, GitHub Actions, Oracle Cloud VM

### Agent Tool Access

All agents configured with `bypassPermissions` mode for autonomous tool usage:

| Agent | Tools | Use Cases |
|-------|-------|-----------|
| **Structure** | Read, Bash, Playwright MCP | Inspect live DOM, run Lighthouse SEO |
| **Accessibility** | Read, Write, Bash, Playwright MCP | Test keyboard nav, run Lighthouse a11y |
| **Content** | Read, Write, Bash, WebFetch | PDF processing, text diff, format conversion |
| **Visual** | Read, Write, Bash, Playwright MCP | Screenshots, imagemagick diff, visual analysis |

## Project Structure

```
content-authoring-eval/
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # Dashboard
│   │   ├── evaluate/page.tsx    # New evaluation form
│   │   └── api/
│   │       └── evaluate/
│   │           ├── route.ts     # Main evaluation endpoint
│   │           ├── structure/   # Structure agent API
│   │           ├── accessibility/ # Accessibility agent API
│   │           ├── content/     # Content agent API
│   │           └── visual/      # Visual agent API
│   ├── components/              # React components (ShadCN UI)
│   ├── lib/
│   │   ├── agents/              # 4 evaluation agents (deterministic + agentic)
│   │   ├── prompts/             # Agent prompt JSON files
│   │   └── utils/               # Logging, formatting utilities
│   └── types/                   # TypeScript interfaces
├── public/
│   └── screenshots/             # Generated screenshots
├── Dockerfile                   # Production Docker image (multi-stage)
├── docker-compose.yml           # Production deployment config
└── DEPLOYMENT.md                # Docker deployment guide
```

## Development Tips

### Faster Iteration
- Use `npm run dev` for local development (instant hot reload)
- Edit prompt JSON files in `src/lib/prompts/` to modify agent behavior
- Test agents individually via API endpoints (faster than full evaluation)

### TypeScript Compilation
```bash
# Check TypeScript errors
npx tsc --noEmit

# Watch mode (auto-recompile on changes)
npx tsc --noEmit --watch
```

### Lint Check
```bash
npm run lint
```

### Agent Debugging
- Agents use structured logging (see console output in dev mode)
- Check `src/lib/agents/*/agentic.ts` for Claude Agent SDK configuration
- Monitor agent tool usage via console logs (e.g., "Invoking Bash", "Writing file")

## Testing

### Manual Testing
```bash
# Start dev server
npm run dev

# Open browser
open http://localhost:3000

# Or test via API
curl -X POST http://localhost:3000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{"pdfUrl": "https://example.com/doc.pdf", "migratedUrl": "https://example.com"}'
```

### Health Check
```bash
curl http://localhost:3000/api/evaluate
```

Expected: `200 OK` with JSON response

## Environment Variables

### For Local Development (`.env.local`)

```bash
# Claude API Authentication (OAuth token)
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# Claude Model (optional, defaults to Sonnet 4.5)
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# Node Environment (production in Docker)
NODE_ENV=production
```

### For Docker Deployment (`.env.docker`)

**IMPORTANT**: The Docker image does NOT bake credentials. All auth info is passed at runtime.

```bash
# Copy the template
cp .env.docker.example .env.docker

# Edit .env.docker with your values:
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
CLAUDE_ACCOUNT_UUID=your-account-uuid
CLAUDE_EMAIL=your-email@example.com
CLAUDE_ORG_UUID=your-org-uuid
CLAUDE_MODEL=claude-sonnet-4-5-20250929
```

**Security Note**: The `.env.docker` file contains your credentials and is git-ignored. Never commit it!

## Deployment

### Local Development
- Use `npm run dev` (recommended)
- Startup time: 1.2s
- Hot reload: instant
- No Docker needed

### Production (Docker)
- Automated via GitHub Actions
- Deploys to Oracle Cloud VM
- Multi-arch support (amd64 + arm64)
- See [DEPLOYMENT.md](./DEPLOYMENT.md)

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)
- [ShadCN UI Components](https://ui.shadcn.com)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)

## License

MIT

---

**Version**: 1.0 (Phase 19 Complete)
**Last Updated**: 2025-12-28
