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
    engine/         # MOVED from content-authoring-eval/src/lib:
                    #   evaluator.ts, agents/*, prompts/*, mcp-config.ts, constants.ts
    jobs/           # queue + worker pool (in-process, p-queue or similar; no Redis in v1)
    browser/        # global browser semaphore + lifecycle (see below)
    store/          # Supabase adapter: tasks, eval_reports, artifacts
  Dockerfile
```

### Execution model

1. A2A `message/send` arrives with an `eval.run` payload → validate against contract schema → insert `tasks` row (`submitted`) → enqueue → return Task immediately
2. Worker pool (concurrency `EVAL_CONCURRENCY`, default **2** on the 4-CPU VM) picks up the job → state `working` (Supabase row updated; A2A status event emitted; SSE subscribers notified)
3. `runEvaluation()` runs exactly as today — 4 dimensions in parallel — but every browser acquisition goes through the **global semaphore**
4. Per-dimension completion → A2A `TaskStatusUpdate` events (replaces today's `agent-start`/`agent-complete` SSE vocabulary)
5. Completion → `eval_reports` row + screenshot uploads to Supabase Storage → A2A Artifact emitted → task `completed` → push notifications fired to registered webhooks
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
  "sourceLocation": "https://... | storage://artifacts/...", // required unless sourceType=none
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

## Supabase Schema (v1)

```sql
create table runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                  -- 'eval-batch' | 'pipeline' | 'single'
  config jsonb not null,               -- pipeline spec / batch input
  status text not null default 'running',
  stats jsonb,                         -- filled on completion: mean/stddev/pass-rate per dimension
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id),
  agent text not null,                 -- 'eval' | 'migration' | 'content-gen'
  a2a_task_id text unique not null,
  context_id text,                     -- A2A contextId — groups pipeline steps
  state text not null,                 -- submitted|working|completed|failed|canceled
  payload jsonb not null,
  error jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table eval_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) not null,
  target_url text not null,
  overall_score numeric,
  dimension_scores jsonb,
  report jsonb not null,               -- full EvaluationReport
  created_at timestamptz default now()
);

create table artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) not null,
  type text not null,                  -- screenshot|source-html|diff|brief
  storage_path text not null,          -- Supabase Storage object path
  metadata jsonb
);
-- Realtime enabled on tasks + eval_reports. RLS: permissive single-user policy in v1.
```

## Migration Plan (extraction steps)

1. Scaffold `agents/eval-service` + `agents/a2a-common`; Supabase project + schema + storage bucket
2. **Move** `src/lib/{agents,prompts,evaluator.ts,mcp-config.ts,constants.ts,...}` from `content-authoring-eval` into `eval-service/src/engine/` (git `mv` to keep history); fix imports; model bump to `claude-sonnet-4-6`
3. Add browser semaphore around all Playwright entry points (deterministic `chromium.launch` call sites + `getMCPServersConfig` consumers)
4. Wrap with job queue + Supabase store; smoke test headless via curl before any A2A wiring
5. A2A server wiring (Part 3) — Agent Card, handlers, SSE, push notifications
6. Rewire Next.js UI (Part 6): API routes become thin A2A submit proxies; results pages read Supabase; delete localStorage hooks, batch routes, `batch-storage.ts`
7. Deploy to Oracle compose alongside the existing eval app; run both side-by-side for one week; then strip the engine from the Next.js image

**Definition of done**: a curl-submitted eval task survives a service restart mid-queue (resumes or fails cleanly with state in Supabase), results visible in UI without localStorage, and 5 concurrent evals complete on the VM without exceeding 3 live browsers.
