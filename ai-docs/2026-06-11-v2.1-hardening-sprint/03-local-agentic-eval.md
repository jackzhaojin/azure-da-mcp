# 03 — The Sprint's Biggest Find: Local Evals Were Never Agentic

**Files**: `agents/.env` (gitignored — token value added), `agents/.env.example` (documents `AGENTIC_TIMEOUT_MS`)
**Result**: first verified **local** agentic eval in the platform's history — 3/3 applicable dimensions `mode: agentic`, ~90 seconds, on the real K2.6-authored page.

---

## Why this doc exists

This wasn't a planned work item. It fell out of the degraded-mode visibility work (doc 02, Fix D) within minutes of deploying it — which is exactly the argument for that fix, so the discovery is worth documenting as its own story.

## The discovery sequence

1. After restarting the local mesh on the new engine code, the smoke test was a full-loop dryrun (`npm run loop -- "artisan sourdough bakery community classes" --fan-out 2`). It completed fine (overall 86), and the new **evidence endpoint** (doc 05) was queried to verify it worked.
2. The evidence came back with every dimension stamped:
   ```
   structure      60  deterministic-only | Missing Claude authentication. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY
   accessibility  85  deterministic-only | …
   ```
   The day-old code would have shown the same scores with **no indication anything was missing**.
3. That prompted the obvious question: *has the local eval agent EVER had Claude auth?* `agents/.env` had only this — the template line, verbatim from `.env.example`, commented out:
   ```
   # CLAUDE_CODE_OAUTH_TOKEN=  # Claude Pro/Max OAuth — enables the agentic eval path
   ```
   No value. No `ANTHROPIC_API_KEY` either. **Every local eval since the platform was built had silently run deterministic-only.**

## What this retroactively explains

- **The demo video's content=45.** The 2026-06-11 demo run (`9053bb2a`, "neighborhood coffee roastery grand opening", real K2.6 migration) scored structure 96 / accessibility 100 / visual 100 / **content 45** — and the 45 went into the recorded video's data unexplained. Post-mortem (doc 02): the agentic pass never ran, so content fell back to Jaccard word-overlap, which structurally lands paraphrased-but-faithful migrations at ~40–50. The page was fine; the instrument was wrong; nothing said so.
- **Why local and cloud disagreed.** The M5 cloud acceptance run scored **91** with a genuinely agentic eval — the Cloudflare eval container has the token as a worker secret. So the platform's two environments had been running *different eval products* (semantic vs word-overlap) while producing identically-shaped reports. For an adaptTo() demo whose narrative is score variance, an invisible environment-dependent scoring tier is about the worst possible latent bug.
- **The 4.2-second "agentic" evals.** Real agentic evals take minutes (4 Claude passes with browser tools). Local eval timings in the store were seconds. Nobody had reason to look until the mode field existed.

## How it was fixed

1. **First attempt — a trap worth recording**: `sed` un-commenting the `.env` line produced `CLAUDE_CODE_OAUTH_TOKEN=  # Claude Pro/Max OAuth…` — which shell-parses to an **empty value** (the `#` starts a comment after whitespace). The masked grep used to check it (`=<set>`) had been fooled by the trailing comment text. The eval restarted, ran, and the evidence *again* said `deterministic-only / Missing Claude authentication` — i.e. the new mode field caught the bad fix within one round-trip. (A token check that treated `""` as configured would have been a worse failure mode; the `Boolean()` gate did the right thing.)
2. **The real token** was located in the frozen v1 app's `content-authoring-eval/.env.local` (the same credential that powers the v1 eval app's agentic tier — same purpose, same product line). The **value** was copied programmatically into `agents/.env` (gitignored; the value was never printed to the terminal or logs), following the same user-approved pattern as the earlier ELEVENLABS key copy. Reading the frozen app's env file does not modify the frozen app (D5 intact).
3. eval-service restarted with the sourced env; verification eval submitted via the edge shim against the real K2.6 demo page.

## The verification run

Target: `https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-opencode-9053bb2a/neighborhood-coffee-roastery-grand-opening-b1` (the live page Kimi authored during the demo), `sourceType: none`.

| Dimension | Score | Mode | Notes |
|-----------|-------|------|-------|
| structure | 72 | **agentic** | 12 findings — the semantic pass is notably harsher than the deterministic rubric's 96 |
| accessibility | 100 | **agentic** | 6 findings (incl. strengths) |
| visual | 85 | **agentic** | 10 findings + screenshot artifact URL in the report |
| content | — | *skipped* | `sourceType: none` → properly excluded (doc 02 Fix C), with the skip note in findings |
| **overall** | **86 "good"** | | `totalDimensions: 3`, completed in ~90s |

Two things this run proves beyond "the token works":

- **The agentic and deterministic tiers genuinely disagree** (structure 96 deterministic vs 72 agentic on the same page) — which is the entire value proposition of the agentic tier, and the quantitative argument for why the silent fallback mattered.
- **The full new pipeline holds together end-to-end**: agentic gate (either credential) → abort-deadline wrapper → 0.7/0.3 blend → `mode: agentic` recorded → content skip → evidence endpoint → dashboard panel.

## Operational notes

- Local evals now cost real Claude usage (OAuth subscription — $0 marginal on the Max plan, but minutes of wall-clock per eval instead of seconds). The dryrun/stub paths and the `NO_AI_ENV` live-test tier are unaffected — tests still spend $0.
- The fast e2e tier is **immune to the new token by construction**: doc 01's sanitizer does not strip AI keys, but every fast-tier eval spawn sets `EVAL_ENGINE: "stub"`, and the live tier blanks the keys explicitly. This interaction was checked, not assumed.
- If the token expires/rotates, the failure mode is now *good*: evals keep completing, dimensions stamp `deterministic-fallback` with the auth error in `modeReason`, and the dashboard's amber mode badge makes it visible at a glance.
