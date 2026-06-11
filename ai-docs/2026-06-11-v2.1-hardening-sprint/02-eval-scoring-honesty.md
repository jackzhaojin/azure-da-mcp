# 02 — Eval Scoring Honesty: Four Fixes to the Engine

**Files**: `agents/eval-service/src/engine/{evaluator.ts, agent-auth.ts (new), types/evaluation.ts}`, `agents/eval-service/src/engine/agents/{visual,content,structure,accessibility}/agentic.ts`, `agents/eval-service/src/engine/agents/visual/{deterministic.ts, types.ts}`
**New tests**: `agents/e2e/tests-live/eval-quality.live.test.ts` (3 tests, real Chromium, $0 — AI keys blanked)
**Result**: the engine no longer fabricates scores when it can't measure, no longer punishes pages for missing inputs, and records *how* every score was produced.

---

## Why — the forensic trail

The brief said "make the eval agent work really well." An exploration agent audited the engine (the ~5.5k-line copy from the frozen v1 app) against the actual reports sitting in `eval-service/data/store.db`, and found a cluster of **scoring-honesty bugs** — cases where the number in the report was not a statement about the page, but an artifact of a measurement failure:

1. **The demo run's content=45.** The 2026-06-11 demo evaluated a real K2.6 migration: structure 96, accessibility 100, visual 100, **content 45**. Inspecting the persisted report showed the content result's metadata had *only* a `deterministic` block — the agentic pass never ran — and the entire 4-dimension eval took **4.2 seconds** (a real agentic eval takes minutes). The 45 was pure Jaccard word-set overlap: a faithful-but-paraphrased migration mathematically lands at ~40–50 on that metric. The engine knew it had degraded; the report didn't say so; the bare `catch {}` at the fallback site guaranteed nobody would ever find out without forensics.
2. **Visual=100 on pages that never rendered.** `captureScreenshot` returns a size-0 *placeholder* on failure ("allows agentic fallback", said the comment), `analyzeVisual` carried on, `calculateVisualScore(undefined)` returned **100**. A dead target URL scored a perfect visual. The project had already been bitten by this exact class once — `eval-service/CLAUDE.md` records the `.cjs`-vs-ESM incident where "visual once scored 100 on a page that never rendered."
3. **Visual=100 on every real comparison.** Full-page screenshots of source vs migrated pages almost never agree on height; `compareImages` **threw** on any dimension mismatch; the throw was caught with a warning; `comparison` stayed `undefined`; score → 100. In practice this meant the deterministic visual comparison *never actually ran* for real migrations — counter-evidenced in the same DB by visual=100 rows alongside content=45 rows for the same page.
4. **Content=0 at 25% weight for sourceless evals.** With `sourceType: none` (no source to compare against), the engine returned a content result with `score: 0` that **counted at full 25% weight**. The `example.com` smoke rows in the DB showed overall=66 for a perfectly fine page — 66 ≈ (96+100+100+0)/4 · renormalization quirks. The contract (`eval.run.v1.json`) had always said `none` "auto-skips the content dimension"; the code didn't honor it.
5. **No timeout anywhere on the agentic tier.** The four `query()` calls had `maxTurns: 20` and nothing else — and the platform *deliberately disables undici's fetch timeouts mesh-wide* (`a2a-common/src/net.ts`, needed for >5-min Kimi migrations). A hung agentic turn would hold its browser permit (of 3) and queue slot (of 2) **forever**, while the 45s SSE heartbeat dutifully kept the task alive. The `AGENT_TIMEOUTS` constants in `constants.ts` were dead code — defined, never referenced.
6. **The agentic gate contradicted its own docs.** All four agentic modules gated on `CLAUDE_CODE_OAUTH_TOKEN` only, with `throw new Error('… set CLAUDE_CODE_OAUTH_TOKEN in .env.local')` — while `eval-service/CLAUDE.md` claimed "`CLAUDE_CODE_OAUTH_TOKEN` **or** `ANTHROPIC_API_KEY`". An API key alone could never enable agentic scoring.

The common thread: **measurement failure was being laundered into quality verdicts** (both directions — false 100s *and* false 0s/45s), and the degradation was invisible downstream. For a product whose adaptTo() headline is *variance in migration quality scores*, untrustworthy scores are an existential bug.

