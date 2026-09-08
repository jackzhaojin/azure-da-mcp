# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**Azure DA.live MCP** — a monorepo of 7 independent AI-powered content authoring, migration, evaluation, and ops tools for [da.live](https://da.live) (Adobe Edge Delivery Services). Each subproject has its own dependencies, configs, and workflows; this root file orients you to which one to work in.

> **Version lines**: **v2.x** (currently `v2.9.3`) is the **`agents/` A2A platform** (project #7 — the current flagship workstream). **v1.x** (`v1.1.0`) is the legacy `content-authoring-eval` app — a **frozen backup**, never modified (decision D5). When in doubt about "the new platform" vs "the eval app", that's the v2.x vs v1.x split. Full history: [CHANGELOG.md](./CHANGELOG.md).

## Monorepo Structure

This repository contains 7 independent projects:

### 1. `functions/` - Azure Functions MCP Server
**Purpose**: Production MCP server for AI-assisted da.live content editing
**Tech**: Azure Functions v4, Node 22, Anthropic SDK, MCP SDK
**Status**: Production-ready
**Docs**: [functions/CLAUDE.md](./functions/CLAUDE.md)

**When to work here**:
- MCP server development (JSON-RPC 2.0)
- da.live API integration
- Claude API with MCP tools
- Azure Functions deployment

### 2. `content-authoring-eval/` - CMS Migration Evaluator
**Purpose**: AI-powered quality evaluation for webpage migrations
**Tech**: Next.js 14, Claude Agent SDK, Playwright MCP, Docker
**Status**: ⚠️ **DEPRECATED (2026-06-27)** — superseded by the v2.0 platform's `agents/eval-service` (its engine was *copied* out, not moved). Still running on Oracle Cloud as the **v1.x FROZEN backup (D5): never modify this folder** and never trigger its deploy. Deprecated = no new work; frozen = the safety net stays up.
**Docs**: [content-authoring-eval/CLAUDE.md](./content-authoring-eval/CLAUDE.md)

**When to work here**:
- Evaluation agent development (4 agents: Structure, Accessibility, Content, Visual)
- Deterministic analysis tools (Cheerio, axe-core, unpdf, Playwright)
- Agentic intelligence (Claude 4.5 with tool access)
- Batch evaluation features

### 3. `agent-claude-sdk/` - Agent SDK Experiments
**Purpose**: Learning and prototyping with Claude Agent SDK
**Tech**: TypeScript, Node.js, Claude Agent SDK
**Status**: ⚠️ **DEPRECATED (2026-06-27)** — prototyping scaffolding whose patterns now live in the `agents/` platform; no new work here.
**Docs**: [agent-claude-sdk/CLAUDE.md](./agent-claude-sdk/CLAUDE.md)

**When to work here**:
- Agent SDK pattern exploration
- CLI chat agents
- PDF generation agents
- Third-party demo testing

### 4. `make-dot-com/` - Make.com Agent Prompts
**Purpose**: Versioned prompts for Make.com migration workflows
**Tech**: Markdown prompt files, Make.com platform
**Status**: Active versioning
**Docs**: [make-dot-com/CLAUDE.md](./make-dot-com/CLAUDE.md)

**When to work here**:
- Prompt engineering for content migration agents
- Make.com workflow configuration
- Progressive prompt versioning (MVP → MVP+Memory → MVP+BlockLibrary → Full)

**Important**: Prompts are NOT deployed via Git. They are copy-pasted into Make.com UI.

### 5. `bruno/` - API Testing Collections
**Purpose**: HTTP request collections for API testing
**Tech**: Bruno HTTP client
**Status**: Active use
**Docs**: [bruno/CLAUDE.md](./bruno/CLAUDE.md)

**When to work here**:
- Testing da.live Admin API
- Testing Azure Functions MCP endpoints
- API debugging and exploration

### 6. `hlx-admin/` - AEM Admin API Execution Logs
**Purpose**: Auditable, one-at-a-time AEM Edge Delivery Services admin operations (`admin.hlx.page` config service, access control, code/content ops)
**Tech**: curl + dated working directories with EXECUTION.md plans, JSON request/response files, retrospectives
**Status**: Active use
**Docs**: [hlx-admin/CLAUDE.md](./hlx-admin/CLAUDE.md)
**Skill**: [hlx-admin-api-executor](https://github.com/jackzhaojin/ai-builder-kit/tree/main/skills/hlx-admin-api-executor) — drives the GET/SET/GET pattern and human-in-the-loop approval flow

**When to work here**:
- Creating or repairing AEM Config Service site records
- Mutating org/site config, access lists, secrets, API keys
- Any `admin.hlx.page` operation where mistakes are costly and the audit trail matters

**Auth note**: The skill documents the `X-Auth-Token` cookie path, but the cached DA IMS JWT at `~/.aem/da-token.json` (populated by `npx github:adobe-rnd/da-auth-helper token`, 24h TTL) is also accepted by `admin.hlx.page` as `Authorization: Bearer …`. Faster when available. See `hlx-admin/2026-05-16-set-hosts/EXECUTION.md` for a worked example.

### 7. `agents/` - A2A Agent Platform (v2.0) ⭐ flagship workstream
**Purpose**: A decoupled mesh of independently-addressable AI agents (content-gen, migration, eval, coordinator) speaking the **A2A protocol** — the ground-up v2.0 re-architecture for the adaptTo() Sept 2026 demo
**Tech**: TypeScript, `@a2a-js/sdk@0.3.13`, Express (one server per agent), Node 20, npm workspaces, better-sqlite3 / Cloudflare D1, R2, Next.js 15 (coordinator dashboard — the sole UI: single/bulk/direct-eval/migrate-a-real-page lanes, sample downloads, JSON export), Claude Agent SDK + opencode (Kimi), vitest e2e
**Status**: **v2.9.3, DEPLOYED ON CLOUDFLARE** (M5 first deploy 2026-06-10; every `v2.x` tag redeploys) — the whole mesh runs as Workers + Containers (worker `content-factory`, agents/deploy/): dashboard at `content-factor-dash.jackzhaojin.com` (Google SSO, per-user runs), agents at `content-factory{,-eval,-gen,-migrate}.jackzhaojin.com`, store on D1 via the Worker's `/d1/query` proxy, artifacts on R2. Real migrations run under **Kimi (K3 default, per-run model)** or **Claude (Agent SDK `sdk` backend, per-run model)**; eval has three modes (`fidelity`/`quality`/`redesign`); an agent-led **daily content loop** (GH Actions cron) publishes a Wilderness Journal article every day; `npm run model-matrix` benchmarks N models over the same migration+eval (2026-08-29: K3 confirmed best); **agent memory (v2.9)**: the migrator reads the site's da.live memory page (`/ai-content/memory`) before every run and the eval agent (`eval.reflect`) appends distilled rules after every scored run - the v1 self-improvement loop, restored. Local dev unchanged (SQLite + localhost ports); the tunnel keeps only `a2a.jackzhaojin.com` → local :4003 for Make.com
**Docs**: [agents/CLAUDE.md](./agents/CLAUDE.md) (hub; each sub-workspace has its own CLAUDE.md) · [CHANGELOG.md](./CHANGELOG.md) (per-minor-version history) · build report [ai-docs/2026-06-08-a2a-platform-v2.0/](./ai-docs/2026-06-08-a2a-platform-v2.0/) · model assessments [ai-docs/2026-08-29-model-assessment/](./ai-docs/2026-08-29-model-assessment/) (baseline) and [ai-docs/2026-09-08-model-assessment-with-memory/](./ai-docs/2026-09-08-model-assessment-with-memory/) (re-run on v2.9: every model held or improved) · plan [ai-docs/2026-06-05-a2a-agent-platform/](./ai-docs/2026-06-05-a2a-agent-platform/) · full index [ai-docs/README.md](./ai-docs/README.md)

**When to work here**:
- A2A agents/protocol (Agent Cards, Task lifecycle, `message/stream`, push notifications, edge shim)
- The closed loop (generate → migrate → evaluate), coordinator routing, variance reporting
- Cloudflare D1/R2 persistence, `cloudflared` tunnel, Make.com interop
- The decoupled eval engine (copied from the frozen v1.x app)
- **The demo content target** — generated articles + the daily loop now point at the **`adapt-to-2026-demo`** "Wilderness Journal" site (the old `da-live-postal-2025-07` site is retired). Per-site behavior (editorial lane, voice, folder, reference corpus) lives in `agents/coordinator/src/site-profiles.ts`.

> **Content IA on the demo site (`adapt-to-2026-demo`)**: `https://main--adapt-to-2026-demo--jackzhaojin.aem.page/ai-content/**` is the **hand-built, best-practice REFERENCE corpus** (block showcases + canonical stories like `/ai-content/stories/chasing-sunsets`) the migrator *learns from* — never written to by agents. **AI-generated drafts land in `/ai-articles/**`** (a separate tree) so they never pollute the reference material. A human curates/promotes the good ones later. **`/ai-content/memory` is the agent-memory page** (v2.9): two tiers - "Approved memory" (condensed, human-curated: site facts, what worked / what didn't, findings to ignore) and "Episodic memory" (the append-only run log the eval agent writes into after each scored run). The migrator reads the whole page before each run; agents never rewrite the approved tier.

## Working in This Monorepo

### Important Instructions

1. **Each project is independent**: Separate dependencies, configs, and workflows
2. **Check which directory you're in**: Always `cd` to the right subproject first
3. **Use correct Node version**: `agents/` and `content-authoring-eval/` require Node 20; `functions/` and the Wrangler/Cloudflare CLI require Node 22
4. **Read subproject CLAUDE.md**: Each has specific context and instructions

### Common Workflows

**A2A platform development** (the flagship — see [agents/CLAUDE.md](./agents/CLAUDE.md)):
```bash
cd agents
nvm use 20 && npm install
set -a; source .env; set +a
npm run dev:eval & npm run dev:content-gen & npm run dev:migration & npm run dev:coordinator &
# dashboard: http://localhost:4004/ · closed loop: npm run loop -- "<topic>" · benchmark: npm run model-matrix
```

**Azure Functions development**:
```bash
cd functions
nvm use 22
npm start
```

**Content authoring eval development** (⚠️ frozen, D5 — read-only reference; never modify or deploy):
```bash
cd content-authoring-eval
npm run dev
```

**Agent SDK prototyping**:
```bash
cd agent-claude-sdk/chat-cli
npm run dev
```

**Make.com prompt updates**:
```bash
cd make-dot-com/v1-content-migration
# Edit prompt markdown files
# Copy to Make.com UI manually
```

**API testing**:
```bash
cd bruno
# Open collections in Bruno app
```

**AEM admin operation** (skill-driven, human-in-the-loop):
```bash
cd hlx-admin/<YYYY-MM-DD-description>
source .env-setup.sh   # loads DA IMS token from ~/.aem/da-token.json
# Follow EXECUTION.md step-by-step
```

### Navigation Tips

When the user asks about:
- **"the platform"**, **"v2.0"**, **"A2A"**, **"agents"**, **"the mesh"**, **"coordinator"**, **"the dashboard"** (:4004), **"closed loop"**, **"the eval agent"**, **"content-gen"**, **"migration agent"**, **"Kimi"/"opencode backend"**, **"the tunnel"**, **"D1/R2"** → `agents/` (the v2.0 A2A platform — start at `agents/CLAUDE.md`)
- **"MCP server"** or **"Azure Functions"** → `functions/`
- **"the eval app"**, **"the Oracle app"**, **"v1.x"**, legacy **"evaluation"** / **"migration quality"** UI → `content-authoring-eval/` (FROZEN, D5 — don't modify; the *new* eval lives in `agents/eval-service/`)
- **"Agent SDK"** or **"experiments"** → `agent-claude-sdk/`
- **"Make.com"** or **"prompts"** → `make-dot-com/` (Make.com *interop* for the platform is in `agents/migration-agent/`)
- **"API testing"** or **"Bruno"** → `bruno/`
- **"admin.hlx.page"**, **"AEM Config Service"**, **"site config"**, **"undefined preview URL"** → `hlx-admin/` (invoke the hlx-admin-api-executor skill)

### Files That Should NOT Be Committed

- `functions/.env` - Contains secrets (ANTHROPIC_API_KEY, DALIVE_BEARER_TOKEN)
- `content-authoring-eval/.env.local` - Contains CLAUDE_CODE_OAUTH_TOKEN
- `content-authoring-eval/.env.docker` - Contains production secrets
- `agent-claude-sdk/*/.env` - OAuth tokens and API keys
- `agents/.env` - Platform secrets (R2 keys, A2A_EDGE_TOKEN, MAKECOM_WEBHOOK_URL); `agents/.env.example` is the tracked template
- `agents/{data/,output/,*.db,.next/}` - Local stores, artifact stand-in, build output (gitignored)
- `node_modules/` - Package dependencies (gitignored)
- `.DS_Store` - macOS metadata (gitignored)

## Architecture Patterns

### MCP Integration Patterns

**functions/** uses MCP SDK Server:
- JSON-RPC 2.0 over HTTP
- Session management with Bearer tokens
- Tool implementations in McpTools.js
- stdio-to-HTTP bridge for Claude Desktop

**content-authoring-eval/** uses Agent SDK with MCP tools:
- Playwright MCP for browser automation
- Bash, Read, Write tools for file operations
- `bypassPermissions` mode for autonomous tool use

### Testing Philosophy

**Real tests only**: No mocks, no stubs across all projects.

- `functions/`: E2E tests with real Anthropic + da.live APIs
- `content-authoring-eval/`: Manual testing via web UI + curl
- `agent-claude-sdk/`: Ad-hoc testing per agent
- `make-dot-com/`: Manual testing in Make.com workflows

### Authentication Patterns

All projects support:
1. **OAuth Token** (Claude Pro/Max)
   - Setup: `npm install -g @anthropic-ai/claude-cli && claude setup-token`
   - Stored in: `~/.config/@anthropic-ai/claude/oauth_token`
2. **API Key** (Developers)
   - Get from: https://console.anthropic.com/
   - Add to project `.env` files

## Release & Deployment

This monorepo uses **lockstep versioning** + **trunk-based releases** — tag directly from `main`.

### Current State
- **Current version**: `v2.9.3` (agents platform, the active line) · `v1.1.0` = the frozen legacy line
- **Branch model**: Trunk-based; `main` is the only long-lived branch
- **Strategy doc**: [`RELEASES.md`](./RELEASES.md) · **Per-version history**: [`CHANGELOG.md`](./CHANGELOG.md) — update it in the same commit as any version bump
- **Strategy history**: A `release/1.0` branch existed from 2026-01-01 to 2026-05-12 but was merged into `main` and deleted — that flow added overhead without benefit for a single-maintainer repo

### Cutting a Release (`agents/` platform — the active v2.x line)

```bash
git checkout main && git pull
# Bump agents/package.json "version" → e.g. 2.9.0, and add the CHANGELOG.md entry
git commit -am "chore(agents): bump version to 2.9.0"
git push
git tag -a v2.9.0 -m "Release 2.9.0"
git push origin v2.9.0              # tag push triggers the Cloudflare deploy (deploy-agents.yml)
gh release create v2.9.0 --generate-notes
```

The frozen v1.x line follows the same flow with `content-authoring-eval/package.json` and a `v1.*` tag (Oracle deploy) — only for emergency fixes to the frozen backup.

### Deployment Mechanics

**Workflow**: `.github/workflows/deploy-content-authoring-eval.yml` — triggered by `push: tags: ['v1.*']` only (the frozen v1.x line). GitHub ignores `paths` filters on tag pushes, so the tag pattern is the only effective gate — `v2.x+` tags (the agents/ platform) deliberately do NOT match and trigger no Oracle deploy.

1. Multi-arch Docker build (`linux/amd64,linux/arm64`) from `content-authoring-eval/Dockerfile`
2. Push to GHCR: `ghcr.io/jackzhaojin/azure-da-mcp/content-authoring-eval:vX.Y.Z` + `:latest`
3. SSH into Oracle Cloud VM, `docker compose down && up -d` at `~/jack-dev-server-configs/server/oracle-arm4-free-vm/deploy`
4. 60s healthcheck loop

**Emergency / rollback / redeploy without rebuild**: use `.github/workflows/deploy-only-content-authoring-eval.yml` (manual `workflow_dispatch`) — pick an existing image tag and `deploy`, `restart`, or `rollback`.

### Tag-Movement Gotchas

If you ever need to re-point a tag (e.g., because the tagged commit was wrong):
1. **Cancel any in-flight deploy** first (`gh run cancel <run-id>`) to avoid two builds racing on Oracle
2. Delete local + remote: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
3. Re-create the tag and push
4. Confirm the new deploy started: `gh run list --limit 1`

**Tags should be treated as immutable** once they've shipped. Moving a tag invalidates GHCR images already pulled by clients. Only re-point a tag if no consumer has used it yet.

### Functions Subproject

`functions/` deploys separately via `.github/workflows/main_jack-mcp-azure-ai-function.yml` on pushes to `main` — not tag-driven. To deploy MCP server changes, just merge to `main`.

### Agents Platform (v2.0) Subproject

`agents/` deploys to **Cloudflare Workers + Containers** via `.github/workflows/deploy-agents.yml` — triggered by **v2.x-and-later** tags (`v[2-9].*` / `v[1-9][0-9].*`) and manual `workflow_dispatch`. It builds all four container images on the GitHub runner and runs `wrangler deploy` (the same `npm run deploy` you'd run locally). The v1.* and v2.x+ tag lines are mutually exclusive: `v1.*` → Oracle eval app, `v2.x+` → this mesh, neither crosses over. Requires repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (container-runtime secrets already persist on the Worker). Details: [`agents/deploy/CLAUDE.md`](./agents/deploy/CLAUDE.md#ci-deploy-github-actions).

## Common Issues

### Node Version Errors
**Symptom**: `Error: Incompatible Node.js version`
**Fix**: Use Node 20 for agents/ and content-authoring-eval/; Node 22 for functions/ and wrangler
```bash
nvm use 20   # agents/, content-authoring-eval/
nvm use 22   # functions/, wrangler
```

### Missing Dependencies
**Symptom**: `Cannot find module ...`
**Fix**: Install dependencies in the correct subproject
```bash
cd <subproject>
npm install
```

### Wrong Directory
**Symptom**: Commands don't work, files not found
**Fix**: Always `cd` to the subproject directory first

### Environment Variables Missing
**Symptom**: API errors, authentication failures
**Fix**: Copy `.env.example` to `.env` and add secrets
```bash
cp .env.example .env
# Edit .env with your keys
```

## Development Tips

1. **Use subproject documentation**: Each has detailed CLAUDE.md or README.md
2. **Check git status**: `git status` shows which subproject has changes
3. **Independent testing**: Test each subproject separately
4. **Shared resources**: `specs/` and `ai-docs/` contain cross-project docs

## Documentation Map

### Root Level (Monorepo Overview)
- `README.md` - User-facing monorepo overview (references child README.md files)
- `CLAUDE.md` - This file (AI context, references child CLAUDE.md files)
- `CHANGELOG.md` - Per-minor-version history of both release lines (update with every version bump)
- `RELEASES.md` - Release process: versioning, tagging, deployment automation

### agents/ (A2A Agent Platform — v2.x, flagship)
- `agents/CLAUDE.md` - Hub: structure, run, conventions, Cloudflare infra
- `agents/README.md` - User-facing overview + status
- `agents/<workspace>/CLAUDE.md` - Per-workspace AI context (a2a-common, eval-service, content-gen, migration-agent, coordinator, store-mcp, e2e, deploy)
- `agents/docs/` - `r2-setup.md`, `tunnel-setup.md`, `makecom-scenario-checklist.md`, `model-matrix.md`
- `ai-docs/README.md` - Index of every planning PRD + as-built report
- `ai-docs/2026-06-08-a2a-platform-v2.0/` - As-built build report (architecture + sequence diagrams)
- `ai-docs/2026-08-29-model-assessment/` - Five-model migration benchmark (K3 confirmed as default)
- `ai-docs/2026-09-08-model-assessment-with-memory/` - The same benchmark re-run on v2.9 with agent memory (every model held or improved; evidence table; v2.9 version history)
- `ai-docs/2026-06-05-a2a-agent-platform/` - The planning PRD (decisions D1–D6)

### hlx-admin/ (AEM Admin Operations)
- `hlx-admin/CLAUDE.md` - How the dated execution-log dirs work, auth paths, skill link

### functions/ (Azure Functions MCP Server)
- `functions/CLAUDE.md` - Complete developer guide for MCP server

### content-authoring-eval/ (Evaluation App)
- `content-authoring-eval/README.md` - User guide for eval app
- `content-authoring-eval/CLAUDE.md` - AI context for eval agents
- `content-authoring-eval/DEPLOYMENT.md` - Docker deployment guide

### agent-claude-sdk/ (Experiments)
- `agent-claude-sdk/README.md` - Overview of all agents
- `agent-claude-sdk/CLAUDE.md` - AI context for SDK experiments
- `agent-claude-sdk/*/README.md` - Per-agent documentation

### make-dot-com/ (Prompts)
- `make-dot-com/README.md` - Root overview of prompt versioning
- `make-dot-com/CLAUDE.md` - AI context for prompt engineering
- `make-dot-com/v1-content-migration/README.md` - Prompt usage guide
- `make-dot-com/v1-content-migration/AGENT-LOG.md` - Development history

### bruno/ (API Testing)
- `bruno/README.md` - Bruno collections guide
- `bruno/CLAUDE.md` - AI context for API testing

## Memory Management

**For Claude Code**: This monorepo contains multiple independent projects. When working on a task:

1. Identify which subproject the task belongs to
2. Read that subproject's CLAUDE.md for specific context
3. Work within that subproject directory
4. Don't load unnecessary context from other subprojects
5. Use TodoWrite to track tasks within a subproject

**Context prioritization**:
- High: Subproject-specific CLAUDE.md
- Medium: Subproject README.md, source files
- Low: Other subprojects' documentation
- Minimal: Specs and ai-docs (reference only)

## Related Documentation

- `specs/` - Feature specifications and planning docs (historical)
- `ai-docs/` - Planning PRDs + as-built reports (public + active; indexed in [`ai-docs/README.md`](./ai-docs/README.md); latest: `2026-09-08-model-assessment-with-memory/`)

---

**Last Updated**: 2026-09-08
**Primary Maintainer**: jackjin
**Repository**: Personal monorepo for AI content authoring tools
**Version lines**: **v2.x** = the `agents/` A2A platform (flagship, **v2.9.3 deployed on Cloudflare**; `v2.x+` tags trigger `deploy-agents.yml`) · **v1.1.0** = legacy `content-authoring-eval` (**deprecated**, frozen backup). `agent-claude-sdk/` is also **deprecated**. Trunk-based, tag from `main`; history in [`CHANGELOG.md`](./CHANGELOG.md).
