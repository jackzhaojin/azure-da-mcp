# Azure DA.live MCP — Monorepo

A personal monorepo of AI-powered content authoring, migration, and evaluation tools for [da.live](https://da.live) (Adobe Edge Delivery Services), built on Claude and the Model Context Protocol (MCP).

The repository's center of gravity is **v2.0 — the `agents/` A2A Agent Platform**: a decoupled mesh of independently-addressable AI agents that *generate*, *migrate*, and *evaluate* content. The other projects are the supporting cast — the MCP server it authors through, the prompt library, the API/admin tooling, and the original evaluation app (now a **frozen v1.x backup**).

> **Two version lines.** **v2.0** = the new `agents/` platform (flagship, in active build). **v1.1.0** = the legacy `content-authoring-eval` Next.js app on Oracle — frozen and untouched as the safety net (decision D5). Its eval engine was *copied* into `agents/eval-service`, not moved.

---

## ⭐ The flagship: `agents/` — A2A Agent Platform (v2.0)

**Status**: M1–M4 built, tested, and on `main`; the closed loop runs end-to-end with **Kimi K2.6 really authoring da.live pages** (opencode backend, verified through the coordinator); the coordinator ships its **own Next.js dashboard** on :4004; Cloudflare D1/R2 + a live `cloudflared` tunnel; container deploy is the last milestone.
**Purpose**: A multi-agent mesh speaking the [A2A protocol](https://a2a-protocol.org/) (official `@a2a-js/sdk`), where each agent is its own Express server with an Agent Card, Task lifecycle, and streaming.

The headline capability is a **closed loop**: the **coordinator** asks **content-gen** to fabricate a synthetic "legacy" page, hands it to the **migration agent** to author into da.live, then to the **eval agent** to score the result across four dimensions — fanned out and aggregated into variance stats. But the coordinator routes intelligently: it can also *just evaluate*, *just migrate*, *generate+migrate*, or *auto*-decide; it need not start at generation or end at evaluation.

| Agent | Port | Does |
|-------|------|------|
| coordinator | 4004 | Routes, fans out, aggregates variance (A2A client **and** server) — **plus its own Next.js dashboard** at `:4004/` (trigger, live activity feed, branch grid) |
| content-gen | 4002 | Content briefs + synthetic legacy source pages (template tier) |
| migration | 4003 | Authors into da.live — one Agent Card over backends (`dryrun` / **`opencode` = Kimi K2.6, real pages verified** / Make.com / SDK stub) |
| eval | 4001 | 4-dimension migration-quality evaluation (engine copied from v1.x; deterministic always, agentic when Claude creds are set) |
| ui | 3000 | Legacy thin Next.js dashboard — auth, runs, manual trigger (superseded by the coordinator dashboard) |

**Quick Start**:
```bash
cd agents
nvm use 20 && npm install
cp .env.example .env && set -a; source .env; set +a   # secrets gitignored
npm run dev:eval & npm run dev:content-gen & npm run dev:migration & npm run dev:coordinator &
npm run loop -- "rooftop solar maintenance" --fan-out 2   # drive the closed loop
npm run loop -- "topic" --backend opencode --site da-live-postal-2025-07 --owner jackzhaojin  # Kimi K2.6 authors a REAL page
# coordinator dashboard: http://localhost:4004/
```

**Documentation**:
- [agents/README.md](./agents/README.md) — overview + status · [agents/CLAUDE.md](./agents/CLAUDE.md) — dev hub
- **Build report**: [ai-docs/2026-06-08-a2a-platform-v2.0/](./ai-docs/2026-06-08-a2a-platform-v2.0/) — as-built architecture + sequence diagrams
- **Plan**: [ai-docs/2026-06-05-a2a-agent-platform/](./ai-docs/2026-06-05-a2a-agent-platform/) — the PRD (decisions D1–D6)

**Key Features**:
- Official A2A SDK end-to-end: Agent Cards, `message/stream` (SSE), `tasks/get`, push notifications, an edge webhook shim
- **Model-vendor-swappable migration**: the same contract, MCP server, and skill run under `dryrun`, Make.com, or **Kimi K2.6 headless via opencode** — real da.live pages authored, published, and scored
- **Coordinator dashboard** (Next.js 15 riding the same :4004 process — A2A wire surface untouched): trigger runs, watch live tool/skill activity (`K2.6 → dalive_save_dalive_content`), branch grids, variance tables
- Persistence on **Cloudflare D1** (same SQL as local SQLite) + artifacts on **R2** (public `r2.dev`)
- **Make.com interop** through a live named `cloudflared` tunnel (`a2a.xpri.ai`)
- Browser-pooled, job-queued, restart-survivable eval; deterministic always + agentic when Claude creds are configured
- Three real-server test tiers (fast/CI, live, soak) — no mocks

---

## Supporting projects

### `functions/` — Azure Functions MCP Server
**Status**: Production-ready · **Node 22+**
HTTP MCP server for AI-assisted content editing on da.live — the server the migration agent authors *through* (decision D1: kept over Adobe's da-mcp). Six MCP tools (list/get/save/create/folder/preview-publish), multi-LLM, Claude Desktop stdio bridge.
```bash
cd functions && npm install && npm start
```
[functions/README.md](./functions/README.md) · [functions/CLAUDE.md](./functions/CLAUDE.md)

### `content-authoring-eval/` — CMS Migration Evaluator (v1.x, **FROZEN**)
**Status**: Production on Oracle Cloud — **frozen backup; do not modify (D5)**
The original Next.js app with 4 evaluation agents. Superseded by `agents/eval-service` (its engine was copied out). Still running as the safety net; its deploy workflow must never be triggered by platform work.
[content-authoring-eval/README.md](./content-authoring-eval/README.md)

### `agent-claude-sdk/` — Agent SDK Experiments
**Status**: Active prototyping
TypeScript agents for exploring the Claude Agent SDK (CLI chat, PDF generator, an earlier eval prototype, third-party demos). The blueprint for several platform pieces.
[agent-claude-sdk/README.md](./agent-claude-sdk/README.md)

### `make-dot-com/` — Make.com Agent Prompts
**Status**: Active versioning
Progressive prompt files for the EDS migration agent on Make.com (MVP → +Memory → +BlockLibrary → Full). Copy-pasted into Make.com's UI, not deployed via Git. The platform's migration agent calls these Make.com scenarios as its primary backend.
[make-dot-com/README.md](./make-dot-com/README.md)

### `bruno/` — API Testing Collections
**Status**: Active use
Bruno HTTP collections for da.live Admin API and Azure Functions endpoints.
[bruno/README.md](./bruno/README.md)

### `hlx-admin/` — AEM Admin API Execution Logs
**Status**: Active use
Auditable, one-at-a-time AEM Edge Delivery admin operations — dated working dirs with `EXECUTION.md` plans + request/response artifacts, driven by the [hlx-admin-api-executor skill](https://github.com/jackzhaojin/ai-builder-kit/tree/main/skills/hlx-admin-api-executor) (GET/SET/GET + human approval).

### `references/` — POCs & spikes
De-risking spikes referenced by the platform: `references/cloudflare/` (long-SSE-through-Containers, container→D1 worker-proxy), `references/kimi/` (Kimi K2.6 / opencode backend), `references/claude/` (Agent SDK POCs).

---

## Repository Structure

```
azure-da-mcp/
├── agents/                    # ⭐ v2.0 A2A Agent Platform (Node 20, npm workspaces)
│   ├── a2a-common/            #    shared bootstrap (server, stores, client, migrations)
│   ├── eval-service/          #    :4001 eval agent (engine copied from v1.x)
│   ├── content-gen/           #    :4002 briefs + synthetic sources
│   ├── migration-agent/       #    :4003 swappable backends (dryrun/opencode·Kimi/makecom/sdk)
│   ├── coordinator/           #    :4004 routing + fan-out + variance + CLI + Next.js dashboard
│   ├── ui/                    #    :3000 legacy thin Next.js dashboard
│   ├── store-mcp/             #    stdio MCP — conversational store queries
│   ├── e2e/                   #    real-server tests (fast/live/soak)
│   └── docs/                  #    r2-setup · tunnel-setup · makecom checklist
├── functions/                 # Azure Functions MCP Server (Node 22)
├── content-authoring-eval/    # v1.x eval app — FROZEN backup (Node 20, Docker)
├── agent-claude-sdk/          # Agent SDK experiments (TypeScript)
├── make-dot-com/              # Make.com agent prompts (Markdown)
├── bruno/                     # API testing collections (Bruno)
├── hlx-admin/                 # AEM admin API execution logs (skill-driven)
├── references/                # POCs & spikes (cloudflare, kimi, claude)
├── ai-docs/                   # Planning PRDs + as-built reports (public)
├── RELEASES.md                # Release strategy and versioning
└── README.md                  # This file
```

## Releases & Versioning

Lockstep SemVer, **trunk-based** releases (tag directly from `main`) — see **[RELEASES.md](./RELEASES.md)**.

- **v1.1.0** — current released line: the legacy `content-authoring-eval` app (frozen backup). Tag push triggers the Oracle deploy.
- **v2.0** — the `agents/` platform. A **major** bump because it's a ground-up re-architecture, not a feature increment. Deliberately **not yet tagged/deployed** — deployment is the last milestone (D6); today it runs locally + via the `cloudflared` tunnel.

## Common Dependencies

- **Node.js**: 20.x (`agents/`, `content-authoring-eval/`), 22.x (`functions/`; also required for the Wrangler/Cloudflare CLI)
- **A2A SDK**: `@a2a-js/sdk` (the platform's protocol layer)
- **Claude / Anthropic**: `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`
- **MCP SDK**: `@modelcontextprotocol/sdk` (`functions/`, `agents/store-mcp`)
- **Cloudflare**: D1 + R2 + `cloudflared` (the platform's persistence + ingress)
- **Testing**: `vitest` (the platform's e2e tiers)

## Authentication

Claude API auth, used across projects:
1. **OAuth Token** (Claude Pro/Max): `npm install -g @anthropic-ai/claude-cli && claude setup-token`
2. **API Key** (developers): from [console.anthropic.com](https://console.anthropic.com/), into the project's `.env` as `ANTHROPIC_API_KEY`

The platform also uses a scoped **Cloudflare R2 API token** (in `agents/.env`); see [agents/docs/r2-setup.md](./agents/docs/r2-setup.md).

## Testing Philosophy

**Real tests only** — no mocks, no stubs. If it doesn't exercise actual behavior, we don't do it.

- `agents/`: real child-process servers over real A2A — **fast** (`npm run test:e2e`, CI), **live** (`npm run test:live`, real engine/browsers/R2), **soak** (`npm run test:soak`, 10× loop)
- `functions/`: E2E with real Anthropic + da.live APIs
- `content-authoring-eval/`: manual via web UI + curl
- `agent-claude-sdk/` / `make-dot-com/`: ad-hoc / in-platform

## Documentation Standards

Each subproject carries a **README.md** (user-facing: quick start, features, links) and a **CLAUDE.md** (AI context: architecture, gotchas, workflows). The `agents/` platform additionally gives each workspace its own `CLAUDE.md` and ships an as-built build report under `ai-docs/`.

## Related Resources

- [A2A Protocol](https://a2a-protocol.org/) · [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents) · [Anthropic API](https://docs.anthropic.com/) · [MCP Spec](https://modelcontextprotocol.io/) · [da.live Admin API](https://admin.da.live/) · [Cloudflare Developers](https://developers.cloudflare.com/)

## License

Apache License 2.0

---

**Last Updated**: 2026-06-10
**Primary Tools**: Claude Code, A2A SDK, Agent SDK, Azure Functions, Next.js, Cloudflare (D1/R2/Tunnel), MCP, opencode (Kimi K2.6)
