# A2A Agent Platform — v2.0 Build Report (as-built)

**Date**: 2026-06-08
**Status**: M1–M4 built, tested, and on `main`; Cloudflare infra live (D1, R2, named tunnel); deployment (M5) and the Make.com config are the remaining steps
**Author**: Jack Jin (with Claude Code)
**Companion to**: the planning PRD at [`ai-docs/2026-06-05-a2a-agent-platform/`](../2026-06-05-a2a-agent-platform/) (decisions D1–D6). This doc reports **what was actually built** between the 2026-06-05 plan and 2026-06-08.

---

## Why "v2.0"

| Line | What it is | State |
|------|-----------|-------|
| **v1.x** (current `v1.1.0`) | The original `content-authoring-eval` Next.js app on Oracle Cloud | **Frozen backup** — never modified (D5). It still runs; it's the safety net. |
| **v2.0** | This **A2A agent platform** under `agents/` — a decoupled mesh of independently-addressable AI agents | **The all-new thing.** Built fresh; this report covers it. |

v2.0 is a **major** version because it's a ground-up re-architecture (a mesh of A2A servers replacing a single coupled app), not a feature increment on v1.x. The eval *engine* is **copied** out of the frozen app — the v1.x folder is untouched.

> Versioning note: the lockstep release model (see [`RELEASES.md`](../../RELEASES.md)) still tags from `main`. v2.0 is the agents-platform line; v1.x remains the legacy line. Deployment is deliberately **last** (D6), so v2.0 has not been tagged/deployed yet — it runs locally + via `cloudflared` tunnel today.

## Executive summary — what got built

Starting from the PRD, we built the **entire mesh** end-to-end and proved it with real tests:

- **4 A2A servers + 1 UI**, one Express server per agent, all on a shared `a2a-common` bootstrap (official `@a2a-js/sdk@0.3.13`): **eval** `:4001`, **content-gen** `:4002`, **migration** `:4003`, **coordinator** `:4004`, **ui** `:3000`.
- **The closed loop runs end-to-end** locally: `coordinator → content-gen → migration → eval`, with deterministic routing, fan-out, and variance stats. `npm run loop` drives it.
- **Eval engine decoupled** from the frozen app into a headless, job-queued, browser-pooled service (real `eval.run`, 4 dimensions, restart-survival).
- **Migration agent** = one Agent Card over swappable backends (`dryrun` working; `makecom` fully built agent-side; `sdk` stubbed for M3).
- **Make.com integration built agent-side**: webhook out + callback in, restart-tolerant — the human's remaining work is pure Make.com config.
- **Cloudflare persistence proven**: D1 schema applied (same SQL as local SQLite); **R2 artifact storage live** (synthetic sources + eval screenshots → public `r2.dev`).
- **Public ingress live**: a **named `cloudflared` tunnel** on the real domain `a2a.xpri.ai → localhost:4003`, verified end-to-end.
- **store-mcp**: a stdio MCP server for conversational store queries.
- **Three test tiers, no mocks**: fast (~45, CI), live (real engine/browsers/R2), soak (10× full loop).
- **Cloudflare unknowns de-risked via live POCs** (now in [`references/cloudflare/`](../../references/cloudflare/)): long-SSE-through-Containers, container→D1 (worker-proxy), R2 round-trip; plus a Kimi/opencode backend PoC ([`references/kimi/`](../../references/kimi/)).

## Document map

| File | Covers |
|------|--------|
| [`01-as-built-architecture.md`](./01-as-built-architecture.md) | Component-by-component: `a2a-common` bootstrap, the 4 agents, ui, store-mcp, contracts, stores, artifact storage |
| [`02-sequence-diagrams.md`](./02-sequence-diagrams.md) | Mermaid sequence diagrams for the key integrations (closed loop, A2A task lifecycle, Make.com round-trip, eval+R2, tunnel ingress, UI) |
| [`03-cloudflare-and-deployment.md`](./03-cloudflare-and-deployment.md) | As-built Cloudflare infra (D1, R2, named tunnel on `xpri.ai`), the POC de-risking, what's deployed vs. local, M5 path |
| [`04-testing-and-status.md`](./04-testing-and-status.md) | Test tiers + evidence, the plan→built status grid, what's left |

## Repo layout (v2.0 lives under `agents/`)

```
agents/
├── a2a-common/      shared bootstrap (server factory, stores, client, logging, migrations)
├── contracts/       JSON Schemas: eval.run, coordinate.run, migration.run, content.brief, content.synthesize-source
├── eval-service/    :4001  eval agent (engine copied from frozen app) + stub
├── content-gen/     :4002  content briefs + synthetic legacy source pages
├── migration-agent/ :4003  one Agent Card, swappable backends (dryrun | makecom | sdk)
├── coordinator/     :4004  A2A client+server — routing, fan-out, variance; CLI (hello/batch/loop)
├── ui/              :3000  thin Next.js app — auth, runs dashboard, manual trigger
├── store-mcp/       stdio MCP server — conversational store queries
├── e2e/             real-server tests (fast / live / soak tiers)
└── docs/            r2-setup.md · tunnel-setup.md · makecom-scenario-checklist.md
```

## Decisions honored (from the PRD)

All six planning decisions held through the build:

- **D1** — kept the custom `functions/` da.live MCP (migration agent calls it).
- **D2** — full official A2A SDK from day one (Agent Cards, Task lifecycle, `message/stream` SSE, push notifications).
- **D3** — local-first dev on SQLite running the **same SQL** that's applied to Cloudflare **D1**; **R2** used directly (live) for artifacts.
- **D4** — one Express server (→ one container at M5) per agent, sharing `a2a-common`.
- **D5** — `content-authoring-eval/` and its Oracle deploy **untouched**; engine copied, not moved.
- **D6** — deployment sequenced **last**; dev = localhost mesh + `cloudflared` tunnel for Make.com ingress (now live on `a2a.xpri.ai`).