## What + How — fix by fix

### Fix A: dead captures fail the dimension (no more placeholder→100)

`analyzeVisual` now treats a size-0 screenshot as what it is — a failed measurement:

```ts
const screenshot = await captureScreenshot(url, viewport);
if (screenshot.size === 0) {
  throw new Error(`Screenshot capture failed for ${url} — page did not render`);
}
// …and symmetrically for the baseline when a source comparison was requested:
if (baselineScreenshot.size === 0) {
  throw new Error(`Baseline screenshot capture failed for ${sourceUrl} — visual comparison not possible`);
}
```

The throw propagates to `runAgent`'s outer handler, the dimension is **excluded** from results, weights renormalize over what *was* measured, and (new — see Fix D) the exclusion lands in the report findings as `"visual evaluation failed: …"`. The semantic stance: *an eval that can't see the page must not claim the page looks perfect.* For a dead target this means all dimensions fail → overall 0, grade `critical`, status still `completed` — a dead page **is** a catastrophically failed migration, which is a verdict, not an agent crash.

### Fix B: mismatched heights compare the shared region + size penalty

`compareImages` no longer refuses to compare differently-sized screenshots. It crops both to the shared region (`PNG.bitblt` to `min(width) × min(height)`), runs pixelmatch there, and reports the size disagreement as a first-class signal:

```ts
// ImageComparisonResult gains:
dimensionsDelta?: { widthPct: number; heightPct: number };

// calculateVisualScore:
const sizePenalty = comparison.dimensionsDelta
  ? Math.min(15, Math.round(Math.max(widthPct, heightPct) / 2))
  : 0;
const score = Math.max(0, 100 - comparison.diffPercentage - sizePenalty);
```

Rationale for the shape: the cropped pixel diff can't see content that exists only below the shorter page's fold, but a large height delta is itself evidence (content added or lost — which the *content* dimension measures textually). So the delta penalizes visually, **capped at 15 points** so a legitimately longer redesign can't be pushed below ~85 by layout alone. `matches` is also corrected: two screenshots of different sizes are never a "match" even if the shared region is pixel-identical. When a comparison was *requested* but genuinely can't compute (unreadable baseline file), the error now **fails the dimension** instead of silently degrading to capture-only-100 — with the crop fix in place, that path is rare and always a real fault.

### Fix C: `sourceType: none` skips content (the contract, finally honored)

`runAgent('content')` with no source now returns a structured **skip** instead of a zero score:

```ts
return {
  dimension, result: null, error: null, duration: timer.elapsed(),
  skipped: 'no source reference provided — content fidelity is not applicable',
};
```

`runEvaluation` aggregates skips separately from failures: a skipped dimension is excluded from `calculateOverallScore` (the existing present-dimensions renormalization does the math), `summary.totalDimensions` drops to the applicable count (3 for sourceless evals — `passedDimensions: 3, totalDimensions: 3` now reads as the clean sweep it is), and the skip is recorded as an info finding so it never looks like the dimension was forgotten. A *failed* dimension, by contrast, stays in the denominator story as a `serious` finding — it *should* have produced a score. Separately, a content **analysis** failure (fetch/parse throwing) now propagates as a dimension failure rather than being converted to `score: 0` — same principle as Fix A: measurement failure ≠ quality verdict of zero.

