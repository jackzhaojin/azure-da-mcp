# PR #6 Hardening + full UI validation (v2.1 part 2, as-built)

**Date**: 2026-06-14
**Status**: **COMPLETE** — baseline re-verified green, all three dashboard lanes validated end-to-end through a real browser on the live 4-agent mesh (real engine, **agentic tier on**), two hardening fixes landed with tests, demo script written and walked.
**Author**: Jack Jin (with Claude Code)
**Companion to**: [`06-coordinator-v1-parity-and-ui-retire.md`](./06-coordinator-v1-parity-and-ui-retire.md) (what PR #6 did + the pre-test code review) and [`DEMO-SCRIPT.md`](./DEMO-SCRIPT.md) (the walkthrough this validated).

> One-line story: **PR #6 was correct as merged. Driving all three lanes through a real browser on the real engine confirmed the parity works — and surfaced one genuine eval-quality bug (a chatty Claude response silently zeroing a whole dimension) that I fixed at the root for all four scorers.**

---

## 1. What I did

1. **Re-verified the PR #6 baseline** on `main` post-merge: `typecheck` clean, fast e2e **52/52** (incl. the new `coordinator-parity` eval-direct + batchId tests).
2. **Brought up the full local mesh** (eval :4001 real engine + agentic, content-gen :4002, migration :4003, coordinator/dashboard :4004) and **drove every lane through a real Chromium** via the playwright-cli skill — not snapshots of mocks, the actual running product.
3. **Found + fixed** one eval-quality bug (agentic JSON parsing) and one dashboard inefficiency (batch poll never backing off), each with a test.
4. **Wrote and walked the demo script** covering both the coordinator (Single + Bulk) and the eval (Direct eval + evidence).

## 2. Baseline verification (PR #6 as-merged)

| Gate | Result |
|------|--------|
| `npm run typecheck` (root + eval-service tsconfigs) | **PASS** |
| `npm run test:e2e` (fast tier, stub engine, real servers) | **52/52** |
| New `coordinator-parity.e2e.test.ts` | 3/3 — eval-direct records an `eval-direct` run; invalid payload → 400; `?batchId=` groups + isolates |
| Mesh health (4 agents) | all `ok:true`; eval `engine:real`, artifact store **R2** |

## 3. Live UI validation — every lane, real browser, real engine

All three lanes were exercised against the running mesh with the **agentic** tier enabled (real Claude passes, real Chromium, real axe-core). Screenshots captured to the gitignored `.playwright-cli/` working dir.

### Single (orchestrated full-loop) — ✅
Triggered `full-loop` / `dryrun` / **fan-out 2** / topic "rooftop solar panel maintenance guide" from the dashboard. The run detail rendered the **live branch grid** ("Branches — live, stages update as agents report"): both branches showed `generate ✓ → migrate ✓ → evaluate ⏳` with per-stage durations and **migration confidence** (87, 88), while the **Live activity** feed streamed real per-dimension working notes (`dimension accessibility: complete (score 82)`, etc.). On completion: Overall score μ±σ, pass rate, branches, and the **Variance per dimension** table. Confirms the orchestrated path, the live snapshot pipeline (`runs.live`), and the durable `branchResults`.

### Bulk (batch) — ✅
Loaded the **`evaluate-urls.json` sample** (3 URLs populated, "Run batch (3)"), submitted → redirected to `/batch/<id>`. Watched all three go **running → completed** with **real agentic** scores (iana 58 "needs work", example.com 77, example.org 77; avg **70.7**), grade-distribution chips, per-item table. **Export JSON** downloaded a complete, valid bundle (`batch-<id>.json`: every run's config + stats + `branchResults` + `evalTaskId`). Confirms batch grouping (`?batchId=`), the `BatchDetail` aggregation, and export.

### Direct eval (deterministic lane + dimension subset) — ✅
Drove the form: target `https://example.org`, **webpage source** `https://example.com` (Content auto-enabled), then deselected accessibility + visual to a **`[structure, content]` subset**. Submitted → `eval-direct` run → completed **73** with **only** structure (45, `agentic`) + content (100, `agentic`) tiles; the **Evidence panel** showed both modes `agentic` and report-level notes "accessibility dimension skipped: not selected" / "visual dimension skipped: not selected". The overall of **73** proves the **renormalization** is honest — two omitted dimensions did **not** drag it toward ~38; it's the weighted blend of the two selected dims. Confirms the dimensions subset end-to-end (UI → `/api/eval-direct` → `/store/eval-direct` → `runDirectEval` → eval agent → engine), the content auto-disable, and the evidence read path.

### Evidence panel / scoring honesty — ✅ (and it earned its keep)
Expanding Evidence on the iana.org batch run surfaced exactly what the 2026-06-11 sprint built it for: `structure: agentic`, `visual: agentic`, **`accessibility: deterministic-fallback`** with a real reason — which is how I found the bug in §4.

## 4. Hardening fix #1 — tolerant agentic JSON parsing (eval-quality)

**The bug (found live, not theorized).** The iana.org eval scored **accessibility = 0** and dropped the page to 58. The evidence panel's mode + reason made it diagnosable in one click:

> `accessibility — mode deterministic-fallback — reason: Invalid Claude response: Unexpected token 'B', "Based on t"... is not valid JSON`

The agentic accessibility pass got a perfectly good analysis from Claude — prefixed with prose (`Based on the analysis…`) instead of bare JSON. The parser only handled a ```` ```json ```` fence or a body that was *already* pure JSON, so `JSON.parse` threw, the dimension fell back to deterministic, and deterministic scored 0. **All four agentic scorers** (structure, accessibility, content, visual) shared this identical brittleness. On camera, an accessibility dimension flashing **0 / parse error** would be a demo-killer.

**The fix.** A shared `extractJsonText()` helper (`eval-service/src/engine/extract-json.ts`) tried by all four parsers. It is strictly additive — it preserves the two existing strategies and adds a third:
1. ```` ```json ```` / bare ```` ``` ```` fence (original behavior),
2. body already starting with `{`/`[` (original behavior),
3. **new**: slice the first **balanced** top-level `{…}`/`[…]` out of surrounding prose, brace-counting with **string-literal awareness** so braces inside string values don't miscount.

If nothing balances, it returns the original string so the caller's `JSON.parse` still throws and the dimension records an *honest* `deterministic-fallback` with a reason — degrade-loud is preserved, it just stops happening for chatty-but-valid responses.

**Files**: new `extract-json.ts`; `structure/accessibility/visual/content` `agentic.ts` each import it and replace their bespoke extraction with one call.

**Test** (real function, no mocks): `e2e/tests/extract-json.e2e.test.ts`, **7/7** — pure JSON, ```` ```json ```` fence, bare fence, **the regression** (prose-prefixed JSON), braces-inside-strings, top-level array, and the no-JSON-at-all case (must still throw so the honest fallback fires).

**Verified end-to-end**: restarted the eval agent on the patched engine and re-ran a real agentic eval — both scored dimensions came back `mode: agentic` (no parse fallback).

## 5. Hardening fix #2 — batch poll backs off when settled (dashboard)

Finding **F1** from the §6 review of doc `06`: `BatchDetail` polled `/api/runs?batchId=` every 2.5 s **forever**, even after every item finished — an idle finished batch kept hammering the store. (`RunDetail` already stops at terminal.)

**The fix** (`components/BatchDetail.tsx`): poll at 2.5 s while anything is in flight *or* rows are still landing, then **back off to a 15 s heartbeat** once all items are terminal. It never fully stops — so a **Retry failed** (which re-fires items into the same batch) or a late-landing row still gets picked up, and `retryFailed` re-arms the fast cadence immediately. This deliberately avoids the premature-*stop* hazard a naive "stop at terminal" would introduce (an item completing before its siblings' rows land would freeze the page). ~6× fewer idle requests, zero correctness risk.

## 6. Findings dispositions (from doc `06`'s review)

| # | Finding | Disposition |
|---|---------|-------------|
| F1 | `BatchDetail` polls forever | **FIXED** (§5) |
| F2 | `dimensions:["content"]` + `sourceType:none` → overall 0/critical (API-only) | **Left as-is** — unreachable from the UI (content auto-disables without a source); the eval-agent `toEvaluationRequest` + the card both guard it. Noted for a future guard. |
| F3 | `?batchId=` ignores `?limit=` | **Accepted** — demo-scale batches. |
| F4 | full-loop topics unvalidated free text | **Accepted** — server validates; topics are free-form by design. |
| F5 | `BatchDetail` grade label "needs work" vs engine "needs-improvement" | **Accepted** — cosmetic, self-consistent (batch grade is computed locally). |

Plus the new, higher-value find from running the system: the agentic JSON-parse brittleness (§4) — **FIXED**.

## 7. Final verification matrix

| Check | Result |
|-------|--------|
| `typecheck` (root + eval-service) after fixes | **PASS** |
| `extract-json.e2e.test.ts` | **7/7** |
| fast e2e (`test:e2e`) | **52/52** (pre-existing) — extract-json adds an 8th file, see §8 |
| live UI — Single / Bulk / Direct eval / evidence | **all ✅** on real engine + agentic |
| eval-direct dimensions subset honored + renormalized | **✅** (73 over structure+content only) |
| agentic parse fix verified on a live re-run | **✅** (both dims `agentic`) |

## 8. Notes / follow-ups

- **No new migration** in this hardening pass; the still-pending **D1 migrations `0005` + `0006`** (from the prior sprint and PR #6) remain the gate before the next Cloudflare deploy — apply them file-by-file via `wrangler d1 execute` (D1 has no `_migrations` runner).
- The agentic parse fix is in the **shared engine** (`src/engine/`), so it improves *every* eval path — orchestrated, batch, and direct — and the cloud eval container picks it up on the next redeploy.
- Changes left **uncommitted** pending an explicit commit instruction. Natural commit boundary: (a) eval engine tolerant JSON + its test, (b) dashboard batch poll backoff, (c) these docs.
- F2's degenerate "nothing evaluable → 0/critical" remains the one honest-scoring gap; cheap to close later (return a distinct "not evaluable" grade when `totalDimensions === 0`).
