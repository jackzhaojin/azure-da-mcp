# Agent–Human Collaboration: A Governance & Human-in-the-Loop Proposal

**Status**: First-draft options, for narrowing. Not a decision record.
**Scope**: The v2.0 `agents/` A2A mesh (content-gen → migration → eval → coordinator), local + Cloudflare.
**Author**: Jack Jin (with Claude Code) · **Date**: 2026-06-14
**Companion to**: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../ai-docs/2026-06-08-a2a-platform-v2.0/) (as-built) and [`ai-docs/2026-06-11-v2.1-hardening-sprint/`](../ai-docs/2026-06-11-v2.1-hardening-sprint/) (eval honesty + observability).

> **⚠️ Author's abstract not yet captured.** The framing paste ("Pasted text #1 +3 lines") didn't reach the drafting session. §0 below is a placeholder — drop your abstract in and the rest of the doc should be re-aligned to it. Everything downstream is grounded in the actual mesh + current governance literature, so it stands on its own as a menu, but the *thesis* is yours to set.

---

## 0. The abstract (placeholder — to be filled by Jack)

> _Paste your 3-line abstract here. The working assumption I drafted against: **"This is an autonomous content factory that takes irreversible, public-facing actions (publishing to a live CMS) and emits quality verdicts humans will act on. Where should a human sit in that loop — and why — to govern risk and earn trust, without turning the mesh back into a manual tool?"**_

If that assumption is wrong, the two problem classes in §1 are the lever to re-aim.

---

## 1. Why human-in-the-loop *here* — two distinct problem classes

Most HITL writing treats "oversight" as one thing. In this mesh it is two, and they want different mechanisms. Naming them is the most useful thing this doc does.