The progress-event contract is preserved: a skipped content still emits `agent-complete` (so the A2A status stream and the 4-step progress math don't change shape for consumers).

### Fix D: degraded modes are recorded, fallbacks un-silenced

The structural fix for the content=45 class. `AgentResult.metadata` gains:

```ts
mode?: 'agentic' | 'deterministic-only' | 'deterministic-fallback';
modeReason?: string;
```

- **`agentic`** — the full pass ran (score = 0.7 × Claude + 0.3 × deterministic).
- **`deterministic-only`** — no Claude auth configured. *Expected* degradation (this is the `test:live` $0 path).
- **`deterministic-fallback`** — agentic was attempted and **failed**; `modeReason` carries the error. This is the alarming one, and it used to be indistinguishable from the other two.

A shared `describeAgenticFailure(dimension, error)` helper classifies each catch (using `hasAgentAuth()` to tell "no key" from "real failure"), logs at the appropriate level, and emits an info **finding** into the dimension result ("Agentic analysis failed — score is deterministic-only: \<error\>"), so the persisted report and the new dashboard Evidence panel (doc 05) both show it. All four dimensions' catch blocks — three of which were literally bare `catch {}` — now route through it; the deterministic-fallback content finding also annotates its similarity number with *"word-overlap metric — paraphrased migrations score low without the agentic pass"* so a future 45 explains itself in-line.

### Fix E: the agentic gate accepts either credential

New `engine/agent-auth.ts` centralizes what was four copy-pasted checks:

```ts
export function hasAgentAuth(): boolean {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}
```

This makes the code match the documented contract (the Agent SDK itself accepts either), and removes a leftover v1 debug block in `structure/agentic.ts` that logged a token preview + full environment details on every run.

### Fix F: agentic passes get a real deadline

Same new module:

```ts
export function agenticAbort(label: string) {
  const timeoutMs = Number(process.env.AGENTIC_TIMEOUT_MS) || 300_000; // 5 min/dimension
  const controller = new AbortController();
  const timer = setTimeout(() =>
    controller.abort(new Error(`${label} agentic pass timed out after ${timeoutMs}ms`)), timeoutMs);
  return { controller, done: () => clearTimeout(timer) };
}
```

Each of the four `query()` loops is wrapped in `try { for await (… { abortController: deadline.controller }) } finally { deadline.done() }` — verified against the installed SDK's types (`Options.abortController`, runtimeTypes.d.ts:234). On abort, the for-await throws, `describeAgenticFailure` records `deterministic-fallback` with the timeout reason, and — critically — the browser permit and queue slot are released. The timeout lives **inside** the agentic function rather than racing it from the evaluator, precisely so `withBrowserPermit`'s release fires; an outer `Promise.race` would have leaked the permit to the still-hung promise. 5 minutes/dimension was chosen against observed real agentic passes (~1–3 min with browser tools); it's env-tunable (`AGENTIC_TIMEOUT_MS`, documented in `.env.example`).

## Tests — `eval-quality.live.test.ts`

Per the monorepo's testing philosophy (real servers, real browsers, no mocks), the three fixes that change observable scoring got a live-tier suite. To avoid external-site flake it spins up a **local fixture HTTP server** in the test (a tall 40-paragraph "source" page and a short 2-paragraph paraphrased "target"), and runs the real engine with AI keys blanked:

1. **Skip semantics**: `sourceType: none` → content absent from `dimensionScores` *and* `report.results`, `totalDimensions === 3`, a "skipped" finding present, **overall === round(mean of the three present scores)** (pins the renormalization math), and every present dimension carries `mode: "deterministic-only"`.
2. **Dead target**: `http://127.0.0.1:9/dead-page` → task **completes**, `overallScore === 0`, grade `critical`, `dimensionScores` empty — **visual must NOT be 100** — and each of structure/accessibility/visual has an "evaluation failed" finding.
3. **Height mismatch**: target vs the much-taller source with `sourceType: webpage` → all 4 dimensions present (`totalDimensions === 4`), **visual strictly between 0 and 100** (shared-region diff + capped size penalty actually applied — the old code would have produced exactly 100), content present in deterministic mode.

All three passed first run (5.7s total — the dead-URL case completes in ~0.5s because connection-refused fails fast). The full live tier (including the pre-existing `eval-engine.live.test.ts`, whose example.com expectations survive unchanged because it never asserted on content) stayed green: 14/14.

## What deliberately did NOT change

- **The deterministic content metric itself** (Jaccard word-set + heading penalties) was *not* rewritten. The survey ranked it #1, but the honest fix hierarchy is: first make degradation visible (Fix D), then enable the agentic tier that supersedes it locally (doc 03). With both done, the word-overlap number is a clearly-labeled coarse fallback rather than a hidden verdict. Replacing it with embedding similarity remains future work — now it can be evaluated against labeled agentic runs.
- **The 0.7/0.3 agentic/deterministic blend and the prompt's "start with deterministic similarity score" anchor** — the double-anchoring concern is real but touching scoring formulas the day after cutting v2.0.0, without a calibration corpus, would be change for change's sake. Logged as future work.
- **Dimension-level retries** — the whole-job 3-attempt retry stays; per-dimension retry needs the mode field's telemetry first to know what's worth retrying.
