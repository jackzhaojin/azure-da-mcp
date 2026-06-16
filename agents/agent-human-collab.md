# Agent-Led, Human-Curated: An Initiation & Governance Proposal

**Status**: First-draft options, for narrowing. Not a decision record.
**Scope**: The v2.0 `agents/` A2A mesh (content-gen → migration → eval → coordinator), local + Cloudflare.
**Author**: Jack Jin (with Claude Code) · **Date**: 2026-06-16
**Companion to**: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../ai-docs/2026-06-08-a2a-platform-v2.0/) (as-built) and [`ai-docs/2026-06-11-v2.1-hardening-sprint/`](../ai-docs/2026-06-11-v2.1-hardening-sprint/) (eval honesty + observability).

---

## 0. The thesis

Today this mesh only moves when a human types a topic into a box — the CLI `npm run loop <topic>` or a dashboard form. The human *is* the starting gun. This proposal adds a **second way in: let the mesh start its own work.**

On a schedule, the mesh picks something to write about — from what's already published on the site, or simply the latest thing off the internet — runs the full **generate → migrate → eval** flow to a **preview**, and stops there. A human still kicks off their own runs whenever they want, and a human still decides what actually goes live. That's the shape: **agent-led, human-curated** — agents can initiate, humans still think things through, drive their own flows, and curate the output.

The bar for this first cut is deliberately low: show that the mesh can produce **new content every day on its own**, with a human curating, and *publish only on a human's nod*. It is a proof of concept, not a clever editorial brain. Everything else in this doc — the governance catalogue — is what keeps that safe and what it can grow into; the **daily-preview loop is the small, demonstrable slice to build first.**

---

## 1. The shift this introduces — and why it makes the rest of the doc necessary

Right now, a human typing the topic is an **implicit front gate**: a person chose the subject, the site, and the moment. The instant a scheduler initiates a run, *that gate is gone.* That single fact drives the whole design and splits the work cleanly in two:

- **The engine (new — §2).** Something has to decide *to start* and *what to write*. This is the agent-led half the mesh has never had.
- **The brakes (already drafted — §3 onward).** With the human no longer choosing each run, the **downstream gates become load-bearing**: approving the publish, and trusting the eval. The governance work below was originally framed around human-started runs; agent-started runs are exactly what make it matter.

So this is not a replacement of the governance proposal — it's the missing front half. Initiation is *why* the gates exist. Two modes of entry coexist:

| Entry | Who decides the topic | Front gate | Where the human sits |
|---|---|---|---|
| **Human-started** (today) | Human types it | Human (implicit) | Anywhere they choose |
| **Agent-started** (new) | The scheduler / a light topic-pick step | *None* — must be re-supplied downstream | Editorial policy up front + curating drafts + the publish nod |

---

## 2. The initiation layer — how the agent starts itself (the engine)

This is the net-new capability and the heart of the proof of concept. Three small pieces; none of them clever.

### 2.1 The scheduler — a daily heartbeat
A timed trigger that POSTs a `coordinate.run` to the coordinator, exactly as the CLI/dashboard do today. The mesh already runs as a **Cloudflare Worker (`content-factory`)**, and Workers have **native cron triggers** — so a once-a-day kickoff is essentially free infra: a cron handler that calls the same `coordinate.run` entry point the dashboard's `/api/trigger` already uses. No new protocol, no new agent server. Locally it can be a plain interval or a manual "run today's" button for demos.

### 2.2 The topic pick — deliberately lightweight
The mesh has never read its own output; today it only *writes*. For the POC, "what should we write next?" can be as simple as we want:

- **Option A — grab the latest off the internet.** A web search / trend / RSS pull for a fresh topic in the site's lane. Cheapest, most obviously "new every day," zero dependence on site state.
- **Option B — site-grounded gap pick.** Read recently-published pages and pick something adjacent or missing. The primitives already exist and are *already wired into the migration agent's MCP*: `list_dalive_content` returns paths **with `lastModified` timestamps** (a ready-made "what's recent/stale" sort) and `get_dalive_content` returns the live HTML. Nothing calls the read side yet, but the plumbing is there.

