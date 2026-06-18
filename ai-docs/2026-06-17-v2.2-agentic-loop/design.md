# v2.2 — The Agentic Daily Loop: design

**Status**: Direction chosen (see §8) — trigger = GitHub Actions cron; live postal site, preview-only; real Kimi; shared system identity. Ready to build M-1.
**Scope**: Make the v2.0 `agents/` A2A mesh **start its own work once a day on Cloudflare**, run generate → migrate → **preview** (never auto-publish), and surface the result as a curatable draft.
**Author**: Jack Jin (with Claude Code) · **Date**: 2026-06-17
**Companion**: [`agent-human-collab.md`](./agent-human-collab.md) (the thesis + governance catalogue — this doc builds its **Package A "The Daily Draft"**). As-built mesh: [`../2026-06-08-a2a-platform-v2.0/`](../2026-06-08-a2a-platform-v2.0/). Cloud deploy: [`agents/deploy/CLAUDE.md`](../../agents/deploy/CLAUDE.md).

---

## 0. What we're building (one paragraph)

A **daily heartbeat** that POSTs a `coordinate.run` to the coordinator — exactly the entry point the dashboard's `/api/trigger` and the CLI `npm run loop` already use — with an agent-picked topic, runs the full flow **to a preview and stops**, and records it as a draft a human can promote. The mesh's *behaviour* (routing, fan-out, variance, the runs row, the dashboard grid) is unchanged; we are adding a **self-starting front door** and a **preview/publish split**. The whole challenge is that on Cloudflare **everything we'd lean on is asleep** between runs, and the obvious trigger (a cron handler that holds the run open) **can't survive a real run's duration.** This doc is mostly about choosing the trigger mechanism that works anyway.

---

## 1. How a run is driven *today* (the baseline)

```
human → dashboard /api/trigger ──(A2A message/send, blocking:false)──▶ coordinator container
                                                                          │ executor.execute() runs IN BACKGROUND
                                                                          │  ├─ callAgent → content-gen  (SSE stream)
                                                                          │  ├─ callAgent → migration    (SSE stream, ≤20 min Kimi)
                                                                          │  └─ callAgent → eval         (SSE stream, agentic)
                                                                          ▼ writes runs row (config/progress/live/stats)
dashboard polls /api/runs/[id] every few seconds ◀────────────────────────┘   ← this polling is the implicit keepalive
```

Key facts that shape everything below (verified against current Cloudflare docs + this repo):

| Fact | Source | Consequence |
|---|---|---|
| `/api/trigger` sends **`blocking:false`** — returns a taskId fast; `execute()` keeps running in the container | `coordinator/app/api/trigger/route.ts` | The trigger and the work are already decoupled — good. But *something* must keep the container alive until `execute()` finishes. |
| A container **sleeps after no _incoming_ requests** (`sleepAfter`: coordinator **30m**, eval/gen/migrate **15m**). Background work does **not** count; only incoming requests or `renewActivityTimeout()` reset the timer | `deploy/src/index.ts`; CF Container class docs | Today the **dashboard's polling** is what keeps the coordinator awake during a run. Unattended, that keepalive is gone. |
| Outbound SSE streams the coordinator holds to children **do** keep the *children* awake ("open streams block sleepAfter") | `deploy/CLAUDE.md` | The children are fine *as long as the coordinator is alive and streaming*. The coordinator itself is the single point that can fall asleep mid-run. |
| **Cold starts error, they don't just delay (observed in real use).** From a cold mesh: hit the dashboard → **error**; refresh → coordinator is up; log in → the other 4 agents show **down**; refresh → they're up. The "refresh" is a manual retry that *wakes* each container. Eval is the slowest (standard-3, biggest image) | Jack's lived usage; cold start ~5–30s per container (`deploy/CLAUDE.md`) | An unattended loop has **nobody to refresh.** The orchestrator must **pre-warm + retry** every container before the run, or the first real stage eats a cold-start failure and the branch dies. |
| A Kimi migration is allowed **up to 20 min** (`OPENCODE_MIGRATION_TIMEOUT_MS=1200000`); agentic eval adds minutes (`EVAL_CONCURRENCY=1`, standard-3) | `deploy/src/index.ts` | A real fan-out=1 run can plausibly run **20–35 min**. Fan-out>1 (sequential, concurrency 2) longer. |
| **Cron Triggers, DO alarm handlers, and Queue consumers are hard-capped at 15 min wall time** per invocation | CF Workers limits | A cron/alarm handler that *holds the run open* (even via `waitUntil`) is **cut at 15 min** — it cannot finish a real run. |
| **Incoming HTTP requests have _unlimited_ wall time while the client stays connected**; **Workflow steps have unlimited wall time** (only CPU is limited; I/O wait is free) and are **durable/restartable** | CF Workers/Workflows limits | The long hold must come from *either* an externally-held HTTP connection *or* a Workflow — not from a cron handler. |

