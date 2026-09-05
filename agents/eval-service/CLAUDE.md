# CLAUDE.md — agents/eval-service

**Purpose**: A2A eval agent — runs a 4-dimension (structure, accessibility, content, visual) migration-quality evaluation against a published EDS page. **Tech**: Express + `@a2a-js/sdk@0.3.13`, `@agents/a2a-common`, p-queue, SQLite/D1, Playwright/axe, Anthropic SDK · **Port**: 4001 · **Status**: M1 core done (real engine, queue, semaphore, `eval_reports`, restart rebuild, R2 artifacts). v2.0 of the platform — **v1.1.0 = the frozen `content-authoring-eval/`, do not touch it (D5)**.

Platform context: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) · original PRD [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) · sibling agents in [`agents/README.md`](../README.md) · user-facing [`README.md`](./README.md) (the deterministic-vs-agentic breakdown table, blend formulas per dimension, the three modes, what is carried over but dead - keep it in sync when the engine changes).

## When to work here
- The `eval.run` skill (contract `agents/contracts/eval.run.v1.json`): payload, validation, retry, A2A event shapes.
- The **`eval.reflect`** skill (v2.9, contract `agents/contracts/eval.reflect.v1.json`): the memory write-back — distil a scored run into rules and append them to the site's da.live memory page.
- The eval engine itself (`src/engine/`, ~5.5k lines copied out of the frozen app) — scoring agents, prompts, deterministic Playwright/axe tools.
- Job queue, browser concurrency, artifact (screenshot) storage, restart-rebuild behavior.
- NOT for the coordinator, migration, content-gen, or UI — those are sibling workspaces.

