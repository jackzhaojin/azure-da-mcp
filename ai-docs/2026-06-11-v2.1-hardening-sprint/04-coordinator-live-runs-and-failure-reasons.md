# 04 — Coordinator: Live Branch Snapshots + Persisted Failure Reasons

**Files**: `agents/a2a-common/migrations/0005_runs_failure_live.sql` (new), `agents/coordinator/src/{executor.ts, index.ts, runs-routes.ts}`
**New tests**: `agents/e2e/tests/coordinator-live.e2e.test.ts` (fast tier, 2 tests)
**Cloud follow-up**: apply `0005` to D1 (`wrangler d1 execute`) before the next worker deploy — local SQLite migrates itself on boot; D1 has no `_migrations` runner.

---

## Why — two observability holes in the run record

The dashboard survey ranked these #1 and #3 of all UX gaps, but both are really **store** problems the UI couldn't paper over:

1. **While a run executes, the store knows almost nothing structured about it.** `runs.progress` captures the text working-notes (great for the activity feed), but `branchResults` — the structured per-branch, per-stage record the branch grid renders — was computed **only at the end**, embedded in the final `stats` JSON. Consequence: during a 10-minute Kimi migration, the run detail page is a wall of scrolling monospace text; the branch grid, stage chips, and per-stage durations pop into existence only after everything finishes. The most demo-relevant minutes of a run (the "watch the mesh work" minutes) had the least UI.
2. **A failed run recorded no reason.** `executor.ts` wrote `status = 'failed'` and nothing else; the boot-time restart policy did the same for interrupted runs. `RunView` had no error field at all. From the dashboard, a failed run was a red badge — the *why* lived in server logs (gone if the container restarted) or, sometimes, buried in the progress feed (absent entirely for pre-fan-out failures). For a scale-to-zero Cloudflare deployment where containers sleep and restart routinely, "interrupted by restart" vs "agent unreachable" vs "invalid payload" are operationally very different failures that all looked identical.

## What — migration `0005_runs_failure_live.sql`

```sql
alter table runs add column error text;  -- WHY a run failed (status='failed')
alter table runs add column live  text;  -- JSON BranchResult[] snapshot while running;
                                         -- cleared when final stats land
```

Design choices:

- **A separate `live` column, not incremental writes into `stats`.** `stats` has a clean contract — *final, complete, computed-once* — and several readers (UI, legacy ui, tests, the A2A artifact). Mixing partial snapshots into it would have forced every reader to handle a half-built shape. `live` is unambiguous: non-null ⇒ in-flight snapshot; null ⇒ look at `stats.branchResults`. The executor clears it (`live = null`) in the same UPDATE that writes final stats, so there is no window where both claim authority.
- **Same SQL on SQLite and D1** (the platform's standing rule) — two nullable TEXT columns, no backfill needed; old rows read as `error: null, live: null` which the view layer already treats as "nothing to show".

## How — the snapshot pipeline

### `runPipelineBranch` gains an `onUpdate` channel

The branch runner already had `onStage` (text notes). It now also reports **structured snapshots** at every state transition — branch start, each stage's start (an in-flight placeholder is pushed *before* the agent call), each stage's completion (the placeholder is replaced with the real outcome incl. duration/taskId/error), branch failure, branch end:

```ts
// before calling the agent: the stage exists in 'working' state — this is
// what the dashboard's live grid renders while the call is in flight
result.stages.push({ stage, agent: stageAgent, state: "working", durationMs: 0 });
onUpdate?.({ ...result, stages: [...result.stages] });
// …agent call…
// afterwards: replace the placeholder with the real outcome
result.stages[result.stages.length - 1] = { stage, agent, taskId, state, durationMs, …error };
```

A branch's own `state` is now `"running"` until it terminally resolves (`completed`/`failed`) — snapshots are honest about in-flight branches, and `computeStats` (which filters on `=== "completed"`) is unaffected.

### The executor persists snapshots best-effort

```ts
const liveBranches = new Map<number, BranchResult>();
const persistLive = (snapshot: BranchResult) => {
  liveBranches.set(snapshot.branch, snapshot);
  void db.prepare("update runs set live = ? where id = ?")
    .run(JSON.stringify([...liveBranches.values()].sort((a, b) => a.branch - b.branch)), runId)
    .catch(() => {});
};
```

Same rule as the existing progress-note writes: **fire-and-forget, never fail or stall the run over observability**. Write frequency is bounded by stage transitions (≈ 2 × stages × branches per run, e.g. ~12 writes for a 2-branch full-loop) — child working-notes do *not* trigger snapshot writes, so a chatty Kimi migration doesn't hammer the store.

### Failure reasons at both failure sites

- **Executor catch**: `update runs set status='failed', error=?, live=null, …` with `String(err).slice(0, 2000)`.
- **Restart policy** (`index.ts` boot): interrupted `running` rows now get `error = 'interrupted by a coordinator restart — resubmit the run'` — turning the platform's most common "mystery failure" (scale-to-zero container cycling) into a self-explaining one.

### Read path

`runs-routes.ts` adds both columns to the selected `COLS` and the view: `error` on **both** list and detail (the dashboard's run table shows it as a tooltip on the status badge), `liveBranches` parsed from `live` on both as well — the list view needs it because the dashboard's "Running now" cards render compact per-branch stage chips (doc 05). Payload cost is negligible: `live` is null for every non-running run.

## Tests — `coordinator-live.e2e.test.ts` (fast tier, real servers, stub eval)

Testing "state that only exists mid-run" needed care to stay flake-free at `retry: 0`:

1. **Live snapshots appear, then yield to stats.** Submits an eval-only batch (2 targets — the stub eval's deliberate 750ms work window is the timing anchor), then samples `/store/runs?contextId=…` every **50ms** until terminal, collecting every snapshot where some stage is `working`. Asserts: at least one such snapshot was observed (with an `evaluate` stage in `working`), the final run is `completed`, detail shows `liveBranches: null`, `stats.branchResults` has length 2, and `error` is null. The 50ms-vs-750ms ratio gives ~15 sampling opportunities per stage — comfortably deterministic.
2. **Restart reason.** Submits a 4-target batch (≈1.5–2s of stub work at fan-out concurrency 2), waits until the run row reports `running`, **kills the coordinator process mid-fan-out**, restarts it on the same `dbPath`, and asserts the run is `failed` with `error` containing `"interrupted by a coordinator restart"` and `liveBranches` cleared. This is the first test of the restart policy's run-marking behavior at all — it previously only had task-store coverage.

Both spawn with `COORDINATOR_UI: "off"` (no Next boot) to keep the fast tier fast. Suite total: ~8s. These are the +2 in the fast tier's 47→49.

## Verification beyond the suite

On the restarted local mesh, a real `npm run loop` full-loop (fan-out 2) was driven while curling the store: snapshots appeared per-stage and the completed run showed `live: null` with full `branchResults` — then the same data rendered in the dashboard's live grid during the UI verification pass (doc 05). The `217a19bb` sourdough run in the screenshots is that run.