**The problem, stated precisely:** an unattended daily run has (a) no dashboard polling to keep the coordinator awake, and (b) a duration that exceeds the 15-min ceiling of every *internal* timed trigger. So the naïve "add a cron that fires the run" fails twice.

---

## 2. The options for the daily trigger (the menu)

Each option answers two questions: **who fires it daily**, and **what keeps the coordinator awake for the full run.**

### O1 — Worker Cron Trigger holds a blocking stream (`waitUntil`)
`scheduled()` opens a **blocking** `message/stream` to the coordinator and awaits it. The open inbound stream keeps the coordinator awake; the coordinator keeps the children awake.
- ✅ Tiny: a `scheduled` handler + one `crons` entry; no new primitive.
- ❌ **Cut at 15 min.** Fine for a `dryrun` fast loop; **fails any real Kimi run.**
- **Verdict:** good enough only for a *fast/dryrun* demo POC. Not the real path.

### O2 — Worker Cron fires-and-forgets (`blocking:false`), walks away
`scheduled()` does exactly what `/api/trigger` does and returns immediately.
- ✅ Smallest possible change (literally call the existing trigger).
- ❌ **Nothing keeps the coordinator awake.** With no polling, the coordinator sleeps after 30m idle — but worse, there's no *incoming* traffic at all after the kick, so it can be reaped mid-run with no one to resume it. The existing stream-recovery (`tasks/get` polling) only helps *within* a living coordinator; if the coordinator itself dies, the run is orphaned.
- **Verdict:** fragile. Rejected.