## Key files
- `src/index.ts` — server bootstrap via `startAgentServer`; picks `real` vs `stub` executor (`EVAL_ENGINE`); pre-creates `./.tmp` + `./output/screenshots`; serves `/artifacts` static; **rebuilds in-flight tasks from the store on restart** (re-enqueues `submitted`/`working` tasks — sleep-tolerance).
- `src/executor.ts` — the real `eval.run`: validate → publish `submitted` Task → `evalQueue.add` → `runEvalJob` (`runEvaluation` → `persistScreenshot` → `writeEvalReport` row → artifact + `completed`). 3-attempt retry (`EVAL_MAX_ATTEMPTS`, backoff `[2s, 8s]`). Submit-and-detach: `message/send` returns the submitted task immediately.
- `src/reflect.ts` — **`eval.reflect` (v2.9)**: `runReflect(payload, note)` reads the memory page (`@agents/a2a-common` `readMemory`), distils `{ summary, lessons }` with Claude (`REFLECT_MODEL` → `CLAUDE_MODEL` → `claude-sonnet-4-6`; tool-free `maxTurns:1`, `REFLECT_TIMEOUT_MS` 120s) or the deterministic fallback (`deterministicLessons`: migrator lessons + recommendations behind serious/critical findings, deduped against memory), builds one dated `MemoryEntry`, and `appendMemoryToDalive`s it (v2.9.1: INTO the page's "Episodic memory" section; the reflect prompt is told about the two tiers - never restate/contradict "Approved memory", emit lessons worth promoting - and sees up to 24k chars of the page). Skips (reported on the `memory-update` artifact, task still `completed`): all-dryrun migrations, no `DALIVE_MCP_URL`, `dryRun: true`. Routed in `executor.ts` (`isReflectPayload` → `runReflectTask`, inline, no queue slot) and stubbed in `stub-executor.ts` ($0, never writes).
- `src/stub-executor.ts` — `EVAL_ENGINE=stub`: no browsers, no API. Same event choreography as real (incl. a deterministic `eval.reflect`). Used by the fast e2e tier + CI.
- `src/jobs/queue.ts` — p-queue, `EVAL_CONCURRENCY=2`.
- `src/browser/semaphore.ts` — `BROWSER_PERMITS=3`; `withBrowserPermit()` wraps **every** Chromium entry point (deterministic `.cjs` shell-outs AND agentic Playwright-MCP spawns). Service-wide cap.
- `src/engine/evaluator.ts` — `runEvaluation(request, onProgress)`: orchestrates the 4 dimensions, emits progress events the executor maps to A2A status updates.
- `src/engine/agents/{structure,accessibility,content,visual}/{deterministic,agentic}.ts` — per-dimension scorers (deterministic tools + a Claude pass that falls back to deterministic when no key). The **content** agent has two paths: fidelity (`analyzeContent` + `analyzeContentWithClaude`, source↔target) and intrinsic **quality** (`analyzeContentQuality` + `analyzeContentQualityWithClaude`, target-only — quality mode, see gotchas).
- `src/engine/types/evaluation.ts` — `EvaluationRequest` / `EvaluationReport` shapes the executor maps the A2A payload to and from.
- `scripts/capture-screenshot.cjs`, `scripts/scan-accessibility.cjs` — copied deterministic Playwright/axe helpers, shelled out by the engine. **Must stay `.cjs`** (see gotchas).
- `tsconfig.json` — engine-specific (`@/lib/*` → `src/engine/*`, `@/types/*` → `src/engine/types/*`, `moduleResolution: bundler`).

## Gotchas / non-obvious  ← READ THIS
- **Playwright helper scripts MUST be `.cjs`.** The `agents/` package is `"type": "module"`, so a `.js` helper is parsed as ESM → `require is not defined`. This failure is **silent**: the deterministic capture throws, the agentic path swallows it, and visual once scored **100** on a page that never rendered. Any new shell-out helper that uses `require` → name it `.cjs`.
- **Model is `claude-sonnet-4-6`** (bumped from the frozen app's model during extraction). Override everywhere via `CLAUDE_MODEL`. Hardcoded `claude-sonnet-4-6` literals also live in `evaluator.ts` metadata.
- **Agentic tier needs a key.** `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` (either works — the gate is `engine/agent-auth.ts`). Without one the engine falls back to deterministic scoring, and since the 2026-06-11 hardening sprint that degradation is **recorded, not silent**: every dimension result carries `metadata.mode` (`agentic` | `deterministic-only` (no auth) | `deterministic-fallback` (agentic pass FAILED — see `modeReason`)) plus an info finding. Each agentic pass is deadline-bounded (`AGENTIC_TIMEOUT_MS`, default 5 min) via the SDK's `abortController` — a hung turn no longer holds a browser permit forever.
- **Scoring honesty rules (2026-06-11):** `sourceType: none` **skips** the content dimension (excluded + weights renormalize + `totalDimensions` drops — NOT scored 0 at 25%); a failed migrated-page screenshot **fails the visual dimension** (no more placeholder→100); source-vs-target screenshots of different heights are compared over the shared region with a capped size penalty (`dimensionsDelta`); failed/skipped dimensions surface as report-level findings. Pinned by `e2e/tests-live/eval-quality.live.test.ts`.
- **Eval `mode` `redesign` (2026-08-29):** for REPLATFORM migrations (real source → new design system). Content stays source-aware (fidelity path); **visual** runs the deterministic compare for context but the agentic pass gets BOTH screenshots with `prompts/visual-redesign-source.json` (content carryover 45 / new-template execution 35 / editorial polish 20; intentional layout/branding/chrome/color changes deduct 0) and the final visual score is **agentic-only** (the 70/30 pixel blend is skipped — pixel diff is a catastrophic-failure detector, not a penalty). No deterministic fallback in this mode: an agentic failure excludes the dimension (honesty rule, like content). Plumbing: `EvaluationRequest.mode` → evaluator sets `VisualMetrics.redesign` → `formatVisualForPrompt` swaps the prompt. The coordinator sends `redesign` for migrate-routes (generate→`quality`, evaluate-only→`fidelity`). Born from the model-matrix finding that fidelity-visual scored ~25 on every model purely for the intentional redesign.
- **Eval `mode` — `fidelity` (default) vs `quality` (v2.5.0, 2026-06-27):** `eval.run.v1` carries a `mode`; `EvaluationRequest.mode` threads it into `evaluator.ts`. **fidelity** = the original behavior (content = source↔target diff, visual = source↔target screenshot compare) — for real migrations. **quality** = score the page ON ITS OWN MERITS, for AI-generated content where the "source" is a throwaway synthetic page and fidelity to it is the WRONG signal (the redesign succeeding tanks fidelity-visual). In quality mode the evaluator's **content** case runs `analyzeContentQuality` + `analyzeContentQualityWithClaude` (intrinsic editorial quality: substance/coherence/completeness/expertise/structure; tool-free `maxTurns:1`, no browser permit; coarse word/heading/paragraph proxy is the deterministic floor + the no-auth fallback) instead of skipping, and the **visual** case passes NO source so it takes the existing no-source (intrinsic design) path. structure/accessibility are intrinsic in both modes. The coordinator sends `quality` when its route GENERATED the source (`route.includes("generate")`). Same live article: **67 (fidelity) → 88–89 (quality)** — content 66→~82, visual 29→100. New files: `src/engine/prompts/content-no-source.json`, the two `analyzeContentQuality*` exports in `agents/content/`. Default-fidelity keeps the migration/eval/batch lanes byte-identical (and `eval-quality.live.test.ts` green).
- **Screenshot path → durable URL.** The engine surfaces the visual screenshot at `report.results.visual.metadata.screenshot` (`{ absolutePath }`). `persistScreenshot` uploads it via the artifact store and **rewrites it in place** to `{ path, url }` (drops the machine-specific absolutePath) + records an `artifacts` row. Best-effort — never fails the eval; if upload fails the report keeps the local path.
- **Artifacts: R2 when configured, else local.** `createArtifactStore` uses R2 (S3 API) when `R2_*` env is set, else writes `./output` served at `/artifacts` (`EVAL_PUBLIC_BASE` overrides the public base). Same URL contract either way. R2 bucket is public (`r2.dev`); mint a token per `agents/docs/r2-setup.md` to flip dev to real R2.
- **Restart rebuild only runs for `EVAL_ENGINE=real`.** It reads the persisted Task's `metadata.payload` (set when the task was accepted). A task with no payload metadata is marked `failed`. Rebuilt tasks have no SSE subscribers — events apply straight to the stored Task; clients poll `tasks/get`.
- **Own `tsconfig.json`.** Engine `@/` path aliases mean this workspace compiles separately. Root `npm run typecheck` runs **both** (`tsc -p tsconfig.json && tsc -p eval-service/tsconfig.json`) — a change here can break the root typecheck.
- **`cancelTask` is best-effort** — queued jobs aren't individually removable; it just marks the task `canceled`.
- **`eval.reflect` is append-only and never replayed.** The restart rebuild marks an interrupted reflect `failed` instead of re-enqueueing it (it may already have appended). The page is re-read immediately before the save to shrink the lost-update window between concurrent runs. Why it lives HERE and not on the migration agent: the grader holds the evidence, and "the thing being measured never grades itself". The eval container gets `DALIVE_MCP_URL` in `deploy/src/index.ts` for this; `/health` reports `memory: { daliveMcp, agentic }`.

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
