# Part 2 — Eval Service Decoupling

The highest-value extraction in the platform. Everything else composes around a headless, job-based, parallel-safe eval service.

## Current-State Audit (what must change)

| Coupling point | Where | Problem |
|---|---|---|
| Engine imported in-process | every `content-authoring-eval/src/app/api/evaluate/*/route.ts` → `import { runEvaluation } from '@/lib/evaluator'` | No job handle, no callbacks; caller and engine co-deploy |
| Single-eval results client-side only | `EvaluationForm.tsx:98,118` → `addEvaluation(report)`; `useEvaluations.ts` (`MAX_EVALUATIONS = 50`); `useLocalStorage.ts` | Server computes, browser persists. Connection drop mid-run = result lost. Capped at 50. Single-browser-profile only. |
| Batch state in volatile memory | `src/lib/batch-storage.ts` — `Map`s pinned to `globalThis.__batchStorage` | Lost on restart, never GC'd, single-instance only. Its own comment says "in production, this would be replaced with a database." |
| Blocking/SSE execution model | `api/evaluate/route.ts` (sync POST, minutes-long), `stream/route.ts` + `batch-stream/route.ts` (SSE holds connection open for the whole run) | No submit-and-detach. Make.com's 300s timeout can't survive a long eval. |
| Unbounded browser fan-out | `src/lib/mcp-config.ts` — each agentic `query()` spawns its own Playwright MCP subprocess | 1 eval ≈ up to 4 headless Chromiums. N parallel evals × 4 browsers on a 4-CPU VM = OOM/CPU thrash. Batch loop at `batch-stream/route.ts:138` is sequential *because* of this. |
| Ephemeral artifacts | Screenshots written to `public/` / `output/` | Vanish on container restart; not addressable cross-service |

**What's already good**: the four dimension agents (`src/lib/agents/{structure,accessibility,content,visual}/`) are pure functions over `(url, deterministicData)` with a clean deterministic-first + agentic-fallback pattern (`evaluator.ts:43`), already parallel via `Promise.all` (`evaluator.ts:533-540`). They move as-is. `agent-claude-sdk/cms-migration-evaluator/src/batchEvaluator.ts` is the blueprint for the persisted job runner.

## Target Architecture

```
agents/eval-service/
  src/
    a2a/            # A2A server wiring (from a2a-common): Agent Card, task handlers
    engine/         # COPIED from content-authoring-eval/src/lib (source frozen, D5):
                    #   evaluator.ts, agents/*, prompts/*, mcp-config.ts, constants.ts
    jobs/           # queue + worker pool (in-process, p-queue or similar; no Redis in v1)
                    #   queue is rebuildable from the store on restart (sleep-tolerance rule, Part 1)
    browser/        # global browser semaphore + lifecycle (see below)
    store/          # SQLite-dialect store adapter: local SQLite file (dev) / Cloudflare D1 (deploy)
                    #   + R2 client for artifacts
  # no Dockerfile until the deployment milestone (D6)
```

### Execution model

