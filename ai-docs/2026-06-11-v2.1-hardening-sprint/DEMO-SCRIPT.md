# A2A Platform v2.0 — Demo Script (eval + coordinator)

**Audience**: adaptTo() Sept 2026 (and any stakeholder walkthrough).
**Goal**: in ~6 minutes, show (1) the **coordinator** orchestrating the closed loop across a decoupled agent mesh with live progress + variance, and (2) the **eval agent** scoring real pages honestly — both the orchestrated path and a direct, deterministic call — with diagnosable evidence.
**Form**: this is a *spoken walkthrough with exact clicks*. It is written so a Playwright spec can drive it later for a recorded video; every step has a deterministic expected state. Timing notes call out where to let a live run cook vs. cut to a pre-seeded one.
**Surface**: the coordinator dashboard, `http://localhost:4004/` (local) or `https://content-factor-dash.jackzhaojin.com/` (cloud). The dashboard is the **sole UI**; all three lanes (Single · Bulk · Direct eval) and the run/batch detail pages live here.

> Validated end-to-end on the local mesh during the v2.1 part-2 hardening pass (2026-06-14) — every step below was executed through a real browser against the 4-agent mesh with the **real** eval engine and the **agentic** tier enabled. See `07-pr6-hardening-and-ui-validation.md` for the evidence.

---

## 0. Pre-flight (off-camera)

```bash
cd agents && nvm use 20
set -a && source .env && set +a          # mesh + edge tokens, CLAUDE token (agentic eval)

# 4 agents + the coordinator/dashboard, one per terminal (or backgrounded):
npm run dev:eval                          # :4001  real engine, agentic tier on
npm run dev:content-gen                   # :4002
npm run dev:migration                     # :4003  dryrun backend (instant, no real writes)
npm run dev:coordinator                   # :4004  A2A + dashboard
```

Confirm health (all four `ok:true`), then open `http://localhost:4004/`.

- **SSO**: with `AUTH_GOOGLE_ID`/`SECRET` set the dashboard requires Google sign-in (and ties runs to your email). For a clean recording you can either sign in first (off-camera) or run the coordinator with those vars unset for an open dashboard. The cloud host always has SSO on.
- **Pacing trick for video**: the migration backend is `dryrun` (instant), but the **eval stage is a real agentic pass** (~1–2 min for a 2-branch fan-out). Two options: (a) let it cook and narrate the live grid, or (b) trigger it live to show the *start* + live grid, then cut to an already-completed run of the same topic for the evidence deep-dive. The dashboard's "Recent runs" table is full of completed runs to cut to.

Opening line: *"This is a mesh of independent AI agents — content-gen, migration, eval — that only speak the A2A protocol to each other. The coordinator routes work across them. Nothing is a monolith; any agent is independently addressable. Let me show you."*

---

## Part A — Coordinator: the orchestrated closed loop (Single lane)  ·  ~2 min

The home page (`/`) is the **Single** lane. Point out the four **mesh chips** top-right — coordinator / content-gen / migration / eval, all green = the whole mesh is up and discoverable over A2A.

1. **Route** → leave on **"Full loop — generate → migrate → evaluate"**.
   - *"One trigger, three agents: content-gen invents a legacy source page, migration converts it to da.live/EDS, eval scores the result."*
2. **Fan-out** → set to **2**.
   - *"Fan-out runs the same pipeline twice in parallel — that's how we measure variance, the headline metric: how consistent is the migration?"*
3. **Topic** → type **`rooftop solar panel maintenance guide`**.
4. **Migration backend** → leave **`dryrun`** (say: *"swap this to `opencode` and Kimi K2.6 authors a real da.live page — we've done that live, but dryrun keeps the demo instant"*).
5. Click **Run it**.

**Expected**: redirect to `/runs/<id>`. The header shows the topic, the route `generate→migrate→evaluate`, a live elapsed timer, and a **live branch grid** — two branch cards, each a row of **stage chips** (generate → migrate → evaluate) that flip from spinner → green as the agents report. Below, the **Live activity** feed streams the agents' working notes in real time (including, on the opencode backend, Kimi's tool calls).

- *"This isn't a fake progress bar — every chip and every line is a real A2A status update from a real agent. The run is detached and durable: I can close this tab and the run keeps going; the store is the source of truth."*

When it completes (or cut to a completed run): the **Overall** card shows **score μ ± σ**, **pass rate**, **branches completed**, and migration confidence. The **Variance per dimension** table breaks score mean/stddev/min/max per dimension with a bar.

- *"Two branches, and here's the spread. Low stddev means the migration is reliable; a wide spread is a red flag we surface instead of hide."*

