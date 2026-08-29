# Model Assessment — 2026-08-29

Five models ran the **same content migration** (one legacy article → a da.live page on the
`adapt-to-2026-demo` Wilderness Journal design system), and every result was scored by the
**same judge**. One run per model. Produced by `npm run model-matrix`
([harness docs](../../agents/docs/model-matrix.md)).

## Verdict

**Kimi K3 is the model we should be using for migrations — and it already is** (the daily
loop has defaulted to `k3` since 2026-08-02; this assessment confirms that choice with
independent numbers). Claude Opus 5 is the strongest Claude option (best content fidelity,
86 overall) if a second vendor is ever needed.

## Results

| Configuration | Structure | Accessibility | Content Fidelity | Visual Correctness | Overall | Migration confidence | Migration time |
|---|---|---|---|---|---|---|---|
| **Kimi K3** | **90** | 92 | 82 | **88** | **88** | 92 | 4.2m |
| Kimi K2.7 | 86 | 92 | 78 | 85 | 85 | 90 | 4.5m |
| Claude Sonnet 5 | 82 | 92 | 78 | 85 | 84 | 88 | 3.1m |
| Claude Opus 5 | 82 | 92 | **83** | **88** | 86 | 90 | 3.3m |
| Claude Haiku 4.5 | 85 | 92 | 74 | 83 | 84 | 95 | 2.8m |

"Migration confidence" is the model's **self-report**; the four dimension scores and Overall
come from the independent judge. Note Haiku: highest self-confidence (95), lowest content
score (74).

## Method

- **Source**: `https://www.jackzhaojin.com/adapt-to-2026-demo/articles/one-week-above-10000-feet.html`
  (Katie's Travel Journal, the stage-demo legacy site)
- **Migration**: identical prompt (`buildMigrationPrompt`, article pattern), identical
  `da-live-author-playwright` skill, identical MCP servers (da.live CRUD/publish +
  Playwright validation). Kimi models run in their native harness (`opencode serve`);
  Claude models in theirs (Claude Agent SDK, subscription OAuth). Backend flag is the only
  difference: `{"backend":"opencode","model":"k3"}` vs `{"backend":"sdk","model":"claude-opus-5"}`.
- **Eval**: the platform eval engine, 4 dimensions, judge fixed at `claude-sonnet-4-6`,
  **all dimensions agentic on every row** (recorded per run), mode **`redesign`** —
  replatform-aware scoring where content stays source-aware but visual judges content
  carryover + new-template execution instead of like-for-like similarity. Under strict
  `fidelity` mode every model scored visual ~25 purely for the *intentional* redesign
  (validated on the same pages: K3 visual 26→88, K2.7 24→85 with zero page changes).
- **Migrated pages** (live, for side-by-side): `/model-matrix-2026-08-29/one-week-above-10000-feet-{k3,k27,sonnet,opus,haiku}`
  on `https://main--adapt-to-2026-demo--jackzhaojin.aem.page`
- **Evidence**: full per-row eval reports + timings in `agents/output/model-matrix/model-matrix-2026-08-29/`
  (local, gitignored run data; the table above is the durable record).

## Observations

1. **The spread is small (84–88 across five very different models).** The skill + prompt +
   reference-page pattern carries most of the quality; model choice tunes the margins.
2. **Accessibility is flat at 92 for every model** — the block library/template does that
   work. Platform-encoded best practices beat per-model prompting.
3. **Self-report ≠ quality.** Haiku's 95-confidence/74-content row is the cautionary tale;
   K3's 92-confidence/88-overall is the best-calibrated.
4. **Kimi is slower but better here** (~4.3m vs ~3m for Claude rows) on this task shape.
5. Judge-family caveat: the judge is a Claude model and it ranked Kimi K3 first — which is
   also a decent argument that it isn't family-biased.

## Reproducing / extending

```bash
cd agents
set -a; source .env; set +a          # CLAUDE_CODE_OAUTH_TOKEN; MOONSHOT_API_KEY for Kimi rows
npm run model-matrix                 # all five, sequential, ~45–60 min
npm run model-matrix -- --models k3,k27 --eval-only   # re-score existing pages, no Kimi spend
```

One run per model is demo-grade evidence, not a benchmark — for load-bearing claims run the
matrix N times and report medians (`--folder` per repetition).
