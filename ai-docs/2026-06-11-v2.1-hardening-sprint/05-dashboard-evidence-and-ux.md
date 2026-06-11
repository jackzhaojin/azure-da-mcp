# 05 — Dashboard: The Evidence Panel + Seven UX Hardenings

**Files**: `agents/coordinator/src/runs-routes.ts` (evidence route), `agents/coordinator/app/api/evidence/[taskId]/route.ts` (new), `agents/coordinator/components/{RunDetail.tsx, Dashboard.tsx, TriggerCard.tsx}`, `agents/coordinator/lib/{hooks.ts, types.ts, utils.ts}`
**Verification**: `next build` clean (the Next side's type gate); Playwright visual pass on an SSO-off instance against the real store (screenshots in the sprint summary); evidence endpoint exercised against both deterministic and agentic reports.

---

## Part 1 — The Evidence panel (the wow-factor item)

### Why

The eval engine persists a **rich** report per evaluation: per-dimension findings with severities and recommendations, strengths, the visual screenshot's durable URL, the grade, and (new, doc 02) the mode each score was produced under. The survey's blunt finding: **this evidence had zero readers.** The coordinator extracted exactly two fields (`overallScore`, `dimensionScores`) for stats; the dashboard rendered a 4-cell score grid; everything else — the part that makes a score *actionable* — was write-only data.

The demo run's content=45 is the perfect motivating case: the score was on screen in the recorded video, and answering "why 45?" required opening the SQLite file by hand. After this sprint, it's two clicks.

### How — the read path

The wrinkle: eval reports live in the **eval agent's** store (`eval_reports` + task artifacts), not the coordinator's — each agent owns its own database, and the dashboard's Next.js side is deliberately database-free even for the coordinator's *own* store. The solution stays inside both architectural rules by going **over the mesh, not into a database**:

```
EvidencePanel (browser, on expand)
  → GET /api/evidence/:evalTaskId            (Next proxy; SSO-gated like all /api/*)
    → GET /store/evidence/:evalTaskId        (coordinator Express; edge-token gated)
      → A2A tasks/get on the EVAL agent      (meshClientFactory, mesh token)
        → eval task's report artifact        (already persisted, restart-survivable)
```

The Express route trims the full report to an evidence view: per-dimension `{score, mode, modeReason, screenshotUrl, findings[≤12]}` plus `notes` — the report-level findings whose dimension has **no** result, which after doc 02 is precisely the skip/failure records ("content dimension skipped: …", "visual evaluation failed: …"). No new persistence, no schema change, no coordinator→eval DB coupling: the A2A task artifact *is* the contract, and `tasks/get` already survives restarts because the eval store rebuilds tasks.

Branch results already carried `evalTaskId` (it just wasn't in the client types) — so the join key was free.

### The component

`EvidencePanel` is a collapsed-by-default section at the bottom of each `BranchCard` ("Evidence — findings & how each score was produced"), fetched **lazily on first expand** — a 6-branch run triggers zero evidence fetches until a human asks. Rendering:

- **Mode badge** per dimension: purple `agentic` vs amber `deterministic-only` / `deterministic-fallback`, with the explanation in the tooltip. This is the UI half of doc 02's Fix D — degraded scoring is now visible at a glance, and it's what exposed the missing local token (doc 03) within minutes of existing.
- **Severity-chipped findings** (`critical`/`serious`/`moderate`/`minor`/`info` with the v1 app's color ramp), recommendation inline for non-info findings — real axe findings ("Ensure every HTML document has a lang attribute — Fix html-has-lang…") read exactly like the v1 eval app's output, which is the styling north star.
- **Screenshot link** when the visual dimension stored one (the R2/local durable URL).
- **Skip/failure notes** as amber alert rows above the dimensions.

Graceful degradation was tested deliberately: an evidence fetch against a task the eval store no longer has returns a clean in-panel error, and an unauthenticated mesh hop surfaces as `evidence fetch failed: … 401` rather than a blank panel (this exact case appeared during verification — the SSO-off test instance initially lacked the mesh token, and the panel reported it legibly).

## Part 2 — Seven UX hardenings

Each of these traces to a concrete failure mode from the survey or from the demo-video session's experience:

1. **Live branch grid while running** (with doc 04's data): `RunDetail` renders `stats.branchResults ?? run.liveBranches ?? []` — the same `BranchCard` grid, with `StageChip` gaining a `working` state (blue, spinner) and in-flight branches a pulsing header. The Dashboard's "Running now" cards additionally render compact per-branch chip rows (`LiveStageRows`). The branch grid was moved **above** the activity feed: structured state first, raw text second.
2. **Failed runs explain themselves**: a red error card on the run detail (`runs.error`, with an honest fallback line when older rows have none), and the recent-runs table shows the reason as a `title` tooltip on the failed badge.
3. **No more false trigger failures**: the demo session hit this — `/api/trigger` waits ~1.5s for the runs row to resolve; under load it returned `runId: undefined` and the form threw "trigger failed (no run id)" *while the run was executing*. The form now distinguishes **rejected** (HTTP error → real failure) from **accepted-but-not-yet-visible**: given a `contextId`, it keeps resolving `/api/runs?contextId=` client-side (10 × 500ms) before giving up with a calm "run submitted but not yet visible — it should appear in Recent runs shortly".
4. **Mesh-down warning before triggering**: the trigger form polls `/api/mesh` and maps the chosen route to the agents it actually needs (`evaluate` → eval; `generate+migrate` → content-gen + migration; full-loop/auto → all three). If a required agent is unreachable it shows an amber warning naming it — **warn, don't block**, because the coordinator's cold-start retry means a sleeping Cloudflare container may well wake in time.
5. **Poll failures are visible, stale data is labeled**: `usePoll` now returns `lastUpdated` and extracts the API's human-readable error body instead of stringifying `Error: 404`. Both pages show a freshness line ("updated 14:31:05 · auto-refresh 2.5s" — adopted from the legacy ui, which had this and the new dashboard didn't) and an amber "can't reach the coordinator — showing data from \<time\>" banner on poll failure. A missing run renders "Run not found — …" instead of `Error: 404`.
6. **Run again**: terminal runs get a one-click re-trigger that POSTs the run's own persisted `config` back through `/api/trigger` and navigates to the new run — the natural loop for variance experiments ("same config, new sample").
7. **Time and first-paint polish**: all raw-UTC `ts.replace("T", " ")` displays replaced with `fmtLocal()` (locale-aware, UTC-Z-normalizing — the store sometimes omits the Z); the run table shows loading skeletons instead of a blank card on first paint; the empty state is a designed centered block with a concrete suggestion ("try a full loop with the dryrun backend") rather than one gray sentence; the live feed only auto-scrolls when the reader is already at the bottom (≤40px tolerance) so scrolling up to read a Kimi tool-call isn't yanked back down by the next note.

## What deliberately did NOT change

- **Polling stayed; SSE didn't land.** The A2A layer already supports `tasks/resubscribe`, and an SSE-driven detail page remains the survey's top *remaining* item — but it's a transport rework with Cloudflare-specific stream-cut handling, wrong to bolt onto the end of a hardening sprint. The freshness indicator + failure banner extract most of the UX value at 1% of the risk.
- **No cancel-run action** — `cancelTask` is still best-effort/no-op at the agent level; a UI button that doesn't actually stop work would be dishonest UX. Needs queue-level cancellation first.
- **No pagination/search on Recent runs** (limit 30 holds fine at current volumes), and the variance "distribution" bar wasn't upgraded to a real min/max range visual. Both logged as polish backlog.

## Visual verification (how, exactly)

SSO is back on at `:4004`, so screenshots came from a **second coordinator process** on `:14300`: same store file (SQLite WAL handles the concurrent reader), `AUTH_*` env unset (open mode), mesh token present (so evidence hops work), `EVAL_AGENT_URL` pointed at the live `:4001`. Playwright (MCP) loaded the dashboard and the sourdough run, expanded branch 1's evidence panel, and screenshots were captured to `.playwright-mcp/` (gitignored, per repo convention). Checked against the v1-eval-app styling bar: light theme, stat cards, grade-colored chips — consistent. One real bug was found *by* this pass (the missing-mesh-token 502) and the panel's error path was confirmed legible while fixing it.
