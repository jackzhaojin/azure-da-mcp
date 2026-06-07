# Part 1 — Architecture

## Vision

One **unifying interface** (the A2A Task) over **decoupled capabilities** (agents). Anything that can speak HTTP + JSON-RPC can drive any agent: the coordinator, Make.com, a Claude Code skill, curl, or another agent. Anything that can receive a webhook can be notified when work completes. Run a pipeline once interactively, or fan it out 10x and aggregate — same interface, no code change in the agents.

The driver above the agents is an **intelligent coordinator**, not a hard-coded pipeline: given an intent and the current state of the content, it decides which capabilities to invoke (generate, migrate, evaluate — any subset, any order) and stops when the goal is met. Capabilities are addressable behind **Agent Cards**; where it helps, a card fronts pluggable backends — the migration agent runs the same `migration.run` contract on Make.com (primary), the Claude Agent SDK, or opencode/Kimi K2.6, while content-gen is a single Agent SDK backend.

## Goals

1. **Decouple** the eval engine from the Next.js UI, browser localStorage, and in-memory state
2. **Learn A2A** hands-on: Agent Cards, Task lifecycle, SSE streaming, push notifications, the official JS SDK
3. **Intelligent coordination**: a content coordinator that decides which of generate / migrate / evaluate are needed for a given intent and starting state — the closed loop (generate → migrate → eval) is one route it can take, not a fixed sequence, and it need not end in evaluation
4. **Parallelize**: Nx pipeline runs with bounded browser/CPU concurrency (dev machine first; Cloudflare Container instance budgets at deploy)
5. **Measure variance**: same input migrated 10x and evaluated 10x → mean/stddev per eval dimension → migration-agent *consistency* becomes a first-class metric (this is the genuinely novel demo for adaptTo())
6. **Learn Cloudflare's developer platform** (Containers, Workers, D1, R2) as the deployment story — deployment itself sequenced last (D6)

## Non-Goals