---

## Part B — Coordinator: bulk batches (Bulk lane)  ·  ~1.5 min

Nav → **Bulk**.

1. **Mode** → **"Evaluate URLs — score existing pages"**.
2. Click **Load** next to "Sample batch" → the textarea fills with 3 URLs (`example.com`, `example.org`, `iana.org/help/example-domains`). (Mention you can also **drag-drop** or **Upload** a `.json` batch, or **Download** the sample to edit.)
3. Click **Run batch (3)**.

**Expected**: redirect to `/batch/<id>`. Summary cards: **items 3 · running 3 · completed 0 · failed 0 · avg —**, then a per-item table, each row a **running** spinner.

- *"Each item is its own durable run, all grouped under one batch id. Unlike the old eval app, this isn't a fragile open-tab stream — close it, come back later, it's all still here."*

Let it finish (3 real agentic evals, ~1–2 min) **or** cut to a pre-run batch. On completion: the cards flip to **completed 3 · avg ~70**, **grade-distribution chips** appear (e.g. `good: 2`, `needs work: 1`), and each row shows a score.

4. Click **Export JSON** → downloads `batch-<id>.json` (the full bundle: every run's config + stats + per-branch eval task ids). Open it briefly: *"This is the durable record — reproducible, auditable, exportable. Retry-failed re-fires just the failures into the same batch."*

---

## Part C — Eval: direct, deterministic, per-dimension (Direct eval lane)  ·  ~2 min

This is the eval showcase **and** the decoupling proof.

Nav → **Direct eval**.

- *"Everything so far went through the coordinator's orchestration. But the eval agent is independently addressable — I can call it directly, bypassing generate/migrate entirely. Same mesh, same store, same UI."*

1. **Target URL** → `https://example.com`.
2. **Compare against** → leave **"none — skip content fidelity"**. Note the **Content** dimension auto-greys out: *"Content fidelity needs a source to compare against — no source, so the eval honestly excludes it rather than scoring it zero."*
3. **Dimensions** → click **Visual** to deselect it, leaving **Structure + Accessibility** (the chip caption reads "2 of 4 dimensions · omitted dimensions are excluded from the score, not failed"). *"This is per-dimension scoring — pick exactly what you want to measure."*
4. Click **Evaluate**.

**Expected**: redirect to `/runs/<id>`, kind **eval-direct**, the branch grid with a single **evaluate** stage. When it completes, the branch card shows the overall score and **per-dimension** tiles for **structure** and **accessibility** only.

5. Expand **"Evidence — findings & how each score was produced"** on the branch card. This is the payoff:
   - Each dimension shows a **mode badge**: **`agentic`** (purple) = scored by the Claude agentic pass blended with deterministic analysis; **`deterministic`** (amber) = agentic didn't run, with the reason.
   - Real **findings** with severities and recommendations.
   - For visual evals, a **screenshot** link (durable R2 URL).
   - Report-level **notes** call out skipped/excluded dimensions (e.g. "content dimension skipped: no source reference provided").

- *"This is the honesty layer. Before this sprint, a degraded score was a silent mystery. Now every number tells you how it was produced and why — agentic vs deterministic, what was skipped, what failed. The eval agent is auditable, not a black box."*

---

## Wrap-up (talking points)

- **Decoupled, not a monolith** — four independent agents, A2A only. Single lane orchestrates them; Direct eval calls one straight. Same store, same UI.
- **Honest by construction** — excluded dimensions renormalize instead of scoring 0; degraded scores record their mode + reason; failures persist *why*.
- **Durable** — every run (single, bulk item, direct) is a store row that survives restarts and tab-closes; exportable as JSON.
- **Real** — real Chromium, real axe-core, real Claude agentic passes, real da.live authoring on the opencode backend. No mocks anywhere, including the tests.
- **Cloud-ready** — the same mesh runs on Cloudflare Workers + Containers (D1 store, R2 artifacts) behind `content-factory*.jackzhaojin.com`.

## Appendix — the fastest reliable cut (if you want zero waiting on camera)

1. Pre-seed 3–4 runs off-camera (one full-loop fan-out 2, one bulk batch, one direct eval) so "Recent runs" and a batch are already populated.
2. On camera: trigger ONE of each live to show the *start* + live grid (10–15s each), then immediately open a pre-seeded completed twin for the Overall / Variance / Evidence deep-dive.
3. The Evidence panel on a completed **full-loop** run (with a real migrated page) is the richest single screen — structure/accessibility/visual all `agentic`, a screenshot link, real findings. Use it as the closing shot.
