# v2.1 Hardening Sprint — Local Quality, Honesty, and Observability (as-built)

**Date**: 2026-06-11
**Status**: **COMPLETE locally** — typecheck clean, fast e2e **49/49**, live e2e **14/14** (1 pre-existing creds-skip), local mesh restarted on the new code, UI visually verified via Playwright. **Not yet deployed to Cloudflare** (see "Cloud follow-ups" below) and **not yet committed/tagged** at the time of writing.
**Author**: Jack Jin (with Claude Code)
**Companion to**: the v2.0 build report at [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../2026-06-08-a2a-platform-v2.0/). v2.0 proved the mesh works end-to-end (M1–M5, deployed 2026-06-10, tagged `v2.0.0` 2026-06-11). This sprint is the first **post-MVP quality pass**: same architecture, sturdier product.

---

## Why a hardening sprint (the brief)

v2.0.0 shipped, the demo video recorded, the closed loop ran for real on Cloudflare with Kimi K2.6 authoring a live da.live page. The MVP works. The directive for this sprint (paraphrasing the goal): *iterate and test locally for adaptTo(), harden as much as possible, make the eval agent work really well, make the coordinator UI/UX stronger and more professional, keep maintaining meaningful tests (no unit-test theater), and add wow factor — the system is decoupled, so improve parts independently.*

The sprint was **self-directed**: two exploration agents surveyed the eval service and the coordinator dashboard, ranked the highest-impact gaps, and the work queue came from those surveys plus one failure found organically in the first five minutes (the test-harness env leak). Every change landed with a real test (spawned servers, real browsers, no mocks) and the whole suite ran green before and after.

## The one-line story

> **The MVP was honest about what worked but silent about what didn't.** This sprint made every silent failure loud, visible, and diagnosable — in the scores, in the store, and on the dashboard — and in doing so discovered that the flagship agentic eval tier had *never actually run locally*.

## Executive summary — the eight improvements

| # | Improvement | Area | The headline |
|---|-------------|------|--------------|
| 1 | [Env-proof e2e harness](./01-test-harness-env-proofing.md) | `e2e/` | Sourcing `.env` used to break **28/46** fast tests; `startAgent` now sanitizes spawned-agent env. 49/49 pass bare *or* sourced. |
| 2 | [Visual false-100s killed](./02-eval-scoring-honesty.md) | eval engine | A dead URL scored **visual=100** from a size-0 placeholder screenshot; mismatched page heights silently skipped comparison and scored 100. Both now fail or penalize honestly. |
| 3 | [Content skip semantics](./02-eval-scoring-honesty.md) | eval engine | `sourceType: none` counted content as **0 at 25% weight** (dragging perfect pages to ~66). Now the dimension is excluded and weights renormalize. |
| 4 | [Degraded-mode visibility](./02-eval-scoring-honesty.md) | eval engine | Bare `catch {}` blocks swallowed every agentic failure. Every dimension now records `mode: agentic \| deterministic-only \| deterministic-fallback` + reason, the gate accepts `ANTHROPIC_API_KEY`, and agentic passes have a real timeout. |
| 5 | [Local agentic eval enabled](./03-local-agentic-eval.md) | eval env | **The sprint's biggest find**: the local eval agent had *never* run its agentic tier — the demo's mysterious content=45 explained. First verified local agentic eval: 3/3 dimensions `mode: agentic`. |
| 6 | [Run failure reasons](./04-coordinator-live-runs-and-failure-reasons.md) | coordinator | A failed run was a bare red badge. New `runs.error` column persists *why* (executor catch + restart policy), surfaced as an error card. |
| 7 | [Live branch/stage progress](./04-coordinator-live-runs-and-failure-reasons.md) | coordinator + UI | `branchResults` only existed after completion; while running, the UI was a text feed. New `runs.live` snapshots render the animated branch/stage grid **during** the run. |
| 8 | [Evidence panel + dashboard UX](./05-dashboard-evidence-and-ux.md) | dashboard | The rich eval report (findings, modes, screenshots) was persisted but had **zero readers**. New per-branch Evidence panel makes any score diagnosable from the UI. Plus: run-again, mesh-down warnings, no false trigger failures, local timestamps, skeletons, empty states. |

## Document map

| File | Covers |
|------|--------|
| [`01-test-harness-env-proofing.md`](./01-test-harness-env-proofing.md) | The 28/46 failure, why "run it bare" was a footgun not a feature, the `SANITIZED_ENV_VARS` design, the env-conditional test that had to die, the verification matrix |
| [`02-eval-scoring-honesty.md`](./02-eval-scoring-honesty.md) | All four engine fixes: visual false-100s, content skip, degraded-mode recording, the agentic gate + timeout — with the forensic trail that motivated each |
| [`03-local-agentic-eval.md`](./03-local-agentic-eval.md) | The discovery that local evals were never agentic, the content=45 post-mortem, how the token was enabled, the verification run |
| [`04-coordinator-live-runs-and-failure-reasons.md`](./04-coordinator-live-runs-and-failure-reasons.md) | Migration `0005`, the `onUpdate` snapshot pipeline, restart-policy reasons, the new fast-tier suite |
| [`05-dashboard-evidence-and-ux.md`](./05-dashboard-evidence-and-ux.md) | The evidence read path (`/store/evidence/:taskId` → A2A `tasks/get`), the EvidencePanel component, and the seven smaller UX fixes |

## Verification (the whole sprint, end to end)

- **Typecheck**: `npm run typecheck` (root + eval-service tsconfigs) — clean
- **Fast tier**: `npm run test:e2e` — **49/49** (was 46; +1 token-gated store-reads test, +2 coordinator live/error tests), passing **both** bare and with `.env` sourced
- **Live tier**: `npm run test:live` — **14/14** + 1 pre-existing R2-creds skip; includes the new 3-test `eval-quality.live.test.ts` over real Chromium
- **Next build**: `next build` on the coordinator (the Next side's type gate) — clean
- **Manual smoke on the running mesh**: full-loop dryrun ×2 branches (overall 86, conf μ 88.5), one real agentic eval of the K2.6-authored coffee-roastery page (overall 86 "good", structure 72 / accessibility 100 / visual 85, all `mode: agentic`)
- **Visual verification**: Playwright screenshots of the dashboard and the expanded Evidence panel on an SSO-off coordinator instance (`:14300`, same store)

## Cloud follow-ups (deliberately NOT done in this sprint)

This was a **local-first** sprint by design. Before the next Cloudflare deploy:

1. **Apply migration `0005_runs_failure_live.sql` to D1** (`wrangler d1 execute a2a-agents --remote --file=...`) — local SQLite migrated itself on boot; D1 has no `_migrations` runner.
2. **Redeploy the containers** so the cloud mesh picks up the new engine + coordinator code (`wrangler deploy` from `agents/deploy/`).
3. The cloud eval container already has Claude auth as a secret (the M5 score-91 run was agentic) — no env change needed there.

## Housekeeping notes

- Local coordinator `:4004` was restarted with `.env` sourced — **Google SSO is back on** (it had been left off after the demo-video recording session).
- `agents/.env` (gitignored) gained a real `CLAUDE_CODE_OAUTH_TOKEN` value; `.env.example` documents the new `AGENTIC_TIMEOUT_MS` knob.
- All sprint changes were left **uncommitted** pending an explicit commit instruction; natural commit boundaries are (a) e2e harness, (b) eval engine + live tests, (c) coordinator/store/UI + fast tests, (d) docs.
