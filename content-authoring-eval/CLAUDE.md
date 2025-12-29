# Content Authoring Eval

AI-powered CMS migration quality evaluation using specialized agents.

## What This Is

Next.js web application with 4 AI agents that evaluate webpage migrations by combining deterministic analysis (Cheerio, axe-core, unpdf, Playwright) with agentic intelligence (Claude 4.5 Agent SDK with tool access).

## Quick Context

**Framework**: Next.js 14, React 18, TypeScript
**Agents**: 4 specialized evaluators (Structure, Accessibility, Content, Visual)
**Deployment**: Docker on Oracle Cloud VM
**Status**: Production-ready

## Architecture

### Hybrid Analysis Approach

Each agent combines:
1. **Deterministic analysis** - Fast, reliable, rule-based checks
2. **Agentic intelligence** - Context-aware evaluation using Claude 4.5

**Example - Structure Agent**:
```
Deterministic (Cheerio):
- Extract <title>, <meta> tags
- Parse heading hierarchy
- Identify semantic HTML elements

Agentic (Claude + Tools):
- Analyze SEO quality
- Evaluate heading structure coherence
- Run Lighthouse SEO via Bash tool
- Inspect live DOM via Playwright MCP
```

### 4 Evaluation Agents

#### 1. Structure Agent
**Focus**: SEO, meta tags, heading hierarchy, semantic HTML
**Deterministic Tools**: Cheerio (HTML parsing)
**Agentic Tools**: Read, Bash, Playwright MCP
**Output**: SEO score, heading analysis, semantic structure assessment

**Location**: `src/lib/agents/structure/`

#### 2. Accessibility Agent
**Focus**: WCAG compliance, keyboard navigation, color contrast
**Deterministic Tools**: axe-core (a11y violations)
**Agentic Tools**: Read, Write, Bash, Playwright MCP
**Output**: WCAG violation count, keyboard nav test, contrast issues

**Location**: `src/lib/agents/accessibility/`

#### 3. Content Fidelity Agent
**Focus**: PDF vs. web content comparison, semantic alignment
**Deterministic Tools**: unpdf (PDF text extraction)
**Agentic Tools**: Read, Write, Bash, WebFetch
**Output**: Content similarity score, missing sections, tone analysis

**Location**: `src/lib/agents/content/`

#### 4. Visual Correctness Agent
**Focus**: Screenshot comparison, layout analysis
**Deterministic Tools**: Playwright (screenshots)
**Agentic Tools**: Read, Write, Bash, Playwright MCP
**Output**: Visual diff, layout issues, responsive design check

**Location**: `src/lib/agents/visual/`

## Project Structure

```
content-authoring-eval/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── page.tsx                # Dashboard (batch evaluations)
│   │   ├── evaluate/page.tsx       # New evaluation form
│   │   └── api/
│   │       └── evaluate/
│   │           ├── route.ts        # Main evaluation endpoint
│   │           ├── structure/      # Structure agent API
│   │           ├── accessibility/  # Accessibility agent API
│   │           ├── content/        # Content agent API
│   │           └── visual/         # Visual agent API
│   ├── components/                 # React components (ShadCN UI)
│   ├── lib/
│   │   ├── agents/                 # 4 evaluation agents
│   │   │   ├── structure/
│   │   │   │   ├── deterministic.ts  # Cheerio-based analysis
│   │   │   │   └── agentic.ts        # Claude Agent SDK
│   │   │   ├── accessibility/
│   │   │   ├── content/
│   │   │   └── visual/
│   │   ├── prompts/                # Agent prompt JSON files
│   │   │   ├── structure.json
│   │   │   ├── accessibility.json
│   │   │   ├── content.json
│   │   │   └── visual.json
│   │   └── utils/                  # Logging, formatting
│   └── types/                      # TypeScript interfaces
├── public/
│   └── screenshots/                # Generated screenshots
├── Dockerfile                      # Multi-stage Docker build
├── docker-compose.yml              # Production deployment
├── DEPLOYMENT.md                   # Docker deployment guide
└── README.md                       # User guide
```

## Development Workflow

### Local Development (Recommended)

**Use this for daily development** - fastest iteration:

```bash
npm run dev
# Server: http://localhost:3000
# Startup: ~1.2s
# Hot reload: Instant
```

**Benefits**:
- Code changes auto-reload (< 1 second)
- No Docker overhead
- Easy debugging with console logs
- Fast agent prompt iteration