Either feeds a `topic` string into the existing `content.brief` flow — which today *requires* a human-supplied topic. This step is the only thing standing between "human types it" and "the mesh chose it." Start with A (or A+B), keep it dumb, make it daily. (Worth noting: the coordinator's `auto` route is a *deterministic* table today, with an LLM planner already flagged as pending — a smarter topic-pick is the natural home for that later, not now.)

### 2.3 Preview, never auto-publish — the cadence
The daily loop runs the full flow to a **preview** and stops. This isn't a safety bolt-on; it's the same instinct as **reversibility-first** (§9) and maps directly onto **C3's "author to preview, gate the publish" split** (§6). The agent drafts every day; the human reviews the day's drafts and **promotes** the good ones. The human's job becomes *curation*, not *operation* — which is the entire point of "human-curated." Daily previews are cheap, reversible, and demonstrable; the only irreversible step (publish) stays behind a human.

**POC success = a preview of genuinely new content appears every day with no human kickoff, and a human can promote any of them to live with one action.**

---

## 3. Why governance still matters — two distinct problem classes

With the front gate gone, oversight is two things, and they want different mechanisms. Naming them is the most useful thing this section does.

### Problem class A — **Action governance** (the agent *does* something irreversible)
The migration agent **authors and publishes real pages to a live da.live site** (`migration-agent/src/backends/opencode.ts` drives Kimi K2.6 to `create → preview-publish` against `jackzhaojin/da-live-postal-2025-07`). This is the textbook agentic-AI risk: *agents take irrevocable actions at machine speed, chaining tool calls across systems* ([CSA / NIST Agentic Profile](https://labs.cloudsecurityalliance.org/agentic/agentic-nist-ai-rmf-profile-v1/)). A publish is outward-facing: once it's on the edge it can be cached, indexed, and seen. Action governance is about **gating consequential, hard-to-reverse actions** — publish, spend, downstream Make.com triggers, site/owner selection. **The daily scheduler raises the stakes here**: it removes the human who used to be implicitly present at every start.

> Tellingly, the headless backend **deliberately removed** the one human gate that existed: `permission:"allow"` and *"the skill's confirmation gate is declared pre-satisfied in the prompt"* (v2.0 doc 05). The fastest path to a governed mode is re-introducing exactly that gate — on purpose, where it belongs.

### Problem class B — **Verdict governance** (the human *trusts* what the agent reports)
The eval agent emits a **quality score a human will act on** ("ship / don't ship", "Claude vs Kimi"). The entire v2.1 hardening sprint was a case study in why this is dangerous: a dead URL scored **visual = 100**; a faithful migration scored **content = 45** from word-overlap while the agentic tier had silently never run (sprint docs 02–03). The risk here isn't a bad action — it's **automation bias**: a human "overly and unjustifiably trusting the suggestions of an automated system" ([EU AI Act Art. 14 analysis](https://arxiv.org/pdf/2502.10036)). In a daily-curation workflow this is acute: a human skimming a queue of auto-generated drafts is *primed* to rubber-stamp. Verdict governance is about **keeping the human's trust *calibrated* to what the score actually measured.**

The hardening sprint already built the raw material for class B — `mode: agentic | deterministic-only | deterministic-fallback`, the Evidence panel, variance stats. What's missing is *routing a human's attention to the scores that don't deserve trust.* That's a HITL design question, not just a UI one.

**These two classes, plus the new initiation layer, are the spine of every option below.** A checkpoint is worth adding only if it meaningfully serves initiation, A, or B.

---

## 4. Conceptual foundations (the science, compressed — with "so what for us")

### 4.1 The oversight taxonomy — four postures, not one
| Posture | Definition | In our mesh |
|---|---|---|
| **Human-in-command (HIC)** | Human sets policy and decides *when/whether* to engage the AI at all | **Editorial lane, allowed sites, budgets, model allowlist, the daily schedule itself, autonomy tiers** |
| **Human-in-the-loop (HITL)** | Human must approve/authorize *before* the system acts | **Promote-to-publish approval**; brief sign-off |
| **Human-on-the-loop (HOTL)** | Human monitors a running/autonomous system and *can* intervene/override | Watch the live branch grid; kill a hung run; override a score |
| **Human-over-the-loop** | Human reviews *after the fact*, audits, and feeds corrections back | **Curate the daily draft queue**; label eval reports → calibration corpus; approval audit log |

Definitions per the [2026 HITL/HOTL/HIC guidance](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/). **So what:** the agent-led shift *moves weight* in this table. A human-operated tool lives mostly in HITL. An agent-led, human-curated mesh lives mostly in **HIC** (set the lane and the schedule) **+ human-over-the-loop** (curate the output), with HITL reserved for the one irreversible step (publish). Don't ask "should there be a human?" — ask "*which posture* at *which point*?"

### 4.2 Levels of automation — oversight is a dial, not a switch
Sheridan & Verplank's [10 levels of automation](https://www.researchgate.net/figure/Levels-of-Automation-From-Sheridan-Verplank-1978_tbl1_235181550) (1978) run from "human does everything" → "computer acts and may not even inform the human." Levels 4–6 are the HITL band: *the system proposes, executes only on approval.* **So what:** each checkpoint can be tuned to a level independently, and the *same* checkpoint can sit at a different level for different task classes (auto-publish to a sandbox site = level 9; publish to a client's live site = level 5). The daily-preview loop is a concrete example: **initiation and authoring run autonomous (high level); the publish stays at level ~5.** This is the foundation of the "graduated autonomy" option in §8.

### 4.3 Calibrated trust & appropriate reliance — the core of Problem B
"Calibrated trust" = alignment between how much a human trusts the system and the system's *actual* capability; "appropriate reliance" = accepting correct advice and rejecting incorrect advice ([survey](https://dl.acm.org/doi/10.1145/3696449), [trust-calibration feedback](https://www.tandfonline.com/doi/full/10.1080/10447318.2025.2487861)). Two failure modes: **over-reliance** (automation bias — rubber-stamping a wrong score) and **under-reliance / algorithm aversion** (ignoring a correct one). The proven lever: **transparency about uncertainty and reasoning** improves calibration. **So what:** our Evidence panel + `mode`/`modeReason` are *exactly* the transparency mechanism the literature prescribes — but transparency alone is passive. Calibration improves most when the system **actively cues the human when their trust looks mis-set** (e.g., "this 91 was produced in `deterministic-fallback` — treat as coarse"). That's the score-adjudication gate (§6, C4) — and it's what keeps a daily curation queue from becoming a rubber-stamp line.

### 4.4 Automation bias is a *design* obligation, and HITL can make it worse
EU AI Act [Article 14](https://artificialintelligenceact.eu/article/14/) requires high-risk systems to let a human *understand capabilities/limits, stay aware of automation bias, interpret output, decide not to use, and **stop/override**.* But [research warns](https://arxiv.org/pdf/2502.10036) that a human "in the loop" who rubber-stamps is worse than no human — it launders machine output with false legitimacy (the "moral crumple zone"). **So what:** a promote-to-publish button that a tired operator clicks through a daily queue without reading is *theater*, and theater is a liability, not a control. Every gate we add must be designed against rubber-stamping (see §9).

### 4.5 Selective / risk-tiered oversight — spend human attention where it pays
The modern consensus is **not** "human reviews everything." It's **risk-based routing**: the agent handles low-risk/high-confidence cases autonomously and **escalates only uncertain, high-impact, or sensitive cases** ([Galileo](https://galileo.ai/blog/human-in-the-loop-agent-oversight), [tiered agentic oversight](https://arxiv.org/pdf/2506.12482)). Mechanisms: uncertainty-based escalation, "learning to defer," complexity-adaptive escalation. **So what:** we already emit the escalation signals — eval `confidence`, `mode`, fan-out **variance/stddev**, grade `critical`. Routing on them turns a daily queue of 1 draft or 10 drafts into a *triaged* queue — the human's eye goes to the suspect ones first. This is the difference between a usable daily habit and an annoying one.

### 4.6 Governance frameworks — what we'd map to if asked
- **NIST AI RMF** (Govern / Map / Measure / Manage) + its **Agentic Profile / AAGATE** runtime architecture ([CSA, Dec 2025](https://labs.cloudsecurityalliance.org/agentic/agentic-nist-ai-rmf-profile-v1/)) — HITL checkpoints are *Manage* controls; the policy plane is *Govern*; the Evidence/mode telemetry is *Measure*. NIST RMF 1.0 [structurally assumed a human decides](https://www.ispartnersllc.com/blog/nist-ai-rmf-2025-2026-updates-what-you-need-to-know-about-the-latest-framework-changes/); the Agentic Profile exists precisely because autonomous agents broke that assumption — which is exactly what the scheduler does here.
- **EU AI Act** risk tiers map directly onto an escalation policy (unacceptable / high / limited / minimal). Our content-publishing is *not* obviously "high-risk" under the Act — but the Art. 14 design checklist (understand, de-bias, interpret, stop) is a free, well-vetted spec for *any* oversight UI.
- **Meaningful Human Control** (tracking + tracing) — every consequential action should trace to a human reason and a human who can answer for it. That's our approval audit log.

**So what overall:** we don't need to "comply" with anything for a demo. But framing the design in this vocabulary makes the adaptTo() story *"governed, self-starting agentic content"* instead of *"cool autonomous demo"* — and the former is the differentiated, enterprise-credible narrative.

---

## 5. Risk → oversight map (the justification table)

Every checkpoint in §6 exists to mitigate a concrete risk. Here's the map first, so the catalogue reads as *answers*, not features. **R0 is new** — it's the risk the scheduler introduces.

| # | Risk (concrete to this mesh) | Class | Worst case | Best-fit posture | Checkpoint (§6) |
|---|---|---|---|---|---|
| **R0** | **Agent autonomously picks an off-lane / inappropriate / duplicate topic** | Init | Wasted daily run, off-brand draft | HIC editorial policy + preview-only + curation | **C0** topic, C6 |
| R1 | Publishing wrong/off-brand/legally-risky content to a **live** site | A | Public reputational/legal harm, hard to fully un-ring | **HITL** promote-to-publish | C3 |
| R2 | **Prompt injection** from scraped source / "latest off the internet" steering the agent's tool calls | A | Agent authors/links attacker-chosen content | HITL + policy (allowed sites/sources) | C3, C7 |
| R3 | Human **rubber-stamps a fabricated/degraded score** (visual=100, content=45) | B | Ships bad content *believing* it's good | Selective HITL + transparency | C4 |
| R4 | **Runaway cost / hung agent**, now on a *daily* cadence (Kimi turn ≤20min holding a browser permit; large fan-out × every day) | A | $ + stuck queue/permits, compounding | HOTL kill switch + HIC budget/schedule cap | C5, C7 |
| R5 | **Wrong target / wrong site / wrong backend** chosen at intake | A | Writes to the wrong owner/site | HIC policy + HITL on high-cost | C1 |
| R6 | **Off-strategy generation** — whole pipeline runs on a bad brief | A/B | Wasted run, wrong content shape | HITL brief sign-off (optional) | C2 |
| R7 | **Eval drift / mis-calibration over time** (the coarse Jaccard fallback, no labels) | B | Scores quietly stop meaning anything | Human-over-loop feedback | C6 |
| R8 | **No accountability** — who approved this publish, on what evidence? | A/B | Can't answer "why did we ship this?" | Audit log (MHC) | C6, C7 |
| R9 | **Unauthorized trigger** in a multi-user/cloud deploy | A | Anyone spends/publishes | HIC authz | C7 |

---

## 6. The surface — initiation + governance checkpoints (the OPTIONS catalogue)

The pipeline, annotated with insertion points. **The scheduler and C0 are the new front; C3 becomes "promote to publish."** Each checkpoint is a *candidate*; §8 bundles them into packages to choose from.

```
 [SCHEDULER]──▶ pick topic ──▶ intake ──▶ brief ──▶ author ──▶ preview ──▶ eval.run ──▶ variance ──▶ DRAFT QUEUE
 (daily cron)       │            │          │                     │           │                          │
  or human ─────────┘          [C0]        [C1]      [C2]                  [C3]         [C4]            [C6]
                              goal /       scope     brief               PROMOTE     adjudicate       curate /
                              topic pick   gate      gate              -to-PUBLISH     gate          feedback
                                                                          GATE
       └──────────────── [C5] monitor / intervene / kill (HOTL, spans the whole run) ──────────────────┘
       └──────────────── [C7] policy, authz & editorial standards (HIC, standing, out-of-band) ─────────┘
```

### C0 — Goal / topic selection · *HIC policy + (optional) selective HITL* ⭐ NEW
**Gates:** the most agentic decision in the whole vision — *what the mesh chooses to make today.* **Mitigates:** R0.
**Maps to:** the new initiation layer (§2.2) — the scheduler's topic-pick step that feeds `topic` into `content.brief`. The human's standing control is the **editorial lane** in C7 (allowed subjects/sources/sites); the agent proposes *within* that lane rather than from a blank page.
**Mode:** for the POC, **fully autonomous** — output is preview-only and reversible, so a bad topic costs a wasted draft, nothing more. Later, optionally surface "today's proposed topic" for a one-click human veto before tokens are spent.
**Friction:** none in the POC. **Recommendation:** *autonomous now, with the editorial-lane seam (C7) defined so it never wanders.* The cheapest governance for a self-chosen topic is that the only thing it can produce is a reversible preview.

### C1 — Intake / scope gate · *HIC + selective HITL*
**Gates:** the run before it starts — target `site`/`owner`, `backend` (Claude vs Kimi), `fanOut`, est. cost. **Mitigates:** R5, R4, R9.
**Maps to:** the coordinator trigger form / `coordinate.run` payload; `runs.user_email` (SSO) already records *who* for human-started runs. For agent-started runs, the *scheduler config* supplies these — and is itself a C7 policy artifact.
**Mode:** mostly policy (auto-allow within configured bounds); escalate to a human confirm only when out-of-bounds (fan-out > N, a non-allowlisted site, `backend:opencode` against a non-sandbox site).
**Friction:** very low if selective. **Recommendation:** *light, foundational.* Cheap insurance against dumb-but-expensive mistakes — and the place a *daily* schedule's per-run budget cap lives.

### C2 — Brief gate · *HITL (optional)*
**Gates:** the `content.brief` output before generation/migration spends tokens. **Mitigates:** R6 (and R1 upstream — cheaper to fix strategy than a published page).
**Maps to:** `content-gen` `content.brief` task → pause before downstream stages.
**Mode:** in-loop approval/edit of the outline.
**Friction:** medium; high *value for real content*, low value for synthetic/daily-demo loops. **Recommendation:** *optional / per-task-class.* Off for the daily POC (preview-only makes it cheap to be wrong); on for real-client content.

### C3 — Promote-to-publish gate · *HITL — THE chokepoint* ⭐
**Gates:** the irreversible `preview-publish` to the live site. The agent authors + previews autonomously (daily); **a human promotes the preview to an actual publish.** **Mitigates:** R1, R2 (primary).
**Maps to (3 implementation shapes):**
  1. **Split the skill** — migration authors to *preview only*, returns the preview URL + eval evidence; a separate `migration.publish` skill does the publish, gated. *(Cleanest; preview is already non-destructive; this is exactly the daily-loop cadence in §2.3.)*
  2. **A2A `input-required`** — `migration.run` transitions to `input-required` after preview and parks; the human responds via `message/send` (same taskId) to release the publish. *Protocol-native HITL* (A2A defines this state exactly for [multi-turn human-in-the-loop](https://a2a-protocol.org/latest/specification/)); the makecom backend's existing callback-waiter (`/callbacks/makecom/:taskId`) is the same parking pattern.
  3. **Re-arm the skill's confirmation gate** — flip `permission` off "allow" / stop pre-satisfying the confirmation in the opencode prompt, route the approval event to a human. *(Smallest diff; reuses a gate that already exists and was switched off.)*
**Mode:** in-loop, Sheridan level ~5 (system proposes a fully-previewed page, executes publish on approval).
**Friction:** the highest-value friction in the system — but only if it's not rubber-stamped (§9). **Recommendation:** ***CORE. The spine of the human-curated half.*** Default-on for live sites; auto for sandbox/dryrun. In the daily loop, this *is* the curation step.

### C4 — Score adjudication / eval-disagreement gate · *Selective HITL → HOTL* ⭐
**Gates:** acceptance of the eval verdict. **Mitigates:** R3 (the automation-bias risk the whole hardening sprint warned about, made sharper by daily volume).
**The escalation signal is already computed** — route to a human *only when the score doesn't deserve auto-trust*:
  - `mode === 'deterministic-fallback'` (agentic silently failed) → **escalate** (this is the content=45 case).
  - low `confidence`, or grade `critical`, or overall below a threshold → escalate.
  - **high fan-out variance** (`computeStats` stddev) — Claude and Kimi disagree by >X on the same page → escalate (the disagreement *is* the uncertainty signal; this is also the headline adaptTo() datapoint).
  - all-`agentic`, high-confidence, low-variance → **auto-accept** (no human).
**Maps to:** eval `mode`/`modeReason`/`confidence`, `computeStats` variance, the **Evidence panel** (already the transparency surface). Adds a "needs review" sort over the draft queue + accept/override/annotate.
**Mode:** selective in-loop; routine cases stay HOTL (visible, not gating).
**Friction:** low *because it's selective* — in a daily queue, the human's eye is routed to the suspect drafts first. **Recommendation:** ***CORE for Problem B.*** This is where calibrated-trust theory (§4.3) becomes a feature, and it's cheap because the signals exist. Cue the human about *why* a score is suspect, per the de-biasing research.

### C5 — Monitor / intervene / kill switch · *HOTL*
**Gates:** nothing by default — provides the **stop button** (Art. 14) over a running mesh. **Mitigates:** R4 (more important once runs fire unattended on a schedule).
**Maps to:** the live branch/stage grid (sprint doc 04) already streams in-flight state. **Gap:** `cancelTask` is *currently a no-op* (sprint doc 05) — a real kill needs queue-level + opencode-session cancellation. A button that doesn't stop work is dishonest UX.
**Mode:** on-the-loop, with a real abort.
**Friction:** none until used. **Recommendation:** *important; sequenced after real cancellation lands.* The monitoring half exists today; the "stop in a safe state" half is net-new work — and a daily autonomous cadence is the strongest argument for finishing it.

### C6 — Curation, post-hoc feedback & audit · *Human-over-the-loop* ⭐
**Gates:** nothing live — this is the **curation surface** and closes two loops after the fact. **Mitigates:** R0, R7 (eval drift), R8 (accountability).
**Three pieces:**
  - **The daily draft queue** — the human's primary touchpoint in the agent-led model: a list of today's previews with their eval evidence, where C3 (promote) and C4 (adjudicate) happen. This is what "human-curated" *is* in the UI.
  - **Calibration corpus** — a thumbs-up/down + reason on any eval report builds the *"labeled agentic runs"* that sprint doc 02 says are the prerequisite to replacing the coarse Jaccard content metric. Human curation becomes the eval's ground truth over time.
  - **Approval audit log** — every C3 promotion records who/when/on-what-evidence (Meaningful Human Control). `runs.user_email` is the seed; add an `approvals` table.
**Maps to:** store + Evidence panel + `store-mcp` (conversational read already exists). **Recommendation:** *high compounding value, light to start* (the queue view + a 2-button widget + one new table).

### C7 — Policy, authz & editorial standards plane · *HIC, standing*
**Gates:** the standing rules every other checkpoint reads — **including the schedule and the editorial lane (the C0 substrate).** **Mitigates:** R0, R5, R9, R4, R8.
**Holds:** the daily schedule + per-run budget cap, the **editorial lane** (allowed subjects/sources for the topic pick), who may trigger (SSO roles), allowed `site`/`owner` allowlist, fan-out caps, model allowlist, **per-task-class autonomy tier** (which checkpoints are active for "sandbox daily preview" vs "live client publish"), C4 thresholds.
**Maps to:** Auth.js SSO (`runs.user_email` exists), `.env`/Worker cron config today → a small `policy` table / config for the real version.
**Recommendation:** *foundational the moment there's a schedule, >1 user, or a real client site.* For the single-maintainer POC it can stay env/cron config; design the seam now.

### Where a human should ***NOT*** sit (explicit non-goals)
Per §4.4–4.5, adding humans has a cost (latency, alert fatigue, false legitimacy). Keep these autonomous:
- **The daily topic pick + authoring to preview** — the whole point of agent-led. Output is reversible; gating it defeats the proof of concept.
- **Synthetic/dryrun/sandbox loops** — no live side effect; gating them is pure friction and pure theater.
- **Per-tool-call approval inside an agentic turn** — the headless backend disables this *correctly*; 20 micro-approvals per migration is the rubber-stamp trap. Gate the *outcome* (publish), not every keystroke.
- **High-confidence, all-agentic, low-variance evals** — auto-accept; surfacing them for review trains operators to click "OK" reflexively, *destroying* the C4 signal.

---

## 7. The engagement layer — *how* a human is actually brought in (options)

Orthogonal to *where* (§6): once a checkpoint fires, how does the human get pulled in and respond? Pick one (or layer them).

| Option | Mechanism | Pros | Cons | Fit |
|---|---|---|---|---|
| **E1 — A2A `input-required`** | Task parks in `input-required`; human replies via `message/send`/dashboard, same `taskId` | Protocol-native; restart-survivable (task store rebuilds); already the idiom | Needs dashboard "pending approvals" reader + a resume path | **Recommended spine** — it's *the* A2A HITL state |
| **E2 — Dashboard draft queue** | Today's previews render as cards on the coordinator dashboard; promote/reject/annotate in-UI | Reuses the Evidence panel as the decision context; one place to curate | Pull model — human must check in | **The POC's curation UI**; pairs with E1 |
| **E3 — Push-to-channel** | Push-notification (A2A push config already implemented) → Slack/email "today's drafts / approve?" link | Async; human isn't chained to the dashboard; perfect for a *daily* digest | Needs a channel integration; link-back auth | Best for the daily-curation habit in real use |
| **E4 — Make.com human step** | The makecom backend's callback already round-trips; insert a Make.com approval module | Zero new mesh code; lives where the makecom path already pauses | Couples governance to Make.com; only the makecom backend | Quick win if makecom is the prod path |
| **E5 — Conversational (`store-mcp`)** | Human reviews/approves via Claude Desktop over the MCP store | Natural-language audit ("why did today's branch 2 fail?") | Read-only today; approval would need a write tool (careful) | Audit/feedback (C6), not live gating |

**So what:** the **A2A `input-required` state (E1) + the dashboard draft queue (E2)** is the lowest-new-surface-area spine — it reuses the task lifecycle, the push store, and the report read-path the platform *already has*. **E3 (a daily push digest of drafts) is the natural fit for the "review what the agent made today" habit** and the obvious second step. E4 is the cheapest if Make.com is the production migration path.

---

## 8. The autonomy policy model — the meta-decision (options)

This is the choice the others hang off: *by default, how much does the mesh do without a human?*

- **M1 — Always-HITL (manual-confirm everything consequential).** Simple, maximally safe, but invites rubber-stamping (§4.4), kills the "watch the mesh start and work" demo magic, and is flatly incompatible with a daily self-starting loop. *Not recommended* beyond the single publish gate.
- **M2 — Risk-tiered / confidence-gated (selective).** Autonomous on low-risk/high-confidence (initiate, pick a topic, author to preview); escalate on the signals in C1/C4 (out-of-bounds scope, degraded mode, high variance, low confidence); human curates + promotes. **The literature's consensus** (§4.5) and the best fit for our already-computed signals — and the natural home of the daily-preview POC. ***Recommended.***
- **M3 — Graduated / earned autonomy.** Start a task class at a low Sheridan level (HITL publish), and as it accumulates clean human promotions, *promote it* to a higher level (auto-publish to that site). Compelling and demo-able ("the system earns the right to publish on its own"), but needs the C6 track record first. ***Recommended as the v2 narrative*** layered on M2.

**Recommendation:** **M2 now, with the M3 story designed in.** M2 maps 1:1 onto signals we already emit; M3 is the differentiated adaptTo() framing ("agents that start their own work and *earn* the right to publish it") and only needs the approval log (C6) as its substrate.

---

## 9. Cross-cutting design principles (so the gates aren't theater)

These apply to *every* checkpoint and are non-negotiable if the goal is real governance and not the appearance of it:

1. **Decision-legible by default.** A gate must show the human *what they're approving and why it might be wrong* — the previewed page, the eval evidence, the `mode` badge, the variance. We already built this (Evidence panel); wire the gate *to* it. (Transparency-for-calibration, §4.3.)
2. **Anti-rubber-stamp.** Make the default action *inspect*, not *approve* — especially in a daily queue where momentum is the enemy. Surface failure modes prominently (a `deterministic-fallback` badge next to the score; the diff vs the source). Consider requiring a one-word reason on promotion of a *flagged* item (cheap friction exactly where automation bias is most dangerous).
3. **Reversibility-first.** Prefer preview over publish, soft-delete over delete, sandbox site over live. This is *the* enabling principle for agent-led initiation: the daily loop is safe precisely because everything it does on its own is reversible, and only a human turns a preview into a publish.
4. **Selective, not blanket.** Escalate on uncertainty/impact (§4.5). Every auto-approvable case you route to a human *devalues* the cases that genuinely need one.
5. **Always provide a stop.** Art. 14's "halt in a safe state." Even before C5's real cancel lands, a human must be able to *not promote* and *not accept* with one action — and to pause the daily schedule.
6. **Trace every consequential action to a human + a reason.** Meaningful Human Control. `runs.user_email` → an `approvals` row. This is also the M3 substrate and the answer to R8.
7. **Degrade safe, not silent.** The whole hardening sprint's lesson: when the agent can't measure, it must *say so loudly*, not fabricate. A governed mode should treat "eval was degraded" as an automatic escalation, never an auto-accept — and a self-starting loop must never publish on a degraded eval.

---

## 10. Three packaged options (the menu to narrow)

Bundles, smallest → largest. Each is a coherent, demo-able increment; later ones include earlier ones. **Package A is the proof of concept in §0.**

### Package A — **"The Daily Draft"** (the proof of concept, highest-ROI)
The initiation layer (§2) — **scheduler + a lightweight topic pick (C0) + author-to-preview-only** — plus **C3** (promote-to-publish) and **C6-lite** (the daily draft queue) via **E1+E2** (A2A `input-required` + a dashboard card per day's preview, showing the page & eval evidence).
- **Demonstrates:** the headline — *the mesh makes new content every day on its own, and a human promotes the good ones.* Solves R0, R1, R2 by construction (only reversible previews happen unattended).
- **Effort:** a Worker cron handler that POSTs `coordinate.run` + a dumb topic source (web pull or `list_dalive_content`) + split author/publish (or re-arm the skill gate) + a dashboard draft-queue reader + a resume/promote path.
- **Demo:** "Nobody touched this today. The mesh picked a topic, wrote the page, evaluated it, and is *asking to publish* — here's the preview and the evidence." Clean, credible, and genuinely agent-led.

### Package B — **"Governed Daily Loop"** (recommended target)
Package A **+ C4** (selective score adjudication) **+ C1** (out-of-bounds intake confirm) **+ C6-full** (calibration thumbs + approval log), under an **M2 risk-tiered policy** with the editorial lane in **C7**.
- **Solves:** R0–R6, R8 — initiation + both governance classes, end to end, *selectively* (humans curate only what matters).
- **Effort:** A + an escalation router on signals we already emit + a 2-button feedback widget + one `approvals` table + an editorial-lane config.
- **Demo:** the full "self-starting, governed content factory" story — initiates daily, escalates a degraded eval, a human curates and promotes the publish, and the promotion is logged. This is the differentiated adaptTo() narrative.

### Package C — **"Governance Plane"** (full vision)
Package B **+ C7-full** (policy/authz plane, multi-user) **+ C5-full** (real cancellation/kill) **+ C2** (brief gate for real content) **+ M3** (earned/graduated autonomy) **+ E3** (daily push digest to Slack/email).
- **Solves:** R0–R9, framed against NIST RMF / Art. 14.
- **Effort:** real cancellation, a policy model, channel integration, the promotion logic — a workstream, not a sprint.
- **Demo/positioning:** enterprise-credible self-starting governed autonomy; the "agents earn the right to publish" arc.

---

## 11. Recommendation & open decisions (to narrow next)

**My recommendation:** build **Package A ("The Daily Draft")** first as the proof of concept — it *is* the §0 thesis made real, and it's the highest ROI. Then grow into **Package B (Governed Daily Loop) under M2**, built spine-first on **A2A `input-required` (E1) + the dashboard draft queue (E2)**, with **C3 (promote-to-publish) and C4 (score adjudication) as the two load-bearing gates** — one per problem class. Design the **C7 editorial-lane seam and the M3 story** now even if not built, because they're the enterprise narrative.

**Open decisions for our next pass:**
1. **Topic source for C0** — "latest off the internet" (web/RSS pull), site-grounded gap pick (`list_dalive_content` + `get_dalive_content`), or both? Recommendation: start with the internet pull (most obviously "new every day"), add the site-grounded pick as a fast follow.
2. **Cadence & scope** — truly daily? Which site (sandbox vs the real `da-live-postal-2025-07`)? How many drafts per day (fan-out)? This sets the C1/C7 budget cap.
3. **Curation channel** — dashboard draft queue only (E1+E2) for the demo, or a daily push digest (E3) because the review happens away from the screen?
4. **Live vs sandbox default** — is the demo site disposable (could even auto-publish for the wow) or representative-of-a-client (publish gate essential)? Decides whether C3 is hard default-on.
5. **One human or many roles** — single maintainer (gates collapse to Jack) vs operator / brand-steward / approver / auditor (drives C7 + roles).
6. **Autonomy posture** — commit to M2 (selective) now, and do we *show* M3 (earned autonomy) as a roadmap slide or build a slice of it?
7. **Gate the brief (C2)?** — only worth it once we generate *real* (non-synthetic) content.

---

## 12. References (thought leadership consulted)

**Frameworks & regulation**
- [NIST AI RMF — Agentic AI Profile (Cloud Security Alliance, 2025)](https://labs.cloudsecurityalliance.org/agentic/agentic-nist-ai-rmf-profile-v1/)
- [NIST AI RMF 2025–2026 updates](https://www.ispartnersllc.com/blog/nist-ai-rmf-2025-2026-updates-what-you-need-to-know-about-the-latest-framework-changes/)
- [EU AI Act — Article 14, Human Oversight (official text)](https://artificialintelligenceact.eu/article/14/)
- [Automation Bias in the AI Act — de-biasing human oversight (arXiv 2025)](https://arxiv.org/pdf/2502.10036)
- [On the Quest for Effectiveness in Human Oversight (arXiv 2024)](https://arxiv.org/pdf/2404.04059)

**Oversight postures & autonomy levels**
- [Practicing Human-in-the-Loop — HITL/HOTL/HIC, 2026 guide (Strata)](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/)
- [Sheridan & Verplank, 10 Levels of Automation (1978)](https://www.researchgate.net/figure/Levels-of-Automation-From-Sheridan-Verplank-1978_tbl1_235181550)
- [Human-Centered AI: Reliable, Safe & Trustworthy — Shneiderman (arXiv)](https://arxiv.org/pdf/2002.04087)

**Calibrated trust, appropriate reliance, automation bias**
- [Fostering Appropriate Trust in Human-AI Interaction — systematic review (ACM, 2025)](https://dl.acm.org/doi/10.1145/3696449)
- [Calibrating Reliance on Automated Advice — transparency & trust-calibration feedback (2025)](https://www.tandfonline.com/doi/full/10.1080/10447318.2025.2487861)
- [Appropriate reliance on AI decision support — expertise, trust, self-confidence (2025)](https://www.tandfonline.com/doi/full/10.1080/12460125.2025.2593251)

**Selective / tiered oversight & escalation**
- [How to Build Human-in-the-Loop Oversight for AI Agents (Galileo)](https://galileo.ai/blog/human-in-the-loop-agent-oversight)
- [Tiered Agentic Oversight — hierarchical multi-agent safety (arXiv 2025)](https://arxiv.org/pdf/2506.12482)
- [Human-in-the-Loop Agentic AI for High-Stakes Oversight 2026 (OneReach)](https://onereach.ai/blog/human-in-the-loop-agentic-ai-systems/)

**Protocol & initiation mechanics**
- [A2A Protocol Specification — task states incl. `input-required` / `auth-required`](https://a2a-protocol.org/latest/specification/)
- [Cloudflare Workers — Cron Triggers (scheduled invocation)](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [HADA — Human-AI Agent Decision Alignment Architecture (arXiv 2025)](https://arxiv.org/pdf/2506.04253)

---

*Draft v0.2 — a menu, not a decision. The thesis (§0) is set: agent-led, human-curated, proof-of-concept daily content. Next pass: answer the §11 decisions and cut this to the chosen package (start with Package A).*
</content>
</invoke>
