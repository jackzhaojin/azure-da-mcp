# Part 1 — Architecture

## Vision

One **unifying interface** (the A2A Task) over **decoupled capabilities** (agents). Anything that can speak HTTP + JSON-RPC can drive any agent: the coordinator, Make.com, a Claude Code skill, curl, or another agent. Anything that can receive a webhook can be notified when work completes. Run a pipeline once interactively, or fan it out 10x and aggregate — same interface, no code change in the agents.

The driver above the agents is an **intelligent coordinator**, not a hard-coded pipeline: given an intent and the current state of the content, it decides which capabilities to invoke (generate, migrate, evaluate — any subset, any order) and stops when the goal is met. Capabilities are addressable behind **Agent Cards**; where it helps, a card fronts pluggable backends — the migration agent runs the same `migration.run` contract on Make.com (primary), the Claude Agent SDK, or opencode/Kimi K2.6, while content-gen is a single Agent SDK backend.

## Goals

1. **Decouple** the eval engine from the Next.js UI, browser localStorage, and in-memory state
2. **Learn A2A** hands-on: Agent Cards, Task lifecycle, SSE streaming, push notifications, the official JS SDK
3. **Intelligent coordination**: a content coordinator that decides which of generate / migrate / evaluate are needed for a given intent and starting state — the closed loop (generate → migrate → eval) is one route it can take, not a fixed sequence, and it need not end in evaluation
4. **Parallelize**: Nx pipeline runs with bounded browser/CPU concurrency on the 4-CPU Oracle ARM VM
5. **Measure variance**: same input migrated 10x and evaluated 10x → mean/stddev per eval dimension → migration-agent *consistency* becomes a first-class metric (this is the genuinely novel demo for adaptTo())

## Non-Goals

- Cross-vendor agent discovery (A2A's marquee enterprise feature) — our agents are all ours; we use discovery mechanics for learning, not necessity
- Replacing the `functions/` MCP server (D1)
- Horizontal scale-out beyond one VM

## System Overview

```
                                ┌────────────────────────────────────────────┐
                                │            Oracle Cloud ARM VM             │
                                │            (docker compose)                │
   ┌──────────────┐  A2A tasks  │  ┌──────────────┐      ┌────────────────┐  │
   │ Coordinator  │────────────────▶│ Content-Gen  │      │  Eval Agent    │  │
   │ (intelligent │             │  │ (Agent SDK)  │      │  (A2A server,  │  │
   │  A2A client) │────────────────────────────────────▶ │  worker pool,  │  │
   └──────┬───────┘             │  └──────────────┘      │  browser pool) │  │
          │                     │  ┌──────────────┐      └───────┬────────┘  │
          │                     │  │ Migration    │              │           │
          └────────────────────────▶ Agent (A2A   │              │           │
                                │  │ facade)      │              │           │
   webhooks (push notifications)│  └──┬───────┬───┘              │           │
   ◀───────────────────────────────────┘       │                 │           │
                                └──────────────│─────────────────│───────────┘
                                               │                 │
              ┌──────────────┐        ┌────────▼──────┐   ┌──────▼─────────┐
              │   Make.com   │◀──────▶│ functions/    │   │   Supabase     │
              │  (alt back-  │  MCP   │ Azure MCP     │   │ Postgres +     │
              │  end/caller) │        │ (kept, D1)    │   │ Storage +      │
              └──────────────┘        └───────┬───────┘   │ Realtime       │
                                              │           └──────▲─────────┘
                                       ┌──────▼───────┐          │ reads (Realtime)
                                       │   da.live /  │   ┌──────┴─────────┐
                                       │ admin.hlx.page│  │  Next.js UI    │
                                       └──────────────┘   │ (pure client)  │
                                                          └────────────────┘
```

## Agent Roster

| Agent | Status | A2A role | Core capability | Backend |
|-------|--------|----------|-----------------|---------|
| **Eval Agent** | Extract from `content-authoring-eval/src/lib/` | Server | 4-dimension page evaluation (structure, accessibility, content, visual), single + batch | Claude Agent SDK + Playwright (deterministic + agentic) |
| **Migration Agent** | Facade over existing implementations | Server | Source → EDS page on da.live, with self-validation loop | Three backends: **Make.com scenario (primary)**; Agent SDK + `da-live-author-playwright` skill; opencode CLI / Kimi K2.6 |
| **Content Generator Agent** | New | Server | Briefs and synthetic "legacy" source pages | Claude Agent SDK (single backend) |
| **Coordinator** | New | Client | Intelligent routing (decides stages from intent + state), pipeline composition, Nx fan-out, aggregation | Plain TypeScript + A2A SDK client (agentic planner) |

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
| Next.js UI | A2A submit through a thin API route | Supabase Realtime subscription (not SSE — survives reconnects) |

> Edge principle (decided 2026-06-05): **A2A is the internal mesh protocol; external callers speak flat webhooks/REST through one shim in `a2a-common`.** Full A2A (cards, streaming, contextIds) is reserved for agent↔agent and coordinator↔agent traffic.

## Persistence Layer (Supabase — D3)

- **Postgres**: `runs`, `tasks`, `eval_reports`, `artifacts` (schema in Part 2)
- **Storage**: bucket `artifacts/` for screenshots, generated source HTML, diff images — fixes today's ephemeral `public/`/`output/` writes that vanish on container restart
- **Realtime**: UI subscribes to `tasks` and `eval_reports` changes — replaces bespoke SSE plumbing for the dashboard
- **MCP server**: Supabase's official MCP server connected to Claude Code → "show me the variance across last night's 10 runs" becomes a conversational query. Demo gold.

Agents own their writes: each agent persists its own task rows and artifacts; the coordinator writes `runs`. The A2A layer is the source of truth for task *state transitions*; Supabase is the durable mirror + query surface.

## Monorepo Layout (new subproject)

```
agents/
  a2a-common/          # shared: A2A server bootstrap, task store adapter (Supabase),
                       #   push-notification sender, auth middleware, logging
  contracts/           # JSON Schemas for task payloads + artifacts, versioned
  eval-service/        # Part 2 — extracted eval engine + A2A server
  content-gen/         # Part 4
  migration-agent/     # Part 5 — facade + sdk backend
  coordinator/        # Part 6 — CLI + pipeline runner
  docker-compose.yml   # local dev; production compose lives with the Oracle deploy repo
```

`content-authoring-eval/` keeps the Next.js UI (slimmed to pure client in Part 6). The eval engine code (`src/lib/agents/`, `evaluator.ts`, `prompts/`) **moves** to `agents/eval-service/` — moved, not copied, to avoid drift; the Next.js app loses its engine imports entirely.

## Tech Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | TypeScript / Node 20 | Matches existing eval code; A2A JS SDK |
| A2A | Official a2aproject JS SDK (`@a2a-js/sdk` — verify exact package at impl time) | JSON-RPC binding only in v1; skip gRPC and Signed Agent Cards |
| Agent runtime | `@anthropic-ai/claude-agent-sdk` `query()` | Same as today; upgrade pinned model `claude-sonnet-4-5-20250929` → `claude-sonnet-4-6` (cheap quality bump, do it during extraction) |
| Browser | Playwright (direct lib for deterministic; Playwright MCP per `query()` for agentic) | Bounded by a global semaphore — Part 2 |
| DB/Storage/Realtime | Supabase (managed, free tier) | D3 |
| Deploy | Docker compose on Oracle VM; GHCR images via existing tag-driven workflow pattern | Extend `.github/workflows/` with an `agents` deploy job |
| Secrets | `.env` per service (gitignored), same pattern as today | Supabase service key, Anthropic key, DA IMS creds |