### Docker Development (Production Simulation)

**Use this for deployment testing only**:

```bash
docker-compose up -d
# Server: http://localhost:3000
# Startup: ~30-60s
# No hot reload
```

**Use Cases**:
- Test production Docker build
- Validate environment variables
- Debug Docker-specific issues

### Testing Agents

#### Via Web UI
```bash
npm run dev
open http://localhost:3000
# Fill form, click "Evaluate"
```

#### Via API (Faster Iteration)
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

### Prompt Iteration

**Prompts are JSON files** in `src/lib/prompts/`:

1. Edit prompt JSON (e.g., `structure.json`)
2. Save file (auto-reloads in < 1 second)
3. Test agent via curl or web UI
4. Iterate

**No server restart needed** - Next.js hot reload handles it.

## Agent Development

### Anatomy of an Agent

Each agent has two files:

#### deterministic.ts
**Purpose**: Fast, rule-based analysis
**Tools**: Cheerio, axe-core, unpdf, Playwright
**Returns**: Structured data (scores, violations, metrics)

**Example** (Structure Agent):
```typescript
import * as cheerio from 'cheerio';

export async function analyzeStructure(url: string) {
  const html = await fetch(url).then(r => r.text());
  const $ = cheerio.load(html);

  return {
    title: $('title').text(),
    metaDescription: $('meta[name="description"]').attr('content'),
    headings: $('h1, h2, h3, h4, h5, h6').map((_, el) => $(el).text()).get(),
  };
}
```

#### agentic.ts
**Purpose**: Context-aware evaluation using Claude
**Tools**: Agent SDK with Playwright MCP, Bash, Read, Write
**Returns**: Analysis, recommendations, confidence scores

**Example** (Structure Agent):
```typescript
import { Agent } from '@anthropic-ai/claude-agent-sdk';
import structurePrompt from '@/lib/prompts/structure.json';

export async function agenticAnalysis(deterministicData: any, url: string) {
  const agent = new Agent({
    apiKey: process.env.CLAUDE_CODE_OAUTH_TOKEN,
    model: 'claude-sonnet-4-5-20250929',
    systemPrompt: structurePrompt.systemPrompt,
    tools: ['playwright-mcp', 'bash', 'read', 'write'],
    bypassPermissions: true,  // Autonomous tool usage
  });

  const response = await agent.sendMessage(
    `Analyze SEO for ${url}. Deterministic data: ${JSON.stringify(deterministicData)}`
  );

  return response;
}
```

### Tool Access Configuration

All agents use `bypassPermissions: true` for autonomous tool execution:

| Agent | Tools | Use Cases |
|-------|-------|-----------|
| Structure | Read, Bash, Playwright MCP | Lighthouse SEO, live DOM inspection |
| Accessibility | Read, Write, Bash, Playwright MCP | Keyboard nav testing, Lighthouse a11y |
| Content | Read, Write, Bash, WebFetch | PDF processing, text diff, format conversion |
| Visual | Read, Write, Bash, Playwright MCP | Screenshots, imagemagick diff, visual analysis |

**Why bypass permissions?**
- Agents are deterministic (same input → same output)
- No user interaction needed during evaluation
- Faster evaluation (no permission prompts)
- Suitable for batch processing

### Prompt Engineering

Prompts are stored in `src/lib/prompts/*.json`:

```json
{
  "systemPrompt": "You are a Structure Agent...",
  "evaluationCriteria": [
    "SEO optimization",
    "Heading hierarchy",
    "Semantic HTML"
  ],
  "outputFormat": {
    "score": "number (0-100)",
    "issues": "array of objects",
    "recommendations": "array of strings"
  }
}
```

**Best Practices**:
- Clear, imperative instructions
- Structured output format (JSON)
- Explicit evaluation criteria
- Tool usage examples
- Error handling guidance

## Environment Variables

### Local Development (.env.local)

```bash
# Claude API Authentication
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...

# Model (optional, defaults to Sonnet 4.5)
CLAUDE_MODEL=claude-sonnet-4-5-20250929

# Node Environment
NODE_ENV=development
```

### Docker Deployment (.env.docker)

**IMPORTANT**: Credentials are NOT baked into Docker image. Pass at runtime via `.env.docker`.