### Problem class A — **Action governance** (the agent *does* something irreversible)
The migration agent **authors and publishes real pages to a live da.live site** (`migration-agent/src/backends/opencode.ts` drives Kimi K2.6 to `create → preview-publish` against `jackzhaojin/da-live-postal-2025-07`). This is the textbook agentic-AI risk: *agents take irrevocable actions at machine speed, chaining tool calls across systems* ([CSA / NIST Agentic Profile](https://labs.cloudsecurityalliance.org/agentic/agentic-nist-ai-rmf-profile-v1/)). A publish is outward-facing: once it's on the edge it can be cached, indexed, and seen. Action governance is about **gating consequential, hard-to-reverse actions** — publish, spend, downstream Make.com triggers, site/owner selection.

> Tellingly, the headless backend **deliberately removed** the one human gate that existed: `permission:"allow"` and *"the skill's confirmation gate is declared pre-satisfied in the prompt"* (v2.0 doc 05). The fastest path to a governed mode is re-introducing exactly that gate — on purpose, where it belongs.

### Problem class B — **Verdict governance** (the human *trusts* what the agent reports)
The eval agent emits a **quality score a human will act on** ("ship / don't ship", "Claude vs Kimi"). The entire v2.1 hardening sprint was a case study in why this is dangerous: a dead URL scored **visual = 100**; a faithful migration scored **content = 45** from word-overlap while the agentic tier had silently never run (sprint docs 02–03). The risk here isn't a bad action — it's **automation bias**: a human "overly and unjustifiably trusting the suggestions of an automated system" ([EU AI Act Art. 14 analysis](https://arxiv.org/pdf/2502.10036)). Verdict governance is about **keeping the human's trust *calibrated* to what the score actually measured.**

The hardening sprint already built the raw material for class B — `mode: agentic | deterministic-only | deterministic-fallback`, the Evidence panel, variance stats. What's missing is *routing a human's attention to the scores that don't deserve trust.* That's a HITL design question, not just a UI one.

**These two classes recur as the spine of every option below.** A checkpoint is worth adding only if it meaningfully serves A, B, or both.

---

## 2. Conceptual foundations (the science, compressed — with "so what for us")

### 2.1 The oversight taxonomy — four postures, not one
| Posture | Definition | In our mesh |
|---|---|---|
| **Human-in-the-loop (HITL)** | Human must approve/authorize *before* the system acts | Pre-publish approval; brief sign-off |
| **Human-on-the-loop (HOTL)** | Human monitors a running/autonomous system and *can* intervene/override | Watch the live branch grid; kill a hung run; override a score |
| **Human-in-command (HIC)** | Human sets policy and decides *when/whether* to engage the AI at all | Allowed sites, budgets, model allowlist, autonomy tiers |
| **Human-over-the-loop** | Human reviews *after the fact*, audits, and feeds corrections back | Label eval reports → calibration corpus; approval audit log |

Definitions per the [2026 HITL/HOTL/HIC guidance](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/). **So what:** don't ask "should there be a human?" — ask "*which posture* at *which point*?" Most of our value is HITL at one chokepoint (publish) + HOTL/selective everywhere else.

### 2.2 Levels of automation — oversight is a dial, not a switch
Sheridan & Verplank's [10 levels of automation](https://www.researchgate.net/figure/Levels-of-Automation-From-Sheridan-Verplank-1978_tbl1_235181550) (1978) run from "human does everything" → "computer acts and may not even inform the human." Levels 4–6 are the HITL band: *the system proposes, executes only on approval.* **So what:** each checkpoint can be tuned to a level independently, and the *same* checkpoint can sit at a different level for different task classes (auto-publish to a sandbox site = level 9; publish to a client's live site = level 5). This is the foundation of the "graduated autonomy" option in §6.

### 2.3 Calibrated trust & appropriate reliance — the core of Problem B
"Calibrated trust" = alignment between how much a human trusts the system and the system's *actual* capability; "appropriate reliance" = accepting correct advice and rejecting incorrect advice ([survey](https://dl.acm.org/doi/10.1145/3696449), [trust-calibration feedback](https://www.tandfonline.com/doi/full/10.1080/10447318.2025.2487861)). Two failure modes: **over-reliance** (automation bias — rubber-stamping a wrong score) and **under-reliance / algorithm aversion** (ignoring a correct one). The proven lever: **transparency about uncertainty and reasoning** improves calibration. **So what:** our Evidence panel + `mode`/`modeReason` are *exactly* the transparency mechanism the literature prescribes — but transparency alone is passive. Calibration improves most when the system **actively cues the human when their trust looks mis-set** (e.g., "this 91 was produced in `deterministic-fallback` — treat as coarse"). That's the score-adjudication gate (§4, checkpoint 4).

### 2.4 Automation bias is a *design* obligation, and HITL can make it worse
EU AI Act [Article 14](https://artificialintelligenceact.eu/article/14/) requires high-risk systems to let a human *understand capabilities/limits, stay aware of automation bias, interpret output, decide not to use, and **stop/override**.* But [research warns](https://arxiv.org/pdf/2502.10036) that a human "in the loop" who rubber-stamps is worse than no human — it launders machine output with false legitimacy (the "moral crumple zone"). **So what:** a publish-approval button that a tired operator clicks 50×/day without reading is *theater*, and theater is a liability, not a control. Every gate we add must be designed against rubber-stamping (see §7).

### 2.5 Selective / risk-tiered oversight — spend human attention where it pays
The modern consensus is **not** "human reviews everything." It's **risk-based routing**: the agent handles low-risk/high-confidence cases autonomously and **escalates only uncertain, high-impact, or sensitive cases** ([Galileo](https://galileo.ai/blog/human-in-the-loop-agent-oversight), [tiered agentic oversight](https://arxiv.org/pdf/2506.12482)). Mechanisms: uncertainty-based escalation, "learning to defer," complexity-adaptive escalation. **So what:** we already emit the escalation signals — eval `confidence`, `mode`, fan-out **variance/stddev**, grade `critical`. Routing on them turns a blanket gate into a smart one and is the difference between a usable system and an annoying one.

### 2.6 Governance frameworks — what we'd map to if asked
- **NIST AI RMF** (Govern / Map / Measure / Manage) + its **Agentic Profile / AAGATE** runtime architecture ([CSA, Dec 2025](https://labs.cloudsecurityalliance.org/agentic/agentic-nist-ai-rmf-profile-v1/)) — HITL checkpoints are *Manage* controls; the policy plane is *Govern*; the Evidence/mode telemetry is *Measure*. NIST RMF 1.0 [structurally assumed a human decides](https://www.ispartnersllc.com/blog/nist-ai-rmf-2025-2026-updates-what-you-need-to-know-about-the-latest-framework-changes/); the Agentic Profile exists precisely because autonomous agents broke that assumption.
- **EU AI Act** risk tiers map directly onto an escalation policy (unacceptable / high / limited / minimal). Our content-publishing is *not* obviously "high-risk" under the Act — but the Art. 14 design checklist (understand, de-bias, interpret, stop) is a free, well-vetted spec for *any* oversight UI.
- **Meaningful Human Control** (tracking + tracing) — every consequential action should trace to a human reason and a human who can answer for it. That's our approval audit log.

**So what overall:** we don't need to "comply" with anything for a demo. But framing the design in this vocabulary makes the adaptTo() story *"governed agentic content"* instead of *"cool autonomous demo"* — and the former is the differentiated, enterprise-credible narrative.

---

## 3. Risk → oversight map (the justification table)

Every checkpoint in §4 exists to mitigate a concrete risk. Here's the map first, so the catalogue reads as *answers*, not features.

| # | Risk (concrete to this mesh) | Class | Worst case | Best-fit posture | Checkpoint (§4) |
|---|---|---|---|---|---|
| R1 | Publishing wrong/off-brand/legally-risky content to a **live** site | A | Public reputational/legal harm, hard to fully un-ring | **HITL** approval | C3 pre-publish |
| R2 | **Prompt injection** from scraped source content steering the migration agent's tool calls | A | Agent authors/links attacker-chosen content | HITL + policy (allowed sites) | C3, C7 |
| R3 | Human **rubber-stamps a fabricated/degraded score** (visual=100, content=45) | B | Ships bad content *believing* it's good | Selective HITL + transparency | C4 adjudication |
| R4 | **Runaway cost / hung agent** (Kimi turn ≤20min holding a browser permit; large fan-out) | A | $ + stuck queue/permits | HOTL kill switch + HIC budget | C5, C7 |
| R5 | **Wrong target / wrong site / wrong backend** chosen at intake | A | Writes to the wrong owner/site | HIC policy + HITL on high-cost | C1 intake |
| R6 | **Off-strategy generation** — whole pipeline runs on a bad brief | A/B | Wasted run, wrong content shape | HITL brief sign-off | C2 brief |
| R7 | **Eval drift / mis-calibration over time** (the coarse Jaccard fallback, no labels) | B | Scores quietly stop meaning anything | Human-over-loop feedback | C6 feedback |
| R8 | **No accountability** — who approved this publish, on what evidence? | A/B | Can't answer "why did we ship this?" | Audit log (MHC) | C6, C7 |
| R9 | **Unauthorized trigger** in a multi-user/cloud deploy | A | Anyone spends/publishes | HIC authz | C7 policy |

---

## 4. The governance surface — candidate checkpoints (the OPTIONS catalogue)

The pipeline, annotated with insertion points. Each checkpoint is a *candidate*; §8 bundles them into packages to choose from.

```
   intake ──▶ content.brief ──▶ synthesize/author ──▶ preview ──▶ PUBLISH ──▶ eval.run ──▶ variance ──▶ accept
     │             │                                                 │            │                       │
    [C1]          [C2]                                              [C3]         [C4]                    [C6]
   scope         brief                                          pre-publish   adjudicate              feedback
   gate          gate                                             GATE          gate                   loop
        └────────────────────────── [C5] monitor / intervene / kill (HOTL, spans the whole run) ──────────────┘
        └────────────────────────── [C7] policy & authz plane (HIC, standing, out-of-band) ──────────────────┘
```

### C1 — Intake / scope gate · *HIC + selective HITL*
**Gates:** the run before it starts — goal, target `site`/`owner`, `backend` (Claude vs Kimi), `fanOut`, est. cost. **Mitigates:** R5, R4, R9.
**Maps to:** the coordinator trigger form / `coordinate.run` payload; `runs.user_email` (SSO) already records *who*.
**Mode:** mostly policy (auto-allow within configured bounds); escalate to a human confirm only when out-of-bounds (e.g. fan-out > N, a not-allowlisted site, `backend:opencode` against a non-sandbox site).
**Friction:** very low if selective. **Recommendation:** *light, foundational.* Cheap insurance against the dumb-but-expensive mistakes.

### C2 — Brief gate · *HITL (optional)*
**Gates:** the `content.brief` output before generation/migration spends tokens. **Mitigates:** R6 (and R1 upstream — cheaper to fix strategy than a published page).
**Maps to:** `content-gen` `content.brief` task → pause before downstream stages.
**Mode:** in-loop approval/edit of the outline.
**Friction:** medium; high *value for real content*, low value for synthetic demo sources. **Recommendation:** *optional / per-task-class.* Turn on for real-client content, off for synthetic loops.

### C3 — Pre-publish gate · *HITL — THE chokepoint* ⭐
**Gates:** the irreversible `preview-publish` to the live site. The agent authors + previews autonomously; **a human approves the actual publish.** **Mitigates:** R1, R2 (primary).
**Maps to (3 implementation shapes):**
  1. **Split the skill** — migration authors to *preview only*, returns the preview URL + eval evidence; a separate `migration.publish` skill does the publish, gated. *(Cleanest; preview is already non-destructive.)*
  2. **A2A `input-required`** — `migration.run` transitions to `input-required` after preview and parks; the human responds via `message/send` (same taskId) to release the publish. *Protocol-native HITL* (A2A defines this state exactly for [multi-turn human-in-the-loop](https://a2a-protocol.org/latest/specification/)); the makecom backend's existing callback-waiter (`/callbacks/makecom/:taskId`) is the same parking pattern.
  3. **Re-arm the skill's confirmation gate** — flip `permission` off "allow" / stop pre-satisfying the confirmation in the opencode prompt, route the approval event to a human. *(Smallest diff; reuses a gate that already exists and was switched off.)*
**Mode:** in-loop, Sheridan level ~5 (system proposes a fully-previewed page, executes publish on approval).
**Friction:** the highest-value friction in the system — but only if it's not rubber-stamped (§7). **Recommendation:** ***CORE. The spine of any governed mode.*** Default-on for live sites; auto for sandbox/dryrun.

### C4 — Score adjudication / eval-disagreement gate · *Selective HITL → HOTL* ⭐
**Gates:** acceptance of the eval verdict. **Mitigates:** R3 (the automation-bias risk the whole hardening sprint warned about).
**The escalation signal is already computed** — route to a human *only when the score doesn't deserve auto-trust*:
  - `mode === 'deterministic-fallback'` (agentic silently failed) → **escalate** (this is the content=45 case).
  - low `confidence`, or grade `critical`, or overall below a threshold → escalate.
  - **high fan-out variance** (`computeStats` stddev) — Claude and Kimi disagree by >X on the same page → escalate (the disagreement *is* the uncertainty signal; this is also the headline adaptTo() datapoint).
  - all-`agentic`, high-confidence, low-variance → **auto-accept** (no human).
**Maps to:** eval `mode`/`modeReason`/`confidence`, `computeStats` variance, the **Evidence panel** (already the transparency surface). Adds a "needs review" queue + accept/override/annotate.
**Mode:** selective in-loop; routine cases stay HOTL (visible, not gating).
**Friction:** low *because it's selective* — humans see only the suspicious scores. **Recommendation:** ***CORE for Problem B.*** This is where calibrated-trust theory (§2.3) becomes a feature, and it's cheap because the signals exist. Cue the human about *why* a score is suspect, per the de-biasing research.

### C5 — Monitor / intervene / kill switch · *HOTL*
**Gates:** nothing by default — provides the **stop button** (Art. 14) over a running mesh. **Mitigates:** R4.
**Maps to:** the live branch/stage grid (sprint doc 04) already streams in-flight state. **Gap:** `cancelTask` is *currently a no-op* (sprint doc 05) — a real kill needs queue-level + opencode-session cancellation. A button that doesn't stop work is dishonest UX (their words).
**Mode:** on-the-loop, with a real abort.
**Friction:** none until used. **Recommendation:** *important; sequenced after real cancellation lands.* The monitoring half exists today; the "stop in a safe state" half is net-new work.

### C6 — Post-hoc feedback & audit · *Human-over-the-loop*
**Gates:** nothing live — closes two loops after the fact. **Mitigates:** R7 (eval drift), R8 (accountability).
**Two pieces:**
  - **Calibration corpus** — a thumbs-up/down + reason on any eval report builds the *"labeled agentic runs"* that sprint doc 02 explicitly says are the prerequisite to replacing the coarse Jaccard content metric. Human judgment becomes the eval's ground truth over time.
  - **Approval audit log** — every C3 publish-approval records who/when/on-what-evidence (Meaningful Human Control). `runs.user_email` is the seed; add an `approvals` table.
**Maps to:** store + Evidence panel + `store-mcp` (conversational read already exists). **Recommendation:** *high compounding value, light to start* (a 2-button widget on the report + one new table).

### C7 — Policy & authz plane · *HIC, standing*
**Gates:** the standing rules every other checkpoint reads. **Mitigates:** R5, R9, R4, R8.
**Holds:** who may trigger (SSO roles), allowed `site`/`owner` allowlist, budget/fan-out caps, model allowlist, **per-task-class autonomy tier** (which checkpoints are active for "sandbox dryrun" vs "live client publish"), C4 thresholds.
**Maps to:** Auth.js SSO (`runs.user_email` exists), `.env` today → a small `policy` table / config for the real version.
**Recommendation:** *foundational the moment there's >1 user or a real client site.* For single-maintainer demo it can stay env-config; design the seam now.

### Where a human should ***NOT*** sit (explicit non-goals)
Per §2.4–2.5, adding humans has a cost (latency, alert fatigue, false legitimacy). Keep these autonomous:
- **Synthetic/dryrun loops** — no live side effect; gating them is pure friction and pure theater.
- **Per-tool-call approval inside an agentic turn** — the headless backend disables this *correctly*; 20 micro-approvals per migration is the rubber-stamp trap. Gate the *outcome* (publish), not every keystroke.
- **High-confidence, all-agentic, low-variance evals** — auto-accept; surfacing them for review trains operators to click "OK" reflexively, *destroying* the C4 signal.

---

## 5. The engagement layer — *how* a human is actually brought in (options)

Orthogonal to *where* (§4): once a checkpoint fires, how does the human get pulled in and respond? Pick one (or layer them).

| Option | Mechanism | Pros | Cons | Fit |
|---|---|---|---|---|
| **E1 — A2A `input-required`** | Task parks in `input-required`; human replies via `message/send`/dashboard, same `taskId` | Protocol-native; restart-survivable (task store rebuilds); already the idiom | Needs dashboard "pending approvals" reader + a resume path | **Recommended spine** — it's *the* A2A HITL state |
| **E2 — Dashboard approval queue** | Pending gates render as cards on the coordinator dashboard; approve/reject/annotate in-UI | Reuses the Evidence panel as the decision context; one place to look | Pull model — human must be watching | Pairs with E1 as the UI |
| **E3 — Push-to-channel** | Push-notification (A2A push config already implemented) → Slack/email "approve?" link | Async; human isn't chained to the dashboard; good for slow gates | Needs a channel integration; link-back auth | Best for C3 in real use |
| **E4 — Make.com human step** | The makecom backend's callback already round-trips; insert a Make.com approval module | Zero new mesh code; lives where the makecom path already pauses | Couples governance to Make.com; only the makecom backend | Quick win if makecom is the prod path |
| **E5 — Conversational (`store-mcp`)** | Human reviews/approves via Claude Desktop over the MCP store | Natural-language audit ("why did branch 2 fail?") | Read-only today; approval would need a write tool (careful) | Audit/feedback (C6), not live gating |

**So what:** the **A2A `input-required` state (E1) + the existing dashboard/Evidence panel (E2)** is the lowest-new-surface-area spine — it reuses the task lifecycle, the push store, and the report read-path the platform *already has*. E3 (push to Slack/email) is the natural second step for real-world async approval. E4 is the cheapest if Make.com is the production migration path.

---

## 6. The autonomy policy model — the meta-decision (options)

This is the choice the others hang off: *by default, how much does the mesh do without a human?*

- **M1 — Always-HITL (manual-confirm everything consequential).** Simple, maximally safe, but invites rubber-stamping (§2.4) and kills the "watch the mesh work" demo magic. *Not recommended* beyond the single publish gate.
- **M2 — Risk-tiered / confidence-gated (selective).** Autonomous on low-risk/high-confidence; escalate on the signals in C1/C4 (out-of-bounds scope, degraded mode, high variance, low confidence). **The literature's consensus** (§2.5) and the best fit for our already-computed signals. ***Recommended.***
- **M3 — Graduated / earned autonomy.** Start a task class at a low Sheridan level (HITL publish), and as it accumulates clean human approvals, *promote* it to a higher level (auto-publish to that site). Compelling and demo-able ("the system earns trust"), but needs the C6 track record first. ***Recommended as the v2 narrative*** layered on M2.

**Recommendation:** **M2 now, with the M3 story designed in.** M2 maps 1:1 onto signals we already emit; M3 is the differentiated adaptTo() framing ("governed agents that earn autonomy") and only needs the approval log (C6) as its substrate.

---

## 7. Cross-cutting design principles (so the gates aren't theater)

These apply to *every* checkpoint and are non-negotiable if the goal is real governance and not the appearance of it:

1. **Decision-legible by default.** A gate must show the human *what they're approving and why it might be wrong* — the previewed page, the eval evidence, the `mode` badge, the variance. We already built this (Evidence panel); wire the gate *to* it. (Transparency-for-calibration, §2.3.)
2. **Anti-rubber-stamp.** Make the default action *inspect*, not *approve*. Surface the failure modes prominently (a `deterministic-fallback` badge next to the score; the diff vs the source). Consider requiring a one-word reason on approval of a *flagged* item (cheap friction exactly where automation bias is most dangerous).
3. **Reversibility-first.** Prefer preview over publish, soft-delete over delete, sandbox site over live. The cheapest governance is making the action reversible so the gate matters less.
4. **Selective, not blanket.** Escalate on uncertainty/impact (§2.5). Every auto-approvable case you route to a human *devalues* the cases that genuinely need one.
5. **Always provide a stop.** Art. 14's "halt in a safe state." Even before C5's real cancel lands, a human must be able to *not publish* and *not accept* with one action.
6. **Trace every consequential action to a human + a reason.** Meaningful Human Control. `runs.user_email` → an `approvals` row. This is also the M3 substrate and the answer to R8.
7. **Degrade safe, not silent.** The whole hardening sprint's lesson: when the agent can't measure, it must *say so loudly*, not fabricate. A governed mode should treat "eval was degraded" as an automatic escalation, never an auto-accept.

---

## 8. Three packaged options (the menu to narrow)

Bundles, smallest → largest. Each is a coherent, demo-able increment; later ones include earlier ones.

### Package A — **"The Publish Gate"** (minimal, highest-ROI)
Just **C3** (pre-publish HITL) + **C5-lite** (a real "don't publish" stop) via **E1+E2** (A2A `input-required` + a dashboard approval card showing the preview & evidence).
- **Solves:** R1, R2 — the irreversible-action risk, the single most important one.
- **Effort:** split author/publish (or re-arm the skill gate) + a dashboard "pending approvals" reader + a resume path.
- **Demo:** "the agent authored this page and is *asking permission* to publish — here's the preview and the eval evidence." Clean, credible, ~1 new surface.

### Package B — **"Governed Loop"** (recommended target)
Package A **+ C4** (selective score adjudication) **+ C1** (out-of-bounds intake confirm) **+ C6-lite** (thumbs + approval log), under an **M2 risk-tiered policy**.
- **Solves:** R1–R6, R8 — both problem classes, end to end, *selectively* (humans see only what matters).
- **Effort:** A + an escalation router on signals we already emit + a 2-button feedback widget + one `approvals` table.
- **Demo:** the full "governed agentic content factory" story — autonomous when confident, escalates a degraded eval, a human approves the publish, and the approval is logged. This is the differentiated adaptTo() narrative.

### Package C — **"Governance Plane"** (full vision)
Package B **+ C7** (policy/authz plane, multi-user) **+ C5-full** (real cancellation/kill) **+ C2** (brief gate for real content) **+ M3** (earned/graduated autonomy) **+ E3** (push-to-Slack/email approvals).
- **Solves:** R1–R9, framed against NIST RMF / Art. 14.
- **Effort:** real cancellation, a policy model, channel integration, the promotion logic — a workstream, not a sprint.
- **Demo/positioning:** enterprise-credible governed autonomy; the "agents earn trust over time" arc.

---

## 9. Recommendation & open decisions (to narrow next)

**My recommendation:** target **Package B (Governed Loop) under M2**, built spine-first on **A2A `input-required` (E1) + the existing dashboard/Evidence panel (E2)**, with **C3 (publish) and C4 (score adjudication) as the two load-bearing gates** — one per problem class. Ship **Package A first** as a standalone increment; it's the highest ROI and de-risks the rest. Design the **C7 seam and M3 story** now even if not built, because they're the enterprise narrative.

**Open decisions for our next pass (these need *your* call, not a default):**
1. **The abstract** — §0. What's the actual thesis? It may re-weight A vs B.
2. **Audience/use** — is this primarily an **adaptTo() demo** (optimize for narrative + wow), a path toward a **real product** (optimize for the governance plane), or both?
3. **Live vs sandbox default** — is the demo site disposable (auto-publish fine) or representative-of-a-client (publish gate essential)? Decides whether C3 is default-on.
4. **One human or many roles** — single maintainer (gates collapse to Jack) vs operator / brand-steward / approver / auditor (drives C7 + roles). 
5. **Engagement channel** — dashboard-only (E1+E2) for the demo, or async push (E3 / E4-Make.com) because approvals happen away from the screen?
6. **Autonomy posture** — commit to M2 (selective) now, and do we *show* M3 (earned autonomy) as a roadmap slide or build a slice of it?
7. **Gate the brief (C2)?** — only worth it once we generate *real* (non-synthetic) content.

---

## 10. References (thought leadership consulted)

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

**Protocol mechanics**
- [A2A Protocol Specification — task states incl. `input-required` / `auth-required`](https://a2a-protocol.org/latest/specification/)
- [HADA — Human-AI Agent Decision Alignment Architecture (arXiv 2025)](https://arxiv.org/pdf/2506.04253)

---

*Draft v0.1 — a menu, not a decision. Next pass: drop in the abstract (§0), answer the §9 decisions, and cut this to the chosen package.*
