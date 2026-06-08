# 01 — As-Built Architecture

Component-by-component description of what exists in `agents/` as of 2026-06-08. Every piece below is real code, on `main`, exercised by tests.

---

## The shape of the mesh

Five long-running servers, each its own process/port, each independently addressable. Four are A2A agents built on one shared bootstrap; the fifth is a thin UI. A sixth component (`store-mcp`) is a stdio MCP server, not an HTTP service.

| Service | Port | Role | A2A skill(s) |
|---------|------|------|--------------|
| eval-service | 4001 | Evaluate a published EDS page (4 dimensions) | `eval.run` |
| content-gen | 4002 | Briefs + synthetic legacy source pages | `content.brief`, `content.synthesize-source` |
| migration-agent | 4003 | Author a source into da.live (swappable backends) | `migration.run` |
| coordinator | 4004 | Route + fan out + aggregate (client **and** server) | `coordinate.run` |
| ui | 3000 | Auth, runs dashboard, manual trigger | — (A2A client via API routes) |
| store-mcp | — (stdio) | Conversational read access to the store | MCP tools |

Decoupling is real: each agent has its own Agent Card at `/.well-known/agent-card.json`, its own store file, its own browser budget, and (at M5) its own container image.

---

## `a2a-common` — the shared bootstrap

Every agent is ~one file of business logic plus `startAgentServer(...)` from `@agents/a2a-common`. This package is the spine.

- **`src/server.ts` → `startAgentServer()`** builds the Agent Card and wires the official `@a2a-js/sdk` Express handlers:
  - `GET /.well-known/agent-card.json` (public) and `GET /health` (public, with `healthExtras()`).
  - `POST /a2a` — JSON-RPC 2.0 incl. `message/send`, `message/stream` (SSE), `tasks/get`, push-notification config. **Mesh bearer auth** when `A2A_MESH_TOKEN` is set.
  - **Edge webhook shim** `POST /hooks/:agent/:skill` — flat JSON + `callbackUrl` in, `202 {taskId}` out. This is the Make.com / curl / cron / skill surface. **Bearer-gated** by `edgeToken = A2A_EDGE_TOKEN || A2A_MESH_TOKEN`.
  - **Push notifications** — SDK sender backed by `SqlitePushNotificationStore`; the completed Task is POSTed to the registered `callbackUrl`.
  - Extension hooks: `staticRoutes` (serve a dir, the local R2 stand-in) and `extraRoutes({app, db, edgeToken})` (agent-specific routes, e.g. the migration callback receiver).
- **`src/store/db.ts` → `openDb()`** opens the local SQLite file and runs `migrations/*.sql` in filename order. **The same SQL is applied to Cloudflare D1** (D3) — one set of migration files, two drivers.
- **`src/store/taskStore.ts`** — `SqliteTaskStore` (the SDK `TaskStore`).
- **`src/store/pushStore.ts`** — `SqlitePushNotificationStore`; mirrors the SDK's `config.id = taskId` backfill (else `getTaskPushNotificationConfig` breaks).
- **`src/store/artifactStore.ts`** — `createArtifactStore()` returns an R2 backend (S3 API via `aws4fetch`) when the `R2_*` env is present, else a local-filesystem stand-in; `recordArtifact()` writes the `artifacts` row. One `put()` code path, identical URL contract.
- **`src/client.ts`** — `meshClientFactory()`, a bearer-injecting `ClientFactory` for agent-to-agent calls.
- **`src/logging.ts`** — structured JSON logger that stamps `a2a_task_id` / `context_id` on every line.
- **`migrations/`** — `0001_init.sql` (`runs`, `tasks`, `eval_reports`, `artifacts`), `0002_push_configs.sql`.

---

## `contracts/` — the wire contracts

JSON Schemas that define each skill's payload, vendor- and runtime-agnostic:

- `eval.run.v1` — `{ targetUrl, sourceType?, sourceLocation?, dimensions?, runId? }`
- `migration.run.v1` — `{ sourceType, sourceLocation, site, owner, pageSlug, … }`
- `content.brief.v1`, `content.synthesize-source.v1`
- `coordinate.run.v1` — `{ goal, topic?, targets?, backend?, fanOut?, … }`

These are the stable surface; backends and models swap behind them.

---

## `eval-service` (:4001) — the decoupled eval engine

The eval engine was **copied** out of the frozen `content-authoring-eval/src/lib/` into `src/engine/` (~5.5k lines; model bumped to `claude-sonnet-4-6`, overridable via `CLAUDE_MODEL`). Around it:

- **`executor.ts`** — real `eval.run`: validate → publish a `submitted` Task → enqueue on a p-queue → `runEvaluation()` (4 dimensions: structure, accessibility, content, visual; each deterministic + agentic) → write the `eval_reports` row, with a 3-retry wrapper. **`persistScreenshot()`** uploads the visual screenshot through the artifact store, rewrites the report to a durable public URL, and records an `artifacts` row.
- **`stub-executor.ts`** — `EVAL_ENGINE=stub`: no browsers, no API, contract-faithful fake. This is what the fast e2e tier + CI use.
- **`jobs/queue.ts`** — p-queue, `EVAL_CONCURRENCY=2`.
- **`browser/semaphore.ts`** — `BROWSER_PERMITS=3`; `withBrowserPermit()` wraps every Chromium entry point so parallel evals never exceed the cap.
- **`index.ts`** — on restart, rebuilds in-flight (`submitted`/`working`) tasks from the store and re-enqueues them (sleep-tolerance, for scale-to-zero containers); serves `/artifacts`.

Agentic analysis needs `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`; without them the engine degrades to deterministic scoring (the live-test path — real browsers, $0).

---

## `content-gen` (:4002) — briefs + synthetic sources

Two skills, one server, no browser:

- **`content.brief`** — a structured content brief (outline, copy blocks, target EDS blocks).
- **`content.synthesize-source`** — a standalone synthetic "legacy" HTML page (`clean | dated | messy`) with a `groundTruth` object so eval can score truthfully.

The synthetic page is uploaded via the shared artifact store → **public R2 URL** (or local stand-in), so Make.com (cloud) and eval can fetch it. The template tier is in place now; the Claude Agent SDK generator is M3.

---

## `migration-agent` (:4003) — one card, swappable backends

A single `migration.run` Agent Card fronting pluggable backends (`backends/{types,dryrun,makecom,sdk}.ts`):

- **`dryrun`** — returns `previewUrl = sourceLocation` (a perfect, deterministic simulation; $0). The closed-loop default in tests.
- **`makecom`** (primary, built agent-side) — POSTs `MAKECOM_WEBHOOK_URL` with the run fields + a `callbackUrl` (`${MIGRATION_CALLBACK_BASE}/callbacks/makecom/{taskId}`), parks an in-process waiter (`callbacks.ts`), and completes when Make.com POSTs the report back. `index.ts` registers the receiver via `extraRoutes`: `POST /callbacks/makecom/:taskId` resolves the live waiter **or** completes the task from the store after a restart.
- **`sdk`** — stub for M3 (Claude Agent SDK backend); `opencode`/Kimi is M3+.

The Make.com round-trip is testable against a fake Make.com today; the human's remaining work is the actual Make.com scenario config (webhook URL in, final HTTP module out).

---

## `coordinator` (:4004) — intelligent routing, fan-out, variance

An A2A **client and server** exposing `coordinate.run`:

- **`executor.ts`** — the route engine. `resolveRoute()` deterministically maps a goal to a pipeline: `evaluate | migrate | generate+migrate | full-loop | auto`. It need not start at generate or end at eval — the full closed loop is the headline route, not the only one. `runPipelineBranch()` threads a single `contextId` across content-gen → migration → eval. `computeStats()` aggregates variance (mean/stddev, per-dimension) across fan-out branches.
- **`cli.ts`** — `hello`, `batch`, `loop` (`npm run loop -- "<topic>" --fan-out N`).
- **`index.ts`** — wires agent URLs from `EVAL_AGENT_URL` / `CONTENT_GEN_URL` / `MIGRATION_AGENT_URL`.

`goal: auto` uses the deterministic state table today; an LLM planner is M3.

---

## `ui` (:3000) — thin dashboard

A small Next.js 15 App Router app — **not** the frozen `content-authoring-eval` app (D5):

- `middleware.ts` gates pages + API with a shared-secret cookie (SHA-256, `lib/auth.ts`, `UI_PASSWORD`).
- `app/runs` + `app/runs/[id]` render the runs / variance / branch grid (reads the coordinator store via `lib/db.ts`, polling v1).
- `app/trigger` + `api/trigger` fire `coordinate.run` through a server-side A2A client.

It only **reads** the store and **triggers** the coordinator; the agents do the work.

---

## `store-mcp` — conversational store access

A stdio MCP server (`McpServer` + `StdioServerTransport`) exposing the agent SQLite store **read-only** to conversational clients (e.g. Claude Desktop). Tools: `list_runs`, `get_run`, `list_eval_reports`, `query_store` — where `query_store` enforces a single `SELECT` (no writes, no multi-statement).

---

## Stores & artifact storage

- **Structured data → SQLite (local) / D1 (deploy)**: `runs`, `tasks`, `eval_reports`, `artifacts`, `push_configs`. Same migration files both places.
- **Blobs → R2 (or local stand-in)**: synthetic source HTML and eval screenshots, public over `r2.dev`. Durable across container scale-to-zero (local disk is not). See [`03-cloudflare-and-deployment.md`](./03-cloudflare-and-deployment.md).