```bash
# Copy template
cp .env.docker.example .env.docker

# Edit with your values
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
CLAUDE_ACCOUNT_UUID=your-account-uuid
CLAUDE_EMAIL=your-email@example.com
CLAUDE_ORG_UUID=your-org-uuid
CLAUDE_MODEL=claude-sonnet-4-5-20250929
```

**Security**: `.env.docker` is gitignored. Never commit secrets!

## Deployment

### Local Development
```bash
npm run dev
# Startup: 1.2s
# Hot reload: instant
```

### Production (Docker)
**Automated via GitHub Actions** to Oracle Cloud VM.

**Manual deployment**:
```bash
# Build image
docker build -t content-authoring-eval:latest .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

**See**: [DEPLOYMENT.md](./DEPLOYMENT.md) for complete guide.

### Docker Build Modes

Two Dockerfile configurations available:

| Feature | **Dockerfile** (Production) | **Dockerfile.debug** (Debug) |
|---------|---------------------------|----------------------------|
| **Purpose** | Optimized production deployment | Fast iteration & debugging |
| **Build Strategy** | Multi-stage (4 stages) | Single-stage |
| **Image Size** | ~3.9GB (optimized layers) | ~4.5GB (includes dev deps) |
| **Dependencies** | Production only | All deps (dev + prod) |
| **Debugging** | ❌ No inspector | ✅ Node inspector on port 9229 |
| **Logging** | Standard | Verbose (`DEBUG=*`) |
| **Rebuild Time** | ~3-5 min | ~1-2 min |
| **Use Case** | Production, staging | Local debugging, troubleshooting |

**Usage:**
```bash
# Production
docker-compose up -d

# Debug mode (port 3005, inspector on 9229)
docker-compose -f docker-compose.debug.yml up
```

**ARM64 Support:** Both Dockerfiles include chromium ARM64 fix (symlinks chromium-1200 → chromium-1205) for Apple Silicon compatibility.

## Common Issues

### Agent Timeout
**Symptom**: Request exceeds timeout
**Cause**: Agent waiting for tool execution
**Fix**: Increase timeout in API route or optimize tool usage

### OAuth Token Expired
**Symptom**: 401 Unauthorized from Anthropic API
**Fix**: Run `claude setup-token` and update `.env.local`

### Playwright MCP Errors
**Symptom**: Browser automation fails
**Cause**: Playwright not installed or MCP connection issue
**Fix**: Verify Playwright installation (`npx playwright install`)

### Hot Reload Not Working
**Symptom**: Code changes don't reflect
**Fix**: Restart dev server (`Ctrl+C`, then `npm run dev`)

## Testing Strategy

### Manual Testing (Primary)
1. Start dev server (`npm run dev`)
2. Test via web UI or curl
3. Validate agent output
4. Iterate on prompts/code

### Automated Testing (Future)
- E2E tests with real URLs
- Agent output validation
- Regression tests for prompts

**Philosophy**: Real tests with real URLs, no mocking.

## Memory Management

**For Claude Code**: When working on this project:

1. Focus on one agent at a time (e.g., `src/lib/agents/structure/`)
2. Read agent's deterministic.ts and agentic.ts
3. Read corresponding prompt JSON (`src/lib/prompts/structure.json`)
4. Don't load unrelated agents
5. Don't load other subprojects unless comparing patterns

**Context Priority**:
- High: Current agent's source files and prompt
- Medium: Agent SDK docs (use WebFetch)
- Low: Other agents
- Minimal: Other subprojects (functions/, agent-claude-sdk/)

## Integration with Other Subprojects

### make-dot-com/
**Relationship**: Evaluates migrations created by Make.com agents
**Workflow**: Make.com migrates → This app evaluates

### functions/
**Relationship**: Different use of MCP
- `functions/`: MCP server (provides tools)
- `content-authoring-eval/`: MCP client (uses tools)

### agent-claude-sdk/
**Relationship**: Production use of Agent SDK patterns
**Learning**: See `agent-claude-sdk/CLAUDE.md` for SDK fundamentals

## Next Steps

1. Add more evaluation dimensions (performance, security)
2. Build agent comparison dashboard
3. Implement batch evaluation queuing
4. Export evaluation reports (PDF, CSV)
5. Add historical trend analysis

## Related Documentation

- [Next.js Documentation](https://nextjs.org/docs)
- [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [ShadCN UI](https://ui.shadcn.com)

---

**Last Updated**: 2025-12-29
**Framework**: Next.js 14
**Deployment**: Docker (Oracle Cloud)
**Status**: Production
