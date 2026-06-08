# CLAUDE.md — agents/eval-service

**Purpose**: A2A eval agent — runs a 4-dimension (structure, accessibility, content, visual) migration-quality evaluation against a published EDS page. **Tech**: Express + `@a2a-js/sdk@0.3.13`, `@agents/a2a-common`, p-queue, SQLite/D1, Playwright/axe, Anthropic SDK · **Port**: 4001 · **Status**: M1 core done (real engine, queue, semaphore, `eval_reports`, restart rebuild, R2 artifacts). v2.0 of the platform — **v1.1.0 = the frozen `content-authoring-eval/`, do not touch it (D5)**.

Platform context: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) · original PRD [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) · sibling agents in [`agents/README.md`](../README.md).

## When to work here
- The `eval.run` skill (contract `agents/contracts/eval.run.v1.json`): payload, validation, retry, A2A event shapes.
- The eval engine itself (`src/engine/`, ~5.5k lines copied out of the frozen app) — scoring agents, prompts, deterministic Playwright/axe tools.
- Job queue, browser concurrency, artifact (screenshot) storage, restart-rebuild behavior.
- NOT for the coordinator, migration, content-gen, or UI — those are sibling workspaces.

## Key files
- `src/index.ts` — server bootstrap via `startAgentServer`; picks `real` vs `stub` executor (`EVAL_ENGINE`); pre-creates `./.tmp` + `./output/screenshots`; serves `/artifacts` static; **rebuilds in-flight tasks from the store on restart** (re-enqueues `submitted`/`working` tasks — sleep-tolerance).
- `src/executor.ts` — the real `eval.run`: validate → publish `submitted` Task → `evalQueue.add` → `runEvalJob` (`runEvaluation` → `persistScreenshot` → `writeEvalReport` row → artifact + `completed`). 3-attempt retry (`EVAL_MAX_ATTEMPTS`, backoff `[2s, 8s]`). Submit-and-detach: `message/send` returns the submitted task immediately.
- `src/stub-executor.ts` — `EVAL_ENGINE=stub`: no browsers, no API. Same event choreography as real. Used by the fast e2e tier + CI.
- `src/jobs/queue.ts` — p-queue, `EVAL_CONCURRENCY=2`.
- `src/browser/semaphore.ts` — `BROWSER_PERMITS=3`; `withBrowserPermit()` wraps **every** Chromium entry point (deterministic `.cjs` shell-outs AND agentic Playwright-MCP spawns). Service-wide cap.
- `src/engine/evaluator.ts` — `runEvaluation(request, onProgress)`: orchestrates the 4 dimensions, emits progress events the executor maps to A2A status updates.
- `src/engine/agents/{structure,accessibility,content,visual}/{deterministic,agentic}.ts` — per-dimension scorers (deterministic tools + a Claude pass that falls back to deterministic when no key).
- `src/engine/types/evaluation.ts` — `EvaluationRequest` / `EvaluationReport` shapes the executor maps the A2A payload to and from.
- `scripts/capture-screenshot.cjs`, `scripts/scan-accessibility.cjs` — copied deterministic Playwright/axe helpers, shelled out by the engine. **Must stay `.cjs`** (see gotchas).
- `tsconfig.json` — engine-specific (`@/lib/*` → `src/engine/*`, `@/types/*` → `src/engine/types/*`, `moduleResolution: bundler`).

## Gotchas / non-obvious  ← READ THIS
- **Playwright helper scripts MUST be `.cjs`.** The `agents/` package is `"type": "module"`, so a `.js` helper is parsed as ESM → `require is not defined`. This failure is **silent**: the deterministic capture throws, the agentic path swallows it, and visual once scored **100** on a page that never rendered. Any new shell-out helper that uses `require` → name it `.cjs`.
- **Model is `claude-sonnet-4-6`** (bumped from the frozen app's model during extraction). Override everywhere via `CLAUDE_MODEL`. Hardcoded `claude-sonnet-4-6` literals also live in `evaluator.ts` metadata.
- **Agentic tier needs a key.** `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` — without it the engine **silently falls back to deterministic scoring** (that's the `test:live` path: real browsers, real axe/screenshots, zero spend). Full agentic runs are manual.
- **Screenshot path → durable URL.** The engine surfaces the visual screenshot at `report.results.visual.metadata.screenshot` (`{ absolutePath }`). `persistScreenshot` uploads it via the artifact store and **rewrites it in place** to `{ path, url }` (drops the machine-specific absolutePath) + records an `artifacts` row. Best-effort — never fails the eval; if upload fails the report keeps the local path.
- **Artifacts: R2 when configured, else local.** `createArtifactStore` uses R2 (S3 API) when `R2_*` env is set, else writes `./output` served at `/artifacts` (`EVAL_PUBLIC_BASE` overrides the public base). Same URL contract either way. R2 bucket is public (`r2.dev`); mint a token per `agents/docs/r2-setup.md` to flip dev to real R2.
- **Restart rebuild only runs for `EVAL_ENGINE=real`.** It reads the persisted Task's `metadata.payload` (set when the task was accepted). A task with no payload metadata is marked `failed`. Rebuilt tasks have no SSE subscribers — events apply straight to the stored Task; clients poll `tasks/get`.
- **Own `tsconfig.json`.** Engine `@/` path aliases mean this workspace compiles separately. Root `npm run typecheck` runs **both** (`tsc -p tsconfig.json && tsc -p eval-service/tsconfig.json`) — a change here can break the root typecheck.
- **`cancelTask` is best-effort** — queued jobs aren't individually removable; it just marks the task `canceled`.

## Run / test
```bash
cd agents && set -a && source .env && set +a   # load env (R2_*, CLAUDE_* keys)
npm install
npm run dev:eval                 # :4001 real engine (EVAL_ENGINE=stub for the fake)
npm run typecheck                # runs BOTH tsconfigs
npm run test:e2e                 # fast tier (~5s): stub engine, pins the A2A contract
npm run test:live                # live tier (~15s): REAL engine — Chromium/axe/screenshots, $0
```
Smoke a single eval (edge shim, no A2A client):
```bash
curl -X POST localhost:4001/hooks/eval/eval.run -H 'Content-Type: application/json' \
  -d '{"targetUrl":"https://example.com","sourceType":"none"}'
```

## Conventions
- **Real tests, no mocks** (D-philosophy). E2E spawns real servers on 14xxx ports with throwaway SQLite.
- Local SQLite = the same SQL as Cloudflare D1 (migrations in `a2a-common/migrations/`); store at `data/store.db`. Node 20.
- Engine code keeps the frozen app's import style (extensionless, `@/` aliases) on purpose — adapt the tsconfig to the copy, not the copy to NodeNext. New eval-service code (`src/executor.ts`, etc.) uses the same style.
- Tasks survive restarts — that's the whole point of the SQLite task store + rebuild loop.
- Never edit `content-authoring-eval/` (D5). This workspace is the live one.
