# A2A Agent Platform — Multi-Part PRD

**Date**: 2026-06-05
**Status**: Draft for review
**Author**: Jack Jin (with Claude Code)
**Driver**: adaptTo() conference, September 2026 — this platform is the demo/talk material
**Supersedes**: Nothing — first PRD on this topic (see prior-art notes below)

---

## Executive Summary

Reboot the monorepo around **decoupled, independently-addressable AI agents** that communicate via the **A2A protocol** (Linux Foundation, spec v1.0):

- **Content Generator Agent** (new) — generates content briefs and synthetic "legacy" source pages. One Agent Card, two pluggable backends (Claude Agent SDK; Make.com scenario), mirroring the Migration agent
- **Migration Agent** (exists as Make.com prompt + skills) — authors content into da.live via the custom MCP server, validates with Playwright "agentic eyes". One Agent Card, two backends (Agent SDK; Make.com)
- **Eval Agent** (exists, coupled) — extracted from the Next.js app into a headless, job-based, parallelizable service
- **Orchestrator** (new) — an **intelligent** A2A client that, given an intent and a starting state, decides *which* of generate / migrate / evaluate are needed — it is not a fixed pipeline. Runs 1x or Nx with concurrency budgets and variance reporting
- **UI** (exists, rebuilt as pure client) — Next.js reads Supabase; localStorage and in-memory batch Maps are retired

The generate → migrate → eval closed loop — *synthesize source → migrate to EDS → eval the result, 10 times in parallel, with aggregate scoring* — is the headline capability, but it is **one route the orchestrator can take, not the only one**: when content already exists it starts at migrate; when content is already migrated it starts at evaluate; and it can stop after any stage once the goal is met.

> **Agent Card pattern (platform-wide)**: a single Agent Card fronts pluggable backends (Agent SDK or Make.com). Any Make.com backend can itself fan out to multiple models/agents — e.g. the Kimi K2.6 Chinese model — without changing the A2A contract.

## Decisions Log (2026-06-05)

| # | Decision | Choice | Rationale | Rejected alternatives |
|---|----------|--------|-----------|----------------------|
| D1 | da.live MCP server | **Keep custom `functions/` MCP** | Adobe's [da-mcp](https://github.com/adobe-rnd/da-mcp) (early access) has **no preview/publish** (`admin.hlx.page`) and requires real `Authorization` headers, breaking Make.com's header-less `args.bearerToken` "Hack 2". Custom server already does CRUD + preview/publish + 3-tier auth (S2S, header, arg-bearer). | Hybrid (Adobe CRUD + custom gap-filler), full migration to Adobe. **Watch item**: revisit if Adobe adds publish (their issue list doesn't show it as of 2026-06). |
| D2 | A2A depth | **Full official A2A SDK from day one** | Learning is a primary goal; the trio (content-gen, migration, eval) is genuinely multi-agent; spec v1.0 is stable with production JS SDK. Agent Cards + Task lifecycle + push notifications map exactly onto our needs. | A2A-shaped custom job API (less learning), plain webhooks/BullMQ (no learning, likely redesign later). |
| D3 | Runtime + persistence | **Oracle VM (4-CPU ARM) Docker compose for compute; Supabase for persistence** (recommended — confirm) | Compute stays on infra we already operate for free. Supabase gives Postgres + Storage (screenshots!) + Realtime (live UI progress) + auto REST + an official MCP server (agents can query eval results — thematic win). One hard new learning per cycle: A2A is this cycle's learning; don't stack Cosmos DB on top. | Azure Cosmos DB (the "harder/learning" option — deferred, revisit when the platform is stable and you want Azure-native depth), in-VM Postgres container (more ops, no Realtime/Storage/MCP for free). |

## Document Map

| Part | File | Covers |
|------|------|--------|
| 1 | [part-1-architecture.md](./part-1-architecture.md) | System overview, agent roster, unifying interface, monorepo layout, tech stack |
| 2 | [part-2-eval-service.md](./part-2-eval-service.md) | Decoupling the eval engine: current coupling audit, headless service, Supabase schema, browser pool, parallelization |
| 3 | [part-3-a2a-protocol-layer.md](./part-3-a2a-protocol-layer.md) | A2A SDK adoption: Agent Cards, Task lifecycle, streaming, push notifications, Make.com interop, auth |
| 4 | [part-4-content-generator-agent.md](./part-4-content-generator-agent.md) | New agent: brief mode + synthetic-source mode, two backends (Agent SDK / Make.com), contracts, prompts |
| 5 | [part-5-migration-agent.md](./part-5-migration-agent.md) | Wrapping migration as an A2A agent with two backends (Agent SDK + skills, Make.com scenario); Playwright concurrency |
| 6 | [part-6-orchestration-ui-rollout.md](./part-6-orchestration-ui-rollout.md) | Orchestrator (intelligent routing + Nx fan-out + variance reporting), UI rebuild, milestones to adaptTo(), risks, open questions |

## In Scope

- Extracting the eval engine from `content-authoring-eval/` into a headless A2A service
- New `agents/` monorepo subproject (eval-service, content-gen, orchestrator, shared a2a-common)
- Supabase persistence (jobs, reports, artifacts) replacing localStorage + `globalThis.__batchStorage`
- A2A protocol layer on all three agents + orchestrator
- Make.com interop via A2A push-notification webhooks
- Browser concurrency management (pool/semaphore) for parallel evals and migrations
- UI rebuild as a pure client (Supabase reads + A2A submits)

## Out of Scope

- **The EDS website build** — separate effort with its own PRD (it is, however, a *dependency*: the closed loop needs a target site with a block library)
- Changes to `functions/` MCP server beyond what migration-agent wrapping requires (D1: keep as-is)
- Adopting Adobe's da-mcp (watch item only)
- Multi-tenant auth / productionizing for external users — this is a personal learning platform with a conference demo bar
- hlx-admin, bruno, make-dot-com prompt content (consumed, not changed — except documented contract updates in Part 5)

## Prior Art (reference, don't duplicate)

- `ai-docs/strategy/strategy-how.md:83` — "Decoupling: MCP as the Orchestration Layer" (Oct 2025): same rationale (separate scaling profiles for CPU-heavy AI vs I/O-heavy serving), different layer
- `ai-docs/plan/plan-how.md:879` — "WebSocket Real-Time Updates" Option C (Request-ID tracking): the closest prior sketch of the job-submission pattern; A2A Tasks are the standards-based version of this
- `agent-claude-sdk/cms-migration-evaluator/src/batchEvaluator.ts` — the CLI-era batch orchestrator with file persistence; blueprint for the eval-service job runner

## Naming

Working name for the platform: **"da-agent-mesh"** (subject to bikeshedding). New code lives under `agents/` in this monorepo.
