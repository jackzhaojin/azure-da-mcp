# A2A Agent Platform — Multi-Part PRD

**Date**: 2026-06-05
**Status**: Draft v2 — revised 2026-06-06 (D3 revised → Cloudflare D1/R2; D4–D6 added; Oracle/old app frozen; deployment sequenced last)
**Author**: Jack Jin (with Claude Code)
**Driver**: adaptTo() conference, September 2026 — this platform is the demo/talk material
**Supersedes**: Nothing — first PRD on this topic (see prior-art notes below)

---

## Executive Summary

Reboot the monorepo around **decoupled, independently-addressable AI agents** that communicate via the **A2A protocol** (Linux Foundation, spec v1.0):

- **Content Generator Agent** (new) — generates content briefs and synthetic "legacy" source pages. **Single backend: the Claude Agent SDK** (a near-pure LLM task — no Make.com here)
- **Migration Agent** (exists as Make.com prompt + skills) — authors content into da.live via the custom MCP server, validates with Playwright "agentic eyes". One Agent Card, **three backends: Make.com (primary), Claude Agent SDK and opencode/Kimi K2.6 (backups)**
- **Eval Agent** (exists, coupled) — engine **copied** out of the Next.js app into a headless, job-based, parallelizable service (the original app is frozen in place — D5)
- **Coordinator** (new) — an **intelligent** A2A client *and server*: given an intent and a starting state, it decides *which* of generate / migrate / evaluate to run — not a fixed pipeline — and exposes that as its own `coordinate.run` skill (pipelines as tasks). CLI-first; runs 1x or Nx with concurrency budgets and variance reporting
- **UI** (new) — a thin Next.js app (`agents/ui`) with auth, a runs dashboard, and manual A2A triggering; the existing `content-authoring-eval` app stays on Oracle, frozen and untouched (D5)

The coordinator can do any of four things per request: **just migrate**, **generate + migrate**, **just evaluate**, or **all three** (generate → migrate → evaluate, optionally Nx with aggregate variance scoring). It need not start at generation or end at evaluation; the full closed loop is the headline *route*, not the only one.

> **Agent Card pattern**: a single Agent Card fronts pluggable backends. The migration agent runs the same `migration.run` contract on **Make.com (primary), the Claude Agent SDK, or opencode/Kimi K2.6** — the runtime and model vendor are hidden from callers. (Content-gen is single-backend by contrast.)

## Decisions Log (2026-06-05, revised 2026-06-06)