### O3 — Worker Cron fires, then self-polls as keepalive inside the handler
`scheduled()` kicks the run, then loops `GET /store/runs/:id` every ~30s (each poll = incoming request → renews `sleepAfter`) until terminal.
- ✅ Keepalive solved; fully on-platform; no new primitive.
- ❌ Still **cut at 15 min** (it's a cron handler). Same ceiling as O1.
- **Verdict:** the keepalive idea is right, but the 15-min cap is fatal for real runs.

### O4 — Cloudflare **Workflow** (cron-scheduled) orchestrates the loop ⭐ recommended
A `WorkflowEntrypoint` (`daily-content-loop`) added to the **content-factory** worker. Triggered daily (native Workflow `schedules`, or a 1-line cron Worker calling `env.DAILY_LOOP.create()` — that creation call returns instantly, no 15-min issue). The Workflow runs **durably**:
1. `step.do("pre-warm")` — wake the cold-start cascade (see §3.1): ping coordinator + the 3 agents' `/health` **with retries until each is up**, before any real work. This is the "refresh until it works" that a human does today, done by the orchestrator.
2. `step.do("pick-topic")` — choose today's topic (see §4).
3. `step.do("start-run")` — `getContainer(env.COORDINATOR).fetch('/a2a', …)` with `blocking:false`; capture `runId`/`contextId`.
4. **poll-keepalive loop** — `step.sleep("wait","45s")` then `step.do("poll")` → `getContainer(env.COORDINATOR).fetch('/store/runs/'+id)`; repeat until `status` is terminal. **Each poll is an incoming request to the coordinator → renews its `sleepAfter`** → the coordinator never sleeps mid-run, and it keeps the children streamed-awake. The Workflow itself hibernates between polls (durable), so it costs ~nothing while waiting.
5. `step.do("record-draft")` — stamp the run as today's draft for curation (§5).
- ✅ **No wall-time ceiling** (steps are unlimited; Workers-Paid cron-created Workflow instances get a 1-hour budget per firing and then *yield without failing*). ✅ **Durable & restartable** — if a step/instance dies it resumes from the last successful step. ✅ **Keepalive is free** — the poll loop doubles as the coordinator's heartbeat. ✅ **Reuses everything** — drives the existing `coordinate.run`, so the run lands in the `runs` table and renders in the dashboard like any human run. ✅ **Observable** — `wrangler workflows instances describe` shows every step/sleep/retry.
- ❌ One new primitive (a Workflow binding + class in the worker) and a poll loop to write. Requires Workers Paid (already true — Containers need it).
- **Verdict:** the textbook fit. Cloudflare's own docs point long-running tasks at Workflows. **This is the real path.**

### O5 — External cron holds a blocking HTTP stream (GitHub Actions / cron-job.org)
An off-platform scheduler hits a public coordinator endpoint with a **blocking** `message/stream` and holds the connection for the whole run. Because **incoming fetches have unlimited wall time while connected**, there is no 15-min cap, and the open connection keeps the coordinator awake.
- ✅ Zero new Cloudflare code; trivially "daily" (GH Actions cron). GH Actions jobs can run up to 6h, comfortably covering a run.
- ❌ Off-platform dependency; a **20–35 min held HTTP connection** is exposed to any network blip (the mesh's own undici-timeout disabling helps, but a dropped TCP from GH's side ends it); needs a public, authed trigger path and a long-lived token in GH secrets.
- **Verdict:** a legitimate **fallback / fastest-to-stand-up** if we want "daily" before writing a Workflow — but less robust than O4 and adds an external dep. Keep as plan B.

### O6 — Durable Object alarm
A DO with a daily alarm that drives the run.
- ❌ Alarm handlers are **also 15-min capped** (same table as cron). Same ceiling as O1/O3, plus a hand-rolled scheduler. No advantage over O4.
- **Verdict:** rejected — Workflows are the purpose-built version of this.

### Comparison

| | Fires daily | Keeps coordinator awake | Survives 20-min Kimi | Durable/restart | New surface | Off-platform dep |
|---|---|---|---|---|---|---|
| O1 cron+hold | ✅ | ✅ (stream) | ❌ 15-min cut | ❌ | tiny | — |
| O2 cron+forget | ✅ | ❌ | ❌ orphaned | ❌ | tiny | — |
| O3 cron+poll | ✅ | ✅ (poll) | ❌ 15-min cut | ❌ | small | — |
| **O4 Workflow** | ✅ | ✅ (poll) | ✅ | ✅ | medium | — |
| O5 ext-cron+hold | ✅ | ✅ (held conn) | ✅ | ❌ (re-fires next day) | small | ✅ GH/cron-job |
| O6 DO alarm | ✅ | ✅ (poll) | ❌ 15-min cut | partial | medium | — |

**Recommendation: O4 (Workflow) is the most robust fully-on-platform answer.** **Decision (Jack, 2026-06-17): start with O5 (GitHub Actions)** — chosen for its decoupled nature and first-class observability (the GH run log *is* the audit trail). O5 meets all three stated requirements (wake the containers → bypass dashboard auth → drive a migration via the coordinator); see §3.3. O4 remains the durable on-platform upgrade once the loop is proven. The shared mechanics below (§3.1 pre-warm, §3.2 system identity) apply to O5 unchanged — only the *driver* differs (a GH runner instead of a Workflow).

---

## 3. Recommended architecture (O4 in detail)

```
            ┌─────────────────────── content-factory Worker (existing) ───────────────────────┐
 daily cron │  scheduled()  ──▶  env.DAILY_LOOP.create({date, lane})                            │
  (or the   │                                                                                   │
  Workflow's│  class DailyContentLoop extends WorkflowEntrypoint {                              │
  native    │    run(event, step):                                                              │
  schedule) │      topic   = step.do("pick-topic", …)        ── §4 (RSS/web pull or site gap)   │
            │      {runId} = step.do("start-run",  →getContainer(COORDINATOR).fetch /a2a        │
            │                         blocking:false, goal:generate+migrate*, backend:opencode, │
            │                         site/owner from lane, preview-only)                        │
            │      while not terminal:                                                           │
            │         step.sleep("wait","45s")                                                   │
            │         status = step.do("poll", →getContainer(COORDINATOR).fetch /store/runs/id) │  ← keepalive
            │      step.do("record-draft", → mark runs row draft=1 / approvals seam)             │
            │  }                                                                                  │
            └───────────────────────────────────────────────────────────────────────────────────┘
                         │ in-process getContainer().fetch (mesh-token gated)
                         ▼
                   coordinator container ──streams──▶ content-gen → migration(preview) [→ eval]
                         │ writes runs row  ───────────────────────────────────────────────▶ dashboard renders it
                         ▼
                   da.live **preview** URL (no live publish)         human promotes later (C3)
```

\* **Route choice:** `generate+migrate` deliberately **stops before eval/publish** (the route engine already supports "no mandatory end"). If we want the eval score attached to each draft, use `full-loop` — but the migration stage must be the **preview-only** variant (§5) so the loop never publishes. Either way the loop ends at a preview, never a live page.

**Why drive `coordinate.run` instead of orchestrating agents from the Workflow directly:** the coordinator already owns routing, fan-out, variance, the `runs` row (config/progress/live/stats/contextId/user_email), the live branch grid, and stream-cut recovery. The Workflow's job is *only* the three things the mesh lacks: **decide to start, pick a topic, and stay alive unattended.** Re-implementing the pipeline in the Workflow would fork all of that. The Workflow is a thin, durable wrapper.

**Where it lives:** the `DailyContentLoop` Workflow class + `workflows` binding go in the **content-factory** worker (`agents/deploy`) so it has the `COORDINATOR` container namespace, the `DB` binding, and the secrets in-process. Calling the coordinator via `getContainer(env.COORDINATOR,"singleton").fetch()` is the same in-process path the Worker already uses for hostname routing — mesh-token still applies, no public hop needed.

**Idempotency / single-run-per-day:** key the Workflow instance id by date (`daily-YYYYMMDD`) so a double-fire is a no-op (instance-already-exists), and have `record-draft` tag the `runs` row with the loop date. A re-run for the same day is then explicit, not accidental.

**Failure behaviour:** `start-run` and `poll` get retry configs (cold-start connect is already retried inside `callAgent`, but the Workflow adds a durable outer retry). If the run ends `failed`/`completed_with_failures`, `record-draft` still records it (a failed daily run is itself a signal — surfaces in the dashboard with `runs.error`). The Workflow never publishes, so no failure is irreversible.

### 3.1 The cold-start cascade (observed) — why `pre-warm` is step 1

In real use, from a fully-cold mesh, the manual flow is: open the dashboard → **error** → refresh → coordinator is up → log in → the other 4 agents show **down** → refresh → they're up. That "refresh" is a manual retry that *wakes* a scaled-to-zero container; the first hit to a sleeping container errors rather than waiting, and each container only wakes when something requests it. **Eval is the worst** (standard-3, biggest image, slowest boot). This is the cost of scale-to-zero and we *want* to keep it (cost), so the loop must absorb it rather than remove it.

An unattended loop has nobody to refresh, so the `pre-warm` step does it: fire `/health` at the coordinator **and** all three agents (in parallel), retrying each with backoff until healthy (budget ~60–90s; cold start is ~5–30s but eval can be slower). Only then start the run. Two reasons to wake the *agents* up front, not just rely on `callAgent`'s per-stage retry:
- The stages run **deep into the pipeline** (migrate after generate, eval after migrate). If eval is still cold when the migrate stage finishes 15 min in, that branch can burn its cold-start retry budget and fail at the very end — wasting the whole run. Pre-warming eval *while* generate/migrate run means it's hot by the time it's needed.
- Pre-warm failures are **cheap and early** — if a container won't wake, fail the day's run *before* spending Kimi tokens, with a clear `runs.error`, not halfway through.

(`callAgent` already retries cold-start connects 4×15s — keep it; `pre-warm` is the belt, `callAgent`'s retry is the suspenders.)

### 3.2 Who the daily run belongs to — system identity & shared visibility

**The desire:** a system actor does the daily run and *everyone* sees it, without faking `jackzhaojin@gmail.com`.

**The mesh already supports exactly this.** Runs carry a `runs.user_email`; the dashboard list query is:

```sql
select … from runs where user_email = ? or user_email is null order by created_at desc
```

So a signed-in user sees **their own runs PLUS every run where `user_email IS NULL`.** NULL = "system run" — and the CLI, edge shim, and mesh already write NULL because they have no SSO identity (`runs-routes.ts:114-121`). Data is therefore **soft-siloed per human, but NULL is a shared public lane visible to all.** Per-id reads (`/store/runs/:id`) are capability-by-id and already shareable.

**So the daily loop simply does NOT set `requestedBy`** (the dashboard only ever sets it from the Google session; the Workflow has no session). `user_email` stays NULL → the daily draft appears in **everyone's** dashboard, owned by no human. No fake account, no impersonation.

**One refinement — make it *recognizable* as the daily system, not just anonymous.** A NULL run is today indistinguishable from a CLI/mesh run. Tag the daily run in its `config` JSON (e.g. `source: "daily-loop"`, plus the `loopDate` and a `draft` flag) so the dashboard can badge it "🤖 Daily draft" and the "today's drafts" filter (§5) can find it. This is config-only — **no schema or auth change.**

> Alternative considered & rejected for the POC: a real sentinel account (`system@content-factory`). That would require widening the filter to `… or user_email = 'system'` to stay shared, adding a special case for no benefit. NULL already *means* "shared system run" — reuse it.

### 3.3 Chosen first slice — the GitHub Actions orchestrator (O5)

A scheduled GitHub Actions workflow (`.github/workflows/daily-content-loop.yml`, `on: schedule: cron`) is the daily driver. It's plain `curl`/`node` against the public mesh, so the entire run is visible in the GH Actions log — that observability is why it was chosen over a Workflow for the first cut. It satisfies the three requirements precisely:

**1 · Wake the containers (§3.1 pre-warm).** First job step loops `curl -fsS https://content-factory{,-eval,-gen,-migrate}.jackzhaojin.com/health` with retry/backoff until each returns 200 (`/health` is public — server.ts:167 — so no token needed just to wake). Eval is slowest; budget ~90s. This is the "refresh until they're up" you do by hand, scripted.

**2 · Bypass the dashboard auth (system identity).** Google SSO is the Next middleware on **pages + `/api/*` only**; the Express A2A surface is mounted before it and is **token**-gated, not session-gated:
  - `POST https://content-factory.jackzhaojin.com/a2a` with `Authorization: Bearer $A2A_MESH_TOKEN` (server.ts:100-105) — submit `coordinate.run`.
  - `GET …/store/runs?contextId=…` and `…/store/runs/:id` with `Authorization: Bearer $A2A_EDGE_TOKEN` (edge falls back to mesh) — resolve the runId and poll status.
  Both tokens live in **GitHub repo secrets**. The Action authenticates *as the mesh*, never as a Google user → no `requestedBy` → `user_email` NULL → shared system run (§3.2). This is the legitimate "bypass" — it's the same door the CLI and other agents use.

**3 · Drive the migration via the coordinator.** The `coordinate.run` payload: `goal:"full-loop"` (or `generate+migrate`), `topic` from the pick step (§4), `backend:"opencode"` (real Kimi), `site:"da-live-postal-2025-07"`, `owner:"jackzhaojin"`, `previewOnly:true` (§5), `fanOut:1`, no `requestedBy`. Add `labels`/config `source:"daily-loop"` + `loopDate` for the badge.

**Drive style — fire + poll, don't hold the stream.** Submit with `blocking:false` (returns a taskId fast), then poll `/store/runs/:id` every ~30–45s until terminal. Why polling over a held blocking stream: (a) each poll is an incoming request that **renews the coordinator's `sleepAfter`** (the keepalive), (b) it's robust to a dropped connection across a 20–35 min run, (c) every poll line is a timestamped entry in the GH log. The coordinator runs `execute()` in the background and holds the child SSE streams (keeps eval/gen/migrate awake); GH polling keeps the coordinator awake.

```
GitHub Actions (cron, daily)
  step pre-warm   → curl /health × 4 (retry until 200)          [public]
  step pick-topic → §4 (RSS/web pull → topic string)
  step start-run  → POST /a2a coordinate.run (Bearer mesh, blocking:false, previewOnly, no requestedBy)
  step resolve    → GET /store/runs?contextId=…  (Bearer edge) → runId
  step poll       → loop: sleep 45s; GET /store/runs/:id; print status; until terminal   ← keepalive + audit log
  step summarize  → echo preview URL(s) + grade to the GH step summary
```

**Known tradeoff vs O4:** O5 is **not durable** — if the GH runner dies mid-poll, observation + keepalive stop. The run itself continues in the coordinator and still lands in the `runs` table (so the draft isn't lost), but a run longer than the coordinator's 30m `sleepAfter` could be orphaned if the runner died. Acceptable for the POC (runner deaths are rare; runs are ~<35m); O4's Workflow is the durability upgrade when we want it.

---

## 4. Topic pick — the C0 step (`step.do("pick-topic")`)

The mesh has never read its own output; today it only writes, and `content.synthesize-source` *generates* a synthetic legacy page from a topic string — it does not choose the topic. Options, cheapest first (collab §2.2):

- **A — latest off the internet (recommended first).** Pull a relevant RSS/feed or run one web search in the site's lane, take a fresh headline → `topic` string. Most obviously "new every day," zero dependence on site state. Runs entirely inside the step (a `fetch` + a light distill; optionally one Claude call to phrase a clean topic). Feed list lives in the **editorial-lane config** (C7 seam) so it never wanders off-brand.
- **B — site-grounded gap pick (fast follow).** The plumbing exists but is uncalled: the da.live MCP (the migration agent already holds `DALIVE_MCP_URL`) exposes `list_dalive_content` (paths **with `lastModified`** — a ready-made recency/staleness sort) and `get_dalive_content` (live HTML). Read recent pages, pick something adjacent or missing. Net-new wiring on the *read* side.
- **C — later:** the coordinator's `goal:auto` is a deterministic table today with an LLM planner already flagged pending; a smarter topic-pick is the natural home for that — **not now.**

**Recommendation:** ship **A** (one feed + a topic string), keep it dumb and daily, behind a small `lane` config (allowed subjects/sources/site/owner). Add **B** as a fast follow once A proves the loop.

---

## 5. Preview, never publish — the C3 companion · **the gate is on PROMOTE, and the loop is already preview-only**

**Decision (Jack, 2026-06-17): the daily loop authors to the live `jackzhaojin/da-live-postal-2025-07` site, preview-only, with a hard publish gate on promotion.**

**Verified reality (corrects collab §3):** the migration agent **already stops at preview.** Despite its name, the deployed `preview_publish_dalive_content` MCP tool only calls `DaliveClient.previewPublish()`, which POSTs **solely to `admin.hlx.page/preview/{org}/{site}/{branch}/{path}`** — the `.aem.page` staging surface (`functions/src/modules/DaliveClient.js:118-138`). There is **no `/live/` call anywhere in the MCP**; nothing in the mesh can push to the production `.aem.live` edge today. The migration's own target/validation URL is the `.aem.page` preview (`opencode-prompt.ts:71`). So the collab doc's "authors and **publishes** real pages to a **live** site" was an overstatement — it previews.

**What this means for the build — the framing flips:**
- The "don't auto-publish live" safety the daily loop needs is **already satisfied by construction**: the only authoring capability that exists *is* preview. An unattended daily run against the live site lands on `.aem.page`, never `.aem.live`. The reversibility principle (collab §9) holds for free.
- ⚠️ Caveat: `.aem.page` preview **is still publicly reachable** by URL (it's staging on the open internet, cacheable/shareable) — it is just not the production `.aem.live` surface. So "preview, human-curated before it's truly live" is the right mental model, not "preview = private."
- The **net-new** C3 work is therefore the **promote/publish side, which does not exist yet**: a gated path that pushes an approved preview to `.aem.live` (a new `DaliveClient.publish()` hitting `admin.hlx.page/live/...` + a `migration.publish` skill, human-gated). That's the "hard gate" — and it's the *promote* action in the draft queue (M-c), not a restraint on the loop.

So the daily POC needs **less** than feared: no mesh change to make the loop safe (it already previews). The dashboard already has the Evidence panel + run/branch grid; a **draft tag** on the `runs` row + a "today's drafts" filter is the **C6-lite draft queue** (collab Package A); **promote** calls the new gated live-publish. Full score-adjudication (C4), approvals table (C6-full), editorial-lane plane (C7), and earned autonomy (M3) stay **deferred** to later packages.

---

## 6. What's in scope vs deferred

| | This build (v2.2 / Package A) | Deferred (collab Packages B/C) |
|---|---|---|
| Trigger | **O5: GitHub Actions cron** (decoupled, observable) | O4 Workflow = on-platform durability upgrade |
| Identity | NULL `user_email` system run (mesh-token, no SSO) — shared/visible to all | sentinel system account + roles (C7) |
| Topic pick (C0) | A: internet pull behind a `lane` config | B: site-grounded gap pick; C: LLM planner |
| Output | **already preview-only** (`.aem.page`, never `.aem.live`) — no loop change needed | — |
| Promote (the hard gate) | **net-new** gated live-publish (`DaliveClient.publish()` → `/live/` + `migration.publish`) | auto-promote / earned autonomy (M3) |
| Curation (C6-lite) | `runs` draft tag + "today's drafts" filter + manual promote | calibration corpus, approvals audit table (C6-full) |
| Governance | reversibility-by-construction (preview-only); pre-warm + token auth | C4 score adjudication, C7 policy plane, C5 real kill |

---

## 7. Incremental build plan (per the 2026-06-17 decisions: O5 GH Actions · live postal site · real Kimi · preview-only)

1. **M-1 · The GH Actions daily loop (O5).** `.github/workflows/daily-content-loop.yml` (`on: schedule`): pre-warm (curl `/health` × 4, retry) → pick-topic (A: one feed → topic string) → `POST /a2a coordinate.run` (Bearer `A2A_MESH_TOKEN`, `blocking:false`, `goal:full-loop`, `backend:opencode`, `site:da-live-postal-2025-07`, `owner:jackzhaojin`, `fanOut:1`, **no `requestedBy`**, config `source:daily-loop`) → resolve runId via `/store/runs?contextId=` → poll `/store/runs/:id` to terminal → echo preview URL + grade to the GH step summary. Tokens in GH repo secrets. **Outcome: a real Kimi-authored `.aem.page` preview, shared to all, every day, unattended — visible in both the GH log and the dashboard.** *(No mesh change required — migration is already preview-only.)*
2. **M-2 · Draft queue + promote = the hard gate (C6-lite + the net-new live-publish).** Dashboard "today's drafts" filter on the `source:daily-loop` + draft tag (reuses Evidence panel / branch grid). Build the **net-new gated live-publish**: `DaliveClient.publish()` → `admin.hlx.page/live/...`, exposed as a human-gated `migration.publish` skill, wired to a one-action **Promote** button. This is the only place `.aem.live` is ever touched, and only by a human. *(closes Package A — "agent-led, human-curated".)*
3. **Later:** topic-pick B (site-grounded gap); then collab Package B (C4 score adjudication / C1 / C6-full under M2); then **O4 Workflow** as the on-platform durability upgrade to retire the GH-runner dependency.

---

## 8. Decisions & still-open

**Decided (Jack, 2026-06-17):**
- **Trigger** = O5 GitHub Actions cron (decoupled + observable); O4 Workflow is the later durability upgrade.
- **Site** = live `jackzhaojin/da-live-postal-2025-07`, **preview-only** (already true), hard gate on **promote** to `.aem.live`.
- **Backend** = real Kimi (opencode).
- **Identity** = NULL `user_email` system run via mesh token (shared, no fake account).

**Still open (smaller, can default):**
1. **Route** — `full-loop` (attach an eval score/Evidence to each draft — recommended, richer curation) vs `generate+migrate` (cheaper, no score). *Default: `full-loop`.*
2. **Topic source specifics** — which feed(s) / editorial lane for pick-A? (postal/shipping/logistics theme to match the site.) Needs one concrete feed URL or a small curated list.
3. **Fan-out per day** — 1 draft (simplest) vs N (variance = the adaptTo() headline, but N× cost/time). *Default: 1; revisit once stable.*
4. **Cadence / time-of-day** — daily at what UTC hour? (GH `schedule` cron; pick a low-traffic hour.)
5. **GH secrets** — confirm `A2A_MESH_TOKEN` + `A2A_EDGE_TOKEN` get added to the repo's Actions secrets (only blocker to M-1 standing up).

---

## 9. As-built & validation (2026-06-17, M-1 shipped)

**Built & deployed:**
- `content.ideate` skill in content-gen (`generator.ts` `ideateTopic()` + `index.ts`) — deterministic, date-seeded, lane-aware (default lane `postal-logistics`). Contract `content.ideate.v1.json`.
- Coordinator ideates when a generate route arrives with no `topic` (`executor.ts`: `willIdeate`, `validateForRoute({skipTopic})`, writes the chosen topic back into the run config).
- `.github/workflows/daily-content-loop.yml` + `.github/scripts/daily-content-loop.mjs` — pre-warm → submit (mesh-token, no `requestedBy`, no `topic`) → resolve → poll-keepalive → step summary. `schedule` (09:20 UTC) + `workflow_dispatch` (overrides; `dryrun` for cheap smokes).
- e2e: fast `content.ideate` + coordinator no-topic tests; cloud `cloud-daily-loop` ideation test. Full fast suite 61/61 green.
- Cloud: deployed all 4 containers (version `8f06deea`, incl. PR8 Dockerfile fix + `AUTH_ALLOWED_EMAILS=""`).
- **D1 fix:** remote D1 was missing `batch_id` (migration `0006` never applied) — the coordinator INSERT failed, so the first run produced no row. Applied `0006_runs_batch.sql` to remote D1. (The deploy/CLAUDE.md gotcha "apply pending remote-D1 migrations" bit exactly here.)

**Validated end-to-end on cloud (workflow_dispatch == the identical job `schedule` fires):**
- ✅ **Wake-up:** pre-warm woke all 4 cold containers (every run; healthy on attempt 1 within seconds).
- ✅ **Scheduled job — dryrun:** full loop completed in 92s — agent-led ideation picked *"A practical guide to postal address validation and standardization"*, generate→migrate→eval, score 75, preview URL, shared system run.
- ✅ **Real loop — opencode:** run `20a3cf2a` in 454s — **Kimi K2.6 authored a real da.live page to `.aem.page` preview** (never `.aem.live`), eval **73**, `user_email` NULL (shared). The GH step summary surfaces topic + preview URL + score.

**Known caveat — cold migration container (the one real reliability risk):** the *first* opencode turn on a freshly-cold migration container can exceed the 20-min `OPENCODE_MIGRATION_TIMEOUT_MS` (observed: first post-deploy run timed out; the warm retry succeeded in 7.6 min). Because everything sleeps between daily runs, **every daily run hits a cold migration container.** Mitigation shipped: the loop **auto-retries once** (`MAX_ATTEMPTS=2`) — the second attempt runs on now-warm containers with a fresh Kimi turn, which is what recovers it in practice. The loop also correctly reports a genuine failure (`completed_with_failures` → red GH run + summary). Deeper future option: a migration-agent `/warmup` endpoint to boot `opencode serve` + MCP during pre-warm (so the first real turn isn't paying cold-init).

*Design v0.3 — M-1 shipped & validated end-to-end on Cloudflare (wake-up + scheduled + real Kimi preview, shared system run). Next (M-2, deferred): the dashboard "today's drafts" filter + the net-new gated **promote**-to-`.aem.live`.*
