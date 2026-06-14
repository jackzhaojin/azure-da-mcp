# PR #6 — Coordinator v1.0 eval-app UI parity + retire `agents/ui` (as-built)

**Date**: 2026-06-14
**PR**: [#6 `feat(coordinator): v1.0 eval-app UI parity (bulk, direct eval, export); retire agents/ui`](https://github.com/jackzhaojin/azure-da-mcp/pull/6) — merged to `main` as `c158025` (squash-merge of `1e60c98`).
**Scope**: 51 files, +1286 / −984. Two functional areas: **add** the three-lane coordinator dashboard (Single · Bulk · Direct eval) and **delete** the dead `agents/ui` scaffold.
**Author of record**: jackzhaojin (with Claude Code).
**This document**: written as part of **v2.1 part 2 (hardening)** — a clean-room reconstruction of *what* PR #6 changed, *why*, and a senior-engineer **correctness review** of the merged code, written **before** the hardening test pass so the test plan can target the real risk surface. The hardening results and the demo script live in their own files (`07-…`, `DEMO-SCRIPT.md`).

> One-line story: **v2.0 gained capabilities the v1 eval app never had (closed loop, live grid, variance, evidence) but quietly lost surface area the v1 app had (bulk batches, sample files, export, per-dimension eval). PR #6 restores full v1 parity without giving up any v2 capability — and uses the restoration to showcase the decoupled mesh by adding a deterministic "call the eval agent directly" lane next to the orchestrated one.**

---

## 1. Why (the regression PR #6 closes)

The v1.x eval app (`content-authoring-eval/`, frozen — D5) had a mature operator surface:

- a **bulk/batch** form (paste/upload a JSON list of pages, watch them all),
- **sample** files to download and re-upload,
- **result export** (JSON),
- a **per-agent / per-dimension** eval (score just structure, just accessibility, …).

The v2.0 coordinator dashboard (`agents/coordinator`, the **single deployed UI** on `:4004`) was built around the *new* story — the orchestrated closed loop, the live branch grid, variance stats, the evidence panel from the 2026-06-11 hardening sprint — and shipped with **only a single-run trigger**. For anyone who knew the v1 app, that read as a regression: no way to fire a batch, no samples, no export, no deterministic single-dimension eval.

PR #6's thesis: **parity is not a step backward to v1, it's a chance to show off v2's decoupling.** Restore every v1 affordance, but implement the "score one page" path as a **direct A2A call to the eval agent** (not through `coordinate.run`'s routing) — proving any agent in the mesh is independently addressable — and record it in the **same source-of-truth store** so it renders through the identical run-detail UI.

---

## 2. What shipped — the three lanes

The dashboard nav went from one page to three (`app/layout.tsx`): **Single · Bulk · Direct eval**. All three write to the same `runs` store and render through the same `RunDetail` (branch grid + evidence) and the new `BatchDetail`.

### Lane A — Single (`/`, unchanged)
The existing orchestrated `coordinate.run` trigger. Fires one run (any route: evaluate / migrate / generate+migrate / full-loop / auto), fans out `fanOut` branches, threads one `contextId`. Untouched by this PR except that it now lives under a nav bar with siblings.

### Lane B — Bulk (`/bulk`, `BulkRunCard` → `/batch/[batchId]`, `BatchDetail`)
The batch operator surface, **better than v1's**:

- Two modes: **evaluate URLs** (score existing pages) or **full-loop topics** (generate → migrate → evaluate per topic).
- Input by **paste** (one per line), **file upload**, or **drag-drop** a `.json` batch.
- Accepts the clean `{ items: [...] }` shape **or** a v1-style `{ pages: [{ webUrl | sourceUrl | url | topic | title }] }` (back-compat shim in `itemsFromJson`).
- **Load sample / Download sample** buttons wired to `public/samples/{evaluate-urls,full-loop-topics}.json`.
- On submit: mint **one `batchId` client-side**, fire **N independent `/api/trigger` calls** (one per item) at **client-side concurrency 3** (`runPool`), each tagged with the shared `batchId`, then redirect to `/batch/[batchId]`.
- `BatchDetail` polls `/api/runs?batchId=`: summary cards (items / running / completed / failed / avg score), **grade distribution** chips, a **per-item table** (start time, item label, route, status, score → click through to that run's `RunDetail`), **Retry failed**, and **Export JSON** (fetches each run's full detail and downloads a single bundle).

**Why this beats v1:** each item is its **own durable run row**. v1's batch lived in an open browser tab over SSE — close the tab, lose the batch. Here the batch survives the tab closing; you can reopen `/batch/<id>` later and it's all still there.

### Lane C — Direct eval (`/eval`, `DirectEvalCard` → `/runs/[id]`)
The **deterministic lane** and the decoupling showcase:

- Form: target URL, "compare against" (none / webpage / PDF) + source location, a **dimensions multi-select** (structure / accessibility / content / visual — content auto-disabled when source is `none`), and a **fan-out** (variance) control.
- POSTs `/api/eval-direct` → coordinator Express `POST /store/eval-direct` → `runDirectEval()` → calls the **eval agent's own A2A endpoint directly** via the exported `callAgent()` — **not** `coordinate.run`.
- Recorded as a `kind:'eval-direct'` run (`goal:'eval-direct'`, `route:'evaluate'`) that renders through the same branch grid + evidence panel.
- The dimensions subset is the v1 "per-agent eval" capability, now honored end-to-end (see §3).

---

## 3. What shipped — backend

| Change | File | Purpose |
|---|---|---|
| `runs.batch_id` + index | `a2a-common/migrations/0006_runs_batch.sql` | Durable bulk grouping. **Append-only**; D1 has no `_migrations` runner — apply manually before the next deploy. |
| `?batchId=` filter on `/store/runs` | `coordinator/src/runs-routes.ts` | Returns every run a bulk submission fired (ordered `created_at asc`). |
| `POST /store/eval-direct` | `coordinator/src/runs-routes.ts` | Edge-gated; validates + calls `runDirectEval`; returns `202 {runId}`. |
| `runDirectEval` + `runEvalBranch` | `coordinator/src/direct-eval.ts` (new) | The detached direct-eval executor: insert `eval-direct` run, fan out branches against the eval agent via `callAgent`, `computeStats`, persist `progress` + `live` snapshots, return runId immediately. |
| `batch_id` write + `callAgent`/`BranchResult` exports | `coordinator/src/executor.ts` | `coordinate.run` now persists `batch_id`; `callAgent`/`BranchResult`/`computeStats` exported for `direct-eval.ts` reuse. |
| **Eval engine honors `dimensions`** | `eval-service/src/engine/evaluator.ts`, `eval-service/src/executor.ts`, `engine/types/evaluation.ts` | The `eval.run.v1` contract advertised a `dimensions` subset (`"honored from v2"`) but the engine ran all four regardless. Now it runs only requested dims; omitted dims are **skipped (excluded + weights renormalize + `totalDimensions` drops)**, surfaced as "not selected" info findings — never scored 0. Invalid dim names are filtered out in `toEvaluationRequest`. |
| `Download JSON` + batch link | `coordinator/components/RunDetail.tsx` | Per-run export and "part of batch …" backlink. |

The **dimensions renormalization** reuses the exact pattern the 2026-06-11 sprint built for `sourceType:none` (doc `02`/`03`): a not-applicable dimension is excluded from the denominator and surfaced as a finding, rather than counted as 0 at its weight. This keeps the score honest when you ask for a subset.

**Architecture respected.** The Next.js side stays **database-free**: it reads via `/store/*` and the new write goes through `POST /store/eval-direct` (loopback, edge-token + SSO identity injected server-side). The Express side remains the store's only owner. The browser never sees a token.

---

## 4. What shipped — `agents/ui` retired

`agents/ui` (:3000) was a **dead, never-deployed** Next.js scaffold from an early milestone — explicitly superseded by the coordinator dashboard, **not** "the eval UI" (that's the frozen v1 app). PR #6 deletes the whole workspace (15 files), its `dev:ui` script + `workspaces` entry in `agents/package.json`, the `ui-smoke.live.test.ts`, and updates the docs (root + `agents/` + `coordinator/` + `e2e/` CLAUDE.md) to name the coordinator dashboard the **sole UI**. Net: −984 lines, less to maintain, no behavior change (nothing consumed it).

---

## 5. Tests shipped with the PR

- `e2e/tests/coordinator-parity.e2e.test.ts` (**fast tier**, stub engine): (a) `POST /store/eval-direct` records an `eval-direct` run with `route:'evaluate'`, captures the dimensions subset on config, renders branchResults with `evalTaskId` + `dimensionScores`; (b) rejects a payload with no `targetUrl` (400); (c) `GET /store/runs?batchId=` groups the runs one submission fired and returns empty for an unknown batchId (not everything).
- `e2e/tests-live/eval-quality.live.test.ts` gained a **real-engine dimensions-subset** case (proves the engine actually restricts to requested dims and renormalizes).
- PR claims verified locally: `typecheck` ✓, `next build` ✓, fast e2e **52/52** ✓, the live case ✓, full Playwright walkthrough of every lane ✓.

---

## 6. Senior-engineer correctness review (pre-hardening)

I read every changed file as a reviewer. **Verdict: the PR is correct and well-architected.** The high-risk areas — eval-engine dimensions renormalization, the direct-eval detach/contextId threading, the DB-free Next boundary, the batch grouping query — are all handled right. No blocking issues. Findings below are graded; the actionable ones feed the hardening pass (doc `07`).

### Correct-by-design (verified, no change needed)
- **Dimensions wiring is layered defensively.** `DirectEvalCard` drops `content` when source is `none` and only sends a `dimensions` array when it's a strict subset; `toEvaluationRequest` filters to the four valid names (so a bad name can't smuggle through); the engine renormalizes `totalDimensions = 4 − skipped`. Three independent layers agree.
- **`eval-direct` needs no coordinator A2A task.** `runDirectEval` is detached and writes `runs.live` directly, so `RunDetail` renders the live grid from the store poll even though `/store/runs/:id` finds no `da-coordinator` task for that contextId (`a2aTaskId` is null → the `/api/runs/:id` enrichment is correctly skipped, no crash).
- **`/api/runs?batchId=` works without touching `/api/runs/route.ts`** because that route is a pure query-string passthrough to `/store/runs`. Confirmed `batchId` survives the proxy.
- **Batch capability model is consistent.** `?batchId=` (random UUID) is capability-by-id, matching the existing `/store/runs/:id` design — it deliberately bypasses `?user=` SSO scoping, same as run detail. Not a regression.
- **`computeStats` over a direct-eval fan-out** correctly produces eval-score variance (not migration confidence), since branches carry `overallScore`, not `confidence`.

### Findings (graded; none blocking)

| # | Sev | Finding | Where | Disposition |
|---|-----|---------|-------|-------------|
| F1 | Low | `BatchDetail` polls `/api/runs?batchId=` every 2.5 s **forever** — it never stops once all items are terminal (unlike `RunDetail`, which halts on terminal). Idle dashboards keep hitting the store. | `components/BatchDetail.tsx` | **Harden** — stop polling when every run is terminal. |
| F2 | Low | Degenerate dimensions case: `dimensions:["content"]` + `sourceType:"none"` (reachable only via the raw API, not the UI) yields `overallScore:0` / grade `critical` instead of an honest "nothing evaluable" signal — `calculateOverallScore` returns 0 when `totalWeight` is 0, which then reads as a real failing score. | `eval-service/src/engine/evaluator.ts` | **Note** — UI prevents it; consider a guard if time permits. Low value. |
| F3 | Info | `/store/runs?batchId=` ignores `?limit=` — a very large batch returns all rows in one response. | `coordinator/src/runs-routes.ts` | **Accept** — demo-scale batches are small (samples are 3–4 items). |
| F4 | Info | `BulkRunCard` validates evaluate-mode URLs client-side but full-loop **topics** are unvalidated free text — an empty-after-trim topic is filtered, but a 1-char topic submits. | `components/BulkRunCard.tsx` | **Accept** — server validates; topics are intentionally free-form. |
| F5 | Info | `BatchDetail.gradeOf` / `GRADE_CLS` use the label "needs work" while the eval engine's grade enum uses "needs-improvement". Cosmetic — the batch grade is computed locally from `stats.overall.mean`, not read from the eval grade, so they never need to match. | `components/BatchDetail.tsx` | **Accept** — cosmetic, self-consistent. |

The hardening pass (doc `07`) takes F1 (and re-checks F2) and then exercises all three lanes end-to-end through a real browser on the live mesh. Everything else is recorded here for completeness and deliberately left as-is.
