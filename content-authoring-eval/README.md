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

# Install Playwright browsers
npx playwright install

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

### Docker Build Modes

This project includes two Dockerfile configurations for different use cases:

| Feature | **Dockerfile** (Production) | **Dockerfile.debug** (Debug) |
|---------|---------------------------|----------------------------|
| **Purpose** | Optimized production deployment | Fast iteration & debugging |
| **Build Strategy** | Multi-stage (4 stages) | Single-stage |
| **Size** | 171 lines | 61 lines |
| **Image Size** | ~3.9GB (optimized layers) | ~4.5GB (includes dev deps) |
| **Dependencies** | Production only | All deps (dev + prod) |
| **Next.js Mode** | Standalone output (minimal) | Full build with source maps |
| **Debugging** | ❌ No inspector | ✅ Node inspector on port 9229 |
| **Logging** | Standard | Verbose (`DEBUG=*`) |
| **Rebuild Time** | ~3-5 min | ~1-2 min |
| **Source Mounting** | ❌ Not supported | ✅ Can mount `./src` for live changes |
| **Use Case** | Production, staging, demos | Local debugging, troubleshooting |

**When to Use Each:**

**Production (`Dockerfile`):**
```bash
# Standard deployment
docker-compose up -d

# Or build manually
docker build -t content-authoring-eval:latest .
docker run -d --env-file .env.docker -p 3000:3000 content-authoring-eval:latest
```
- Production deployments
- Performance testing
- Final validation before release

**Debug (`Dockerfile.debug`):**
```bash
# Debug mode with inspector
docker-compose -f docker-compose.debug.yml up

# Container runs on port 3005 with Node inspector on 9229
# Attach debugger: chrome://inspect or VS Code
```
- Debugging agent issues
- Testing configuration changes quickly
- Investigating runtime errors
- Live code changes (mount source volumes)

**ARM64 Support:** Both Dockerfiles include the chromium ARM64 fix (symlinks chromium-1200 → chromium-1205) for Apple Silicon compatibility.

## Architecture

### Technology Stack
- **Frontend**: Next.js 14, React 18, ShadCN UI, TailwindCSS 3.4
- **Backend**: Next.js API Routes, Claude Agent SDK
- **Deterministic Tools**: Cheerio (HTML parsing), axe-core (a11y), unpdf (PDF extraction), Playwright (screenshots)
- **Agentic Tools**: Playwright MCP (browser automation), Bash (CLI tools), Read/Write (file I/O)
- **Infrastructure**: Docker, GitHub Actions, Oracle Cloud VM

### Hybrid Analysis: Deterministic + Agentic

Each agent follows a **sequential pipeline** that combines fast deterministic analysis with intelligent interpretation:

```
Deterministic Analysis → Results Fed to Prompt → Agentic Analysis → Score Blending
```

#### Deterministic Layer (Fast, Objective)

Runs first to extract raw metrics using specialized tools:

| Agent | Tool | Output |
|-------|------|--------|
| **Structure** | Cheerio | Meta tags, heading counts, semantic HTML flags |
| **Accessibility** | axe-core | WCAG violations, severity counts, rule IDs |
| **Content** | unpdf | PDF text, word counts, similarity percentages |
| **Visual** | Playwright + pixelmatch | Screenshots, pixel diff percentages |

**Returns**: Numbers, booleans, arrays — no interpretation or recommendations.

#### Agentic Layer (Intelligent, Contextual)

Claude receives deterministic results in its prompt and provides:

| Output | Source | Example |
|--------|--------|---------|
| `summary` | **Agentic only** | "Structure has critical SEO issues with missing H1" |
| `strengths` | **Agentic only** | ["Proper heading hierarchy", "Complete OG tags"] |
| `findings[].recommendation` | **Agentic only** | "Add exactly one H1 tag with the main page title" |
| `findings[].impact` | **Agentic only** | "Screen readers use H1 for page context" |
| `quickWins` | **Agentic only** | ["Add alt text to 3 images"] |
| `majorIssues` | **Agentic only** | ["Color contrast fails WCAG AA"] |

#### Score Blending Formula

All agents use the same weighted combination:

```typescript
finalScore = (agenticScore × 0.7) + (deterministicScore × 0.3)
```

- **70% Agentic**: Claude's interpretation and prioritization
- **30% Deterministic**: Objective metrics from automated tools

This ensures scores are grounded in measurable data while benefiting from AI judgment.

### Agent Tool Access

All agents configured with `bypassPermissions` mode for autonomous tool usage:

| Agent | Deterministic Tools | Agentic Tools | Use Cases |
|-------|---------------------|---------------|-----------|
| **Structure** | Cheerio | Read, Bash, Playwright MCP | Parse HTML, inspect live DOM, run Lighthouse SEO |
| **Accessibility** | axe-core | Read, Write, Bash, Playwright MCP | WCAG scan, test keyboard nav, run Lighthouse a11y |
| **Content** | unpdf | Read, Write, Bash, WebFetch | Extract PDF text, compare content, format conversion |
| **Visual** | Playwright, pixelmatch | Read, Write, Bash, Playwright MCP | Capture screenshots, pixel diff, visual analysis |

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

### Test Directory Structure

```
tests/
├── adhoc/          # Ad hoc tests for quick experiments
└── e2e/            # E2E agent Playwright test suite
```

- **Ad hoc tests** (`tests/adhoc/`): Quick validation scripts and manual experiments
- **E2E tests** (`tests/e2e/`): Automated Playwright tests for agent evaluation regression

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

### Automated Testing
```bash
# Run smoke tests (fast, critical paths)
npm run test:smoke

# Run full E2E suite
npm run test

# Run with UI for debugging
npm run test:ui

# Show test report
npm run test:report
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