| # | Decision | Choice | Rationale | Rejected alternatives |
|---|----------|--------|-----------|----------------------|
| D1 | da.live MCP server | **Keep custom `functions/` MCP** | Adobe's [da-mcp](https://github.com/adobe-rnd/da-mcp) (early access) has **no preview/publish** (`admin.hlx.page`) and requires real `Authorization` headers, breaking Make.com's header-less `args.bearerToken` "Hack 2". Custom server already does CRUD + preview/publish + 3-tier auth (S2S, header, arg-bearer). | Hybrid (Adobe CRUD + custom gap-filler), full migration to Adobe. **Watch item**: revisit if Adobe adds publish (their issue list doesn't show it as of 2026-06). |
| D2 | A2A depth | **Full official A2A SDK from day one** | Learning is a primary goal; the trio (content-gen, migration, eval) is genuinely multi-agent; spec v1.0 is stable with production JS SDK. Agent Cards + Task lifecycle + push notifications map exactly onto our needs. | A2A-shaped custom job API (less learning), plain webhooks/BullMQ (no learning, likely redesign later). |
| D3 *(revised 2026-06-06)* | Runtime + persistence | **Local-first dev → Cloudflare Containers at deploy; Cloudflare D1 + R2 for persistence** | Cloudflare is this cycle's deliberate platform learning alongside A2A. D1 is SQLite-dialect — local dev runs the **same SQL on a local SQLite file**, no emulation. R2 is S3-compatible with free egress, used directly even from local dev so artifact URLs are always real/public. Scale-to-zero fits a few-demos-a-week pattern on the already-paid $5 Workers Paid plan. | Original 2026-06-05 choice (Oracle VM compose + Supabase) — superseded by D5/D6; Supabase (loses Realtime + the Supabase-MCP demo moment — accepted, see Part 1 persistence notes); Azure Cosmos DB (still deferred). |
| D4 *(2026-06-06)* | Process topology | **One Express server (and eventually one container) per agent — 4 A2A servers: eval, content-gen, migration, coordinator — sharing the `a2a-common` bootstrap** | Blast-radius isolation for browser-heavy services; per-service browser permits; Agent Cards are origin-scoped (RFC 8615 well-known URIs); image weights differ wildly (content-gen needs no Chromium). Monorepo ≠ one deployment. | Single combined Express server (possible via SDK mounts, undercuts the decoupling thesis); one image with multiple commands (couples deploys, bloats slim agents). |
| D5 *(2026-06-06)* | Legacy app + Oracle | **Freeze `content-authoring-eval/` and its Oracle deployment entirely — zero modifications** | Keeps the working app working; guarantees `deploy-content-authoring-eval.yml` never triggers. Eval engine is **copied** (not `git mv`'d) into `agents/eval-service`; the old copy simply never changes again. New UI is a separate thin app (`agents/ui`). | In-place UI rebuild (original Part 6 plan); move-not-copy extraction (would touch the frozen folder). |
| D6 *(2026-06-06)* | Deployment sequencing | **Deployment last.** Dev loop = 4 Express servers on localhost talking A2A; `cloudflared tunnel` provides public ingress for Make.com during dev; Cloudflare Containers deploy is milestone M5 | Protocol + agents are the hard/valuable part; deployment is swappable by construction (D4). Local+tunnel is also the conference-demo fallback if the deploy slips. | Deploy-early to Oracle side-by-side (original Part 2 step 7); deploy-early to Cloudflare (front-loads a second learning curve before the mesh exists). |

## Document Map

| Part | File | Covers |
|------|------|--------|
| 1 | [part-1-architecture.md](./part-1-architecture.md) | System overview, agent roster, unifying interface, monorepo layout, tech stack |
| 2 | [part-2-eval-service.md](./part-2-eval-service.md) | Decoupling the eval engine: current coupling audit, headless service, store schema (SQLite/Cloudflare D1), browser pool, parallelization |
| 3 | [part-3-a2a-protocol-layer.md](./part-3-a2a-protocol-layer.md) | A2A SDK adoption: Agent Cards, Task lifecycle, streaming, push notifications, Make.com interop, auth |
| 4 | [part-4-content-generator-agent.md](./part-4-content-generator-agent.md) | New agent: brief mode + synthetic-source mode, single Agent SDK backend, contracts, prompts |
| 5 | [part-5-migration-agent.md](./part-5-migration-agent.md) | Wrapping migration as an A2A agent with three backends (Make.com primary; Agent SDK + skills; opencode/Kimi K2.6); Playwright concurrency |
| 6 | [part-6-orchestration-ui-rollout.md](./part-6-orchestration-ui-rollout.md) | Coordinator (intelligent routing + Nx fan-out + variance reporting + A2A server face), new `agents/ui` app, milestones to adaptTo(), risks, open questions |
| — | [kimi-k2.6-opencode-backend-findings.md](./kimi-k2.6-opencode-backend-findings.md) | **PoC findings (2026-06-08)** for Part 5 Backend C: validated headless Kimi K2.6 via `opencode serve` + REST; credential/UA-gate notes; gotchas. Code in [`references/kimi/`](../../references/kimi/). |

> **Diagram note**: `a2a-agent-platform-architecture.{png,excalidraw}` predates the 2026-06-06 revision (it shows Oracle compose + Supabase) — regenerate before sharing. The closed-loop pipeline diagram remains conceptually accurate.

## In Scope

- **Copying** the eval engine out of `content-authoring-eval/` into a headless A2A service (the source folder is then frozen — D5)
- New `agents/` monorepo subproject (a2a-common, contracts, eval-service, content-gen, migration-agent, coordinator, ui)
- Cloudflare D1 + R2 persistence (jobs, reports, artifacts) replacing localStorage + `globalThis.__batchStorage` for the new platform
- A2A protocol layer on all four servers (eval, content-gen, migration, coordinator)
- Make.com interop via A2A push-notification webhooks (through a `cloudflared` tunnel during local dev)
- Browser concurrency management (pool/semaphore) for parallel evals and migrations
- New thin `agents/ui` Next.js app (auth, runs dashboard via store reads, manual A2A triggers)
- Cloudflare Containers deployment — **as the last milestone** (D6)

## Out of Scope

- **Any change to `content-authoring-eval/` or its Oracle deployment** — frozen as-is (D5); `deploy-content-authoring-eval.yml` must never be triggered by this work
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