1. A2A `message/send` arrives with an `eval.run` payload → validate against contract schema → insert `tasks` row (`submitted`) → enqueue → return Task immediately
2. Worker pool (concurrency `EVAL_CONCURRENCY`, default **2**) picks up the job → state `working` (store row updated; A2A status event emitted; SSE subscribers notified)
3. `runEvaluation()` runs exactly as today — 4 dimensions in parallel — but every browser acquisition goes through the **global semaphore**
4. Per-dimension completion → A2A `TaskStatusUpdate` events (replaces today's `agent-start`/`agent-complete` SSE vocabulary)
5. Completion → `eval_reports` row + screenshot uploads to R2 → A2A Artifact emitted → task `completed` → push notifications fired to registered webhooks
6. Failure → 3-retry with backoff (port the logic from `batch-stream/route.ts`), then `failed` with error detail on the task

### Browser concurrency (the critical resource constraint)

- Global semaphore `BROWSER_PERMITS` (default **3**) wrapping *both* deterministic Playwright launches and agentic Playwright-MCP spawns
- The 4 dimension agents within one eval contend for permits like everyone else — an eval no longer assumes it can have 4 browsers at once; dimensions queue gracefully
- Permits are service-wide, so `EVAL_CONCURRENCY=2` × ~3-4 browser needs each still cannot exceed 3 live Chromiums
- v2 option (deferred): a shared `playwright` server (`browser.connect()` over CDP) so agentic MCP sessions reuse warm browsers; measure first — semaphore may be enough

### Batch = coordinator concern, not engine concern

Today's batch routes (`batch/route.ts`, `batch-stream/route.ts`, `import/`, `export/`) are retired. A "batch" becomes a `run` containing N eval tasks, owned by the Coordinator (Part 6). The eval service only ever sees single-page tasks. This deletes `batch-storage.ts` and the Zod batch import/export plumbing — aggregation moves to SQL over `eval_reports`.

## Task Contract (`agents/contracts/eval.run.v1.json`)

```jsonc
// input payload
{
  "targetUrl": "https://main--site--owner.aem.page/path",   // required
  "sourceType": "pdf" | "webpage" | "none",                 // default "none"
  "sourceLocation": "https://... | r2://artifacts/...",      // required unless sourceType=none
  "dimensions": ["structure","accessibility","content","visual"], // default all
  "runId": "uuid",          // optional — links task to an coordinator run
  "labels": { "...": "..." } // optional free-form, flows to eval_reports for grouping
}

// artifact (result)
{
  "overallScore": 87,
  "dimensionScores": { "structure": 90, "accessibility": 85, "content": 88, "visual": 84 },
  "report": { /* full EvaluationReport, same shape as today */ },
  "artifacts": [ { "type": "screenshot", "path": "artifacts/<taskId>/visual-target.png" } ]
}
```

Weights stay in `constants.ts` (`DIMENSION_WEIGHTS`); the content dimension still auto-skips when `sourceType=none` (today's behavior at `evaluator.ts:187`).

## Store Schema (v1) — SQLite dialect (local SQLite in dev, Cloudflare D1 at deploy)

One set of migration files runs unchanged on both: D1 *is* SQLite, so local dev uses a plain SQLite file (better-sqlite3 or libsql) behind the same `a2a-common` store adapter. UUIDs are generated app-side; JSON lives in `text` columns queried with SQLite's `json_*()` functions (supported by D1).

```sql
create table runs (
  id text primary key,                 -- uuid v4, generated app-side
  kind text not null,                  -- 'eval-batch' | 'pipeline' | 'single'
  config text not null,                -- JSON: pipeline spec / batch input
  status text not null default 'running',
  stats text,                          -- JSON, filled on completion: mean/stddev/pass-rate per dimension
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at text
);

create table tasks (
  id text primary key,
  run_id text references runs(id),
  agent text not null,                 -- 'eval' | 'migration' | 'content-gen' | 'coordinator'
  a2a_task_id text unique not null,
  context_id text,                     -- A2A contextId — groups pipeline steps
  state text not null,                 -- submitted|working|completed|failed|canceled
  payload text not null,               -- JSON
  error text,                          -- JSON
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table eval_reports (
  id text primary key,
  task_id text not null references tasks(id),
  target_url text not null,
  overall_score real,
  dimension_scores text,               -- JSON
  report text not null,                -- JSON: full EvaluationReport
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table artifacts (
  id text primary key,
  task_id text not null references tasks(id),
  type text not null,                  -- screenshot|source-html|diff|brief
  storage_path text not null,          -- R2 object key
  metadata text                        -- JSON
);
-- No Realtime: agents/ui polls (v1). No RLS: access is server-side only (mesh services + ui API routes).
```

## Migration Plan (extraction steps)

1. Scaffold `agents/eval-service` + `agents/a2a-common`; shared SQL migration files (SQLite dialect) + local SQLite db; R2 bucket + access keys
2. **Copy** `src/lib/{agents,prompts,evaluator.ts,mcp-config.ts,constants.ts,...}` from `content-authoring-eval` into `eval-service/src/engine/` — copy, **not** move: the source folder is frozen (D5) and its copy simply never changes again; fix imports; model bump to `claude-sonnet-4-6`
3. Add browser semaphore around all Playwright entry points (deterministic `chromium.launch` call sites + `getMCPServersConfig` consumers)
4. Wrap with job queue + store; smoke test headless via curl before any A2A wiring
5. A2A server wiring (Part 3) — Agent Card, handlers, SSE, push notifications
6. `agents/ui` (Part 6) reads the store and submits via A2A — the old Next.js app is **not** rewired (frozen, D5)
7. No deploy step in this part — everything runs locally until the deployment milestone (D6 / M5)

**Definition of done**: a curl-submitted eval task survives a service restart mid-queue (resumes or fails cleanly with state in the store), results visible via CLI or `agents/ui` reading the store (no localStorage anywhere in the new platform), and 5 concurrent evals complete on the dev machine without exceeding 3 live browsers.
