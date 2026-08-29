# Model matrix — same migration, same judge, N models

`npm run model-matrix` (from `agents/`) runs the **same content migration** through
multiple models and scores every result with the **same eval engine** — producing an
apples-to-apples comparison table (structure / accessibility / content fidelity /
visual correctness / overall) you can drop into a slide.

```
one legacy source page
        │
        ├─ migration.run backend=opencode model=k3              → da.live page A ─┐
        ├─ migration.run backend=opencode model=kimi-for-coding → da.live page B ─┤
        ├─ migration.run backend=sdk      model=claude-sonnet-5 → da.live page C ─┼─ eval.run (fidelity,
        ├─ migration.run backend=sdk      model=claude-opus-5   → da.live page D ─┤   fixed judge model)
        └─ migration.run backend=sdk      model=claude-haiku-4-5→ da.live page E ─┘
                                                                                  │
                                                       results.{json,md} — one row per model
```

What's held constant: the source page, the migration prompt (`buildMigrationPrompt`),
the `da-live-author-playwright` skill, the two MCP servers (da.live CRUD/publish +
Playwright validation), the eval engine and its judge model (`CLAUDE_MODEL`) and
mode. What varies: the model and its native agentic harness (Kimi runs in
`opencode serve`, Claude runs in Claude Code via the Agent SDK).

**Eval mode** (`--eval-mode`, default **`redesign`**): these migrations replatform
the page onto a new design system, so the visual dimension judges *content
carryover + new-template execution* from both screenshots instead of like-for-like
similarity (which scored ~25 on every model purely for the intentional redesign);
content stays source-aware. Pass `--eval-mode fidelity` for the strict comparison.

## Run it

```bash
cd agents
set -a; source .env; set +a          # CLAUDE_CODE_OAUTH_TOKEN (sdk backend + agentic eval)
export MOONSHOT_API_KEY=...          # only for the Kimi rows (usually in ~/.zshrc)

npm run model-matrix                                   # all five models, sequential
npm run model-matrix -- --models k3,sonnet             # a subset
npm run model-matrix -- --models dryrun                # $0 pipeline smoke (simulated migration, real eval)
npm run model-matrix -- --source https://… --folder my-benchmark --slug my-page
npm run model-matrix -- --models k3,k27 --eval-only    # re-SCORE already-migrated pages (no migration
                                                       #   calls — free for quota-limited models); falls
                                                       #   back to a full run for rows with no prior page
```

Reruns into the same `--folder` merge: rows for models not selected are kept, rows
for selected models are replaced.

The harness (`e2e/scripts/model-matrix.ts`) spawns its own migration + eval agents on
isolated 14xxx ports (no dev servers needed), runs the models **sequentially**, and
writes after every run to `agents/output/model-matrix/<folder>/`:

- `results.json` — every run's migration report + eval scores + timings
- `results.md` — the slide table, ready to paste
- `eval-report-<model>.json` — the full 4-dimension eval report (evidence)

## Reading the results honestly

- `eval.dimensionModes` must say `agentic` for every dimension — `deterministic-*`
  means the Claude judge pass didn't run and the row isn't comparable.
- Migration `confidence` is the model's self-report; the eval scores are the
  independent judge. Report the eval scores.
- Each run authors a REAL page under `/<folder>/<slug>-<model>` on the target site
  (default `adapt-to-2026-demo`, folder `model-matrix-<date>`) — the pages stay up
  for manual inspection and re-evals.
- One run per model is a demo-grade sample, not a benchmark — variance between runs
  of the SAME model can rival variance between models. For load-bearing claims, run
  the matrix N times and report medians.

## Adding a model

- **Another Kimi model**: add it to `provider.kimi-code.models` in
  `~/.config/opencode/opencode.jsonc` (opencode fails at message time otherwise),
  then add a `MODELS` entry with `backend: "opencode"`.
- **Another Claude model**: just add a `MODELS` entry with `backend: "sdk"` and the
  model id — the Agent SDK resolves it.
- **A different vendor**: implement a new `MigrationBackend`
  (`migration-agent/src/backends/`, register in `executor.ts` BACKENDS) — the
  contract (`migration.run.v1`) and this harness stay unchanged. That seam existing
  is the whole point (PRD part-5).
