---
applyTo: "content-authoring-eval/**"
---

# Content Authoring Eval Instructions

## Overview

This is a **Next.js 14 web application** with 4 AI agents that evaluate webpage migrations.

**Tech Stack**: Next.js 14, React 18, TypeScript, Claude Agent SDK, Docker
**Model**: Claude 4.5 (`claude-sonnet-4-5-20250929`)
**Deployment**: Docker on Oracle Cloud VM

## Architecture: Hybrid Analysis

Each agent combines **deterministic analysis** with **agentic intelligence**:

| Agent | Deterministic Tools | Agentic Tools | Focus |
|-------|---------------------|---------------|-------|
| Structure | Cheerio | Bash, Playwright MCP | SEO, headings, semantic HTML |
| Accessibility | axe-core | Bash, Playwright MCP | WCAG compliance |
| Content | unpdf | Bash, WebFetch | PDF vs. web comparison |
| Visual | Playwright | Bash, Playwright MCP | Screenshot comparison |

## Project Structure

```
content-authoring-eval/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/evaluate/       # Agent API endpoints
│   │   └── page.tsx            # Dashboard
│   ├── lib/
│   │   ├── agents/             # 4 evaluation agents
│   │   │   ├── structure/      # SEO, heading analysis
│   │   │   ├── accessibility/  # WCAG checks
│   │   │   ├── content/        # Content fidelity
│   │   │   └── visual/         # Visual correctness
│   │   └── prompts/            # Agent prompt JSON files
├── Dockerfile                  # Multi-stage Docker build
└── docker-compose.yml          # Production deployment
```

## Agent Development

Each agent has two files:

| File | Purpose |
|------|---------|
| `deterministic.ts` | Fast, rule-based analysis (Cheerio, axe-core, unpdf) |
| `agentic.ts` | Context-aware evaluation with Claude Agent SDK |

**Agent SDK Pattern:**
```typescript
import { Agent } from '@anthropic-ai/claude-agent-sdk';

const agent = new Agent({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-5-20250929',
    tools: ['bash', 'read', 'write', 'playwright_mcp'],
    bypassPermissions: true  // Autonomous tool use
});

const result = await agent.run(prompt);
```

## Development Commands

```bash
cd content-authoring-eval
npm install
npm run dev     # Start dev server on :3000
```

**Docker** (for deployment testing only):
```bash
docker-compose up -d    # Production simulation
```

## Testing Agents

**Via Web UI**:
```bash
npm run dev
open http://localhost:3000
# Fill form, click "Evaluate"
```

**Via API (faster iteration)**:
```bash
# Structure Agent
curl -X POST http://localhost:3000/api/evaluate/structure \
  -H "Content-Type: application/json" \
  -d '{"migratedUrl": "https://example.com"}'

# Accessibility Agent
curl -X POST http://localhost:3000/api/evaluate/accessibility \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## Prompt Iteration

Prompts are **JSON files** in `src/lib/prompts/`:

1. Edit prompt JSON (e.g., `structure.json`)
2. Save file (auto-reloads < 1 second)
3. Test agent via curl or web UI
4. Iterate

**No server restart needed** - Next.js hot reload handles it.

## Authentication

**OAuth Token** (Recommended):
```bash
npm install -g @anthropic-ai/claude-cli
claude setup-token
# Token stored in ~/.config/@anthropic-ai/claude/oauth_token
```

**API Key**:
```bash
# In .env.local
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## Environment Variables

```bash
# .env.local
CLAUDE_CODE_OAUTH_TOKEN=...   # OR ANTHROPIC_API_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Docker Deployment

```bash
# Build and run
docker build -t content-authoring-eval .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... content-authoring-eval
```

See `DEPLOYMENT.md` for Oracle Cloud VM deployment details.

## TypeScript Patterns

**Next.js App Router**:
```typescript
// src/app/api/evaluate/structure/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    const body = await request.json();
    // Agent logic here
    return NextResponse.json({ result: 'success' });
}
```

**Strict Type Safety**:
```typescript
interface EvaluationResult {
    score: number;
    issues: Issue[];
    recommendations: string[];
}
```

## Files to Never Modify

- `.env.local` - Contains secrets (CLAUDE_CODE_OAUTH_TOKEN)
- `.env.docker` - Production secrets
- `next.config.mjs` - Already optimized

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| OAuth error | Token expired | Run `claude setup-token` |
| Docker slow startup | Fresh build | Use `npm run dev` for development |
| Playwright timeout | Network issues | Increase timeout in agent config |