- Cross-vendor agent discovery (A2A's marquee enterprise feature) — our agents are all ours; we use discovery mechanics for learning, not necessity
- Replacing the `functions/` MCP server (D1)
- Touching `content-authoring-eval/` or its Oracle deployment — frozen (D5)
- Horizontal scale-out beyond one container instance per agent

## System Overview

```
        ┌───────────────────────────────────────────────────────────────┐
        │  The mesh — 4 Express A2A servers                             │
        │  (localhost processes now → 1 Cloudflare Container each, D6)  │
        │                                                               │
        │   ┌──────────────┐    A2A     ┌────────────────────┐          │
        │   │ Coordinator  │───────────▶│ Content-Gen  :4002 │          │
        │   │ :4004        │    A2A     ├────────────────────┤          │
        │   │ client+server│───────────▶│ Migration    :4003 │──MCP──┐  │
        │   │ + CLI        │    A2A     ├────────────────────┤       │  │
        │   └──────▲───────┘───────────▶│ Eval         :4001 │       │  │
        │          │                    │ (browser pool)     │       │  │
        │          │                    └─────────┬──────────┘       │  │
        └──────────┼──────────────────────────────┼──────────────────┼──┘
                   │ A2A coordinate.run           │ writes           │
        ┌──────────┴──────┐         ┌─────────────▼──────┐   ┌───────▼───────┐
        │ agents/ui       │  reads  │ Cloudflare D1      │   │ functions/    │
        │ (Next.js: auth, │────────▶│ (SQLite) + R2      │   │ Azure MCP     │
        │ runs, trigger)  │ (poll)  │ (artifacts)        │   │ (kept, D1)    │
        └─────────────────┘         └────────────────────┘   └───────┬───────┘
                                                                     ▼
        ┌────────────┐   invoke via edge shim / receive    da.live /
        │  Make.com  │◀═══ callbacks, through cloudflared  admin.hlx.page
        └────────────┘     tunnel (public ingress in dev)

        Frozen (D5): the content-authoring-eval Next.js app keeps running
        on the Oracle VM, untouched — it is no longer part of this system.
```

## Agent Roster

| Agent | Status | A2A role | Core capability | Backend |
|-------|--------|----------|-----------------|---------|
| **Eval Agent** | Copy from `content-authoring-eval/src/lib/` (source frozen, D5) | Server | 4-dimension page evaluation (structure, accessibility, content, visual), single + batch | Claude Agent SDK + Playwright (deterministic + agentic) |
| **Migration Agent** | Facade over existing implementations | Server | Source → EDS page on da.live, with self-validation loop | Three backends: **Make.com scenario (primary)**; Agent SDK + `da-live-author-playwright` skill; opencode CLI / Kimi K2.6 |
| **Content Generator Agent** | New | Server | Briefs and synthetic "legacy" source pages | Claude Agent SDK (single backend) |
| **Coordinator** | New | Client **and server** (`coordinate.run`) | Intelligent routing (decides stages from intent + state), pipeline composition, Nx fan-out, aggregation | Plain TypeScript + A2A SDK (agentic planner); CLI + Express server |

(The `agents/ui` Next.js app is **not** an agent — it's an A2A *client* with a browser face; see Part 6.)

## The Unifying Interface

Every agent exposes:

1. **Agent Card** at `/.well-known/agent-card.json` — name, skills, input/output modes, auth scheme, endpoint
2. **A2A endpoints** (JSON-RPC over HTTP via the official JS SDK): `message/send`, `message/stream` (SSE), `tasks/get`, `tasks/cancel`, push-notification config
3. **Typed task payloads** (JSON Schema, versioned, in `agents/contracts/`) — see per-agent contracts in Parts 2/4/5
4. **Artifacts** as results — structured JSON + references to Supabase Storage objects (screenshots, generated HTML)

Task state machine (A2A standard): `submitted → working → completed | failed | canceled`. We do not use `input-required` in v1 (all tasks are fully specified up front).

**Callers by capability:**

| Caller | Submits via | Receives results via |
|--------|------------|---------------------|
| Coordinator | A2A SDK client (full protocol) | SSE stream or push notification |
| Make.com | **Edge webhook shim** `POST /hooks/{agent}/{skill}` (flat JSON; see Part 3 — no native A2A connector, no SSE support) | **Custom webhook trigger** (A2A push notifications are plain webhooks on the wire) — solves the 300s scenario timeout |
| Claude Code skill / curl / cron | Edge webhook shim (or raw JSON-RPC if desired) | Poll `tasks/get` or callback URL |
| agents/ui (Next.js) | API routes act as an A2A client → coordinator `coordinate.run` (or direct agent tasks) | Polls Cloudflare D1 / local SQLite (v1); SSE/WebSocket upgrade later only if polling chafes |

> Edge principle (decided 2026-06-05): **A2A is the internal mesh protocol; external callers speak flat webhooks/REST through one shim in `a2a-common`.** Full A2A (cards, streaming, contextIds) is reserved for agent↔agent and coordinator↔agent traffic.

## Persistence Layer (Cloudflare D1 + R2 — D3 revised 2026-06-06)

- **Cloudflare D1** (SQLite dialect): `runs`, `tasks`, `eval_reports`, `artifacts` (schema in Part 2). Local dev runs the **same SQL against a local SQLite file** — one set of migration files, two drivers; the store adapter in `a2a-common` hides which is active
- **R2**: bucket `artifacts/` for screenshots, generated source HTML, diff images — public bucket (r2.dev or custom domain), so synthetic sources are fetchable by Make.com and migration backends. **Used directly even during local dev** (S3-compatible API, free egress) so artifact URLs are always real and public — fixes today's ephemeral `public/`/`output/` writes
- **Live updates**: v1 is polling (`agents/ui` polls the store via its API routes) — no Realtime dependency. Upgrade path if polling chafes: SSE proxy or Durable Object WebSockets, at/after deploy
- **Conversational queries**: the old Supabase-MCP demo moment is replaced by Cloudflare's official MCP servers (verify D1 query support at impl time) or a ~50-line custom MCP server over the store — tracked as a demo-prep item (Part 6)

Agents own their writes: each agent persists its own task rows and artifacts; the coordinator writes `runs`. The A2A layer is the source of truth for task *state transitions*; the store is the durable mirror + query surface. **Sleep-tolerance rule** (for Cloudflare Containers' scale-to-zero later): a process restart must never lose task state — the store, not process memory, is authoritative, and in-process queues must be rebuildable on wake.

## Monorepo Layout (new subproject)

```
agents/
  a2a-common/          # shared: A2A server bootstrap (Express), store adapter (SQLite/D1),
                       #   R2 client, push-notification sender, auth middleware, edge shim, logging
  contracts/           # JSON Schemas for task payloads + artifacts, versioned
  eval-service/        # Part 2 — copied eval engine + A2A server            :4001
  content-gen/         # Part 4                                              :4002
  migration-agent/     # Part 5 — facade + 3 backends                        :4003
  coordinator/         # Part 6 — CLI + A2A server (coordinate.run)          :4004
  ui/                  # Part 6 — thin Next.js app (auth, runs, trigger)     :3000
```

`content-authoring-eval/` is **frozen** (D5): it keeps running on Oracle untouched, and nothing in this plan modifies that folder — so `deploy-content-authoring-eval.yml` can never trigger. The eval engine code (`src/lib/agents/`, `evaluator.ts`, `prompts/`) is **copied** — not moved — into `agents/eval-service/`; the old copy simply never changes again. **No Docker, no compose until the deployment milestone (D6)**: local dev is `npm run dev` per service, or one root script that starts all four servers.

## Tech Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | TypeScript / Node 20 | Matches existing eval code; A2A JS SDK |
| A2A | Official a2aproject JS SDK (`@a2a-js/sdk` — verify exact package at impl time) | JSON-RPC binding only in v1; skip gRPC and Signed Agent Cards |
| Agent runtime | `@anthropic-ai/claude-agent-sdk` `query()` | Same as today; upgrade pinned model `claude-sonnet-4-5-20250929` → `claude-sonnet-4-6` (cheap quality bump, do it during extraction) |
| Browser | Playwright (direct lib for deterministic; Playwright MCP per `query()` for agentic) | Bounded by a global semaphore — Part 2 |
| DB / Storage | Cloudflare D1 (SQLite dialect) + R2 (S3-compatible, public bucket) | D3 revised 2026-06-06; local dev = same SQL on a local SQLite file + real R2 |
| Deploy | **Last milestone (D6)**: Cloudflare Containers (one per agent) + fronting Worker router; `cloudflared tunnel` for public ingress during local dev | Nothing touches the Oracle deploy; new workflow lands at M5 |
| Secrets | `.env` per service (gitignored) locally; `wrangler secret` at deploy | Anthropic key, DA IMS creds, R2 access keys, mesh bearer token |

## Deployment Topology (D4 + D6)

**One Express server — and eventually one container — per agent.** Never a combined server. Rationale: blast-radius isolation for browser-heavy services (a wedged Chromium in eval must not kill a 20-minute in-flight migration), per-service browser-permit budgets, origin-scoped Agent Cards (`/.well-known/agent-card.json` is per-origin per RFC 8615 — one agent per origin is the idiomatic A2A topology), and wildly different image weights (content-gen needs no Chromium at all).

| Service | Local port | Cloudflare Containers instance at M5 (indicative) |
|---|---|---|
| eval-service | 4001 | `standard-3` (2 vCPU / 8 GiB) — browser pool |
| content-gen | 4002 | `lite`/`basic` (≤1 GiB) — no browser |
| migration-agent | 4003 | `standard-2` (1 vCPU / 6 GiB) — browsers for `sdk`/`opencode` backends |
| coordinator | 4004 | `basic` — planner LLM calls only |
| agents/ui | 3000 | Workers via OpenNext, or a small container — decide at M5 |

**Dev ingress**: one `cloudflared tunnel` with a stable hostname routes `/hooks/*` and `/callbacks/*` to the right local ports — Make.com works against a laptop. At M5 a fronting Worker takes over routing and the tunnel is retired. **Demo fallback**: if the M5 deploy slips, the conference demo runs exactly this local+tunnel setup — the platform is local-first by construction.
