# Model Assessment - 2026-09-08 (with agent memory)

The [2026-08-29 five-model assessment](../2026-08-29-model-assessment/) re-run on the upgraded
platform: same source page, same migration prompt skeleton, same judge, same eval mode - but the
migration agent now reads the site's **agent memory page** before authoring (v2.9.0), the page is a
curated two-tier document (v2.9.1), and every run records **evidence** of what the model actually read
and applied (v2.9.2/v2.9.3). One run per model, produced by `npm run model-matrix`
([harness docs](../../agents/docs/model-matrix.md)).

## Verdict

**Every model scored the same or higher, and the spread narrowed.** Overall went K3 88 to 90,
K2.7 85 to 88, Claude Sonnet 5 84 to 88, Claude Opus 5 86 to 90, Claude Haiku 4.5 84 to 84.
The lift is almost entirely in **Structure** (82-90 before, 90-95 now): the memory page carries the
rules the evaluator had been penalizing (og:type, the h1-to-h3 heading skip, placeholder links, saving
body-only HTML), and four of five models applied all eight of them. K3 and Opus 5 tie at 90; K3 stays
the migration default (better content fidelity, and it is what the daily loop runs).

## Results (memory on)

| Configuration | Structure | Accessibility | Content Fidelity | Visual Correctness | Overall | Migration confidence | Migration time | Eval time |
|---|---|---|---|---|---|---|---|---|
| **Kimi K3** | 93 | 92 | **85** | 90 | **90** | 92 | 5.9m | 3.0m |
| Kimi K2.7 | 90 | 92 | 84 | 86 | 88 | 92 | 6.0m | 4.5m |
| Claude Sonnet 5 | **95** | 92 | 78 | 88 | 88 | 88 | 5.7m | 3.3m |
| Claude Opus 5 | **95** | 92 | 81 | **93** | **90** | 92 | 3.2m | 3.7m |
| Claude Haiku 4.5 | 90 | 92 | 76 | 79 | 84 | 95 | 3.6m | 2.8m |

Judge `claude-sonnet-4-6`, mode `redesign`, all four dimensions agentic on every row. "Migration
confidence" is the model's self-report; the dimension scores and Overall are the judge's.

## Against the 2026-08-29 baseline

| Model | Overall | Structure | Accessibility | Content | Visual | Migration time |
|---|---|---|---|---|---|---|
| Kimi K3 | 88 to **90** (+2) | 90 to 93 | 92 to 92 | 82 to 85 | 88 to 90 | 4.2m to 5.9m |
| Kimi K2.7 | 85 to **88** (+3) | 86 to 90 | 92 to 92 | 78 to 84 | 85 to 86 | 4.5m to 6.0m |
| Claude Sonnet 5 | 84 to **88** (+4) | 82 to 95 | 92 to 92 | 78 to 78 | 85 to 88 | 3.1m to 5.7m |
| Claude Opus 5 | 86 to **90** (+4) | 82 to 95 | 92 to 92 | 83 to 81 | 88 to 93 | 3.3m to 3.2m |
| Claude Haiku 4.5 | 84 to **84** (0) | 85 to 90 | 92 to 92 | 74 to 76 | 83 to 79 | 2.8m to 3.6m |

Read the deltas with the same caution as the baseline: one run per model on each date, so 2-4
points is within run-to-run variance. What is not noise is the direction (five of five held or
improved), the mechanism (Structure, where the memory rules live), and the evidence below.

## Evidence - what each model read and applied

This is the part that did not exist on 2026-08-29. The migration agent now logs the target of every
read-type tool call and classifies it; the model also self-reports which memory rules changed a decision.

| Configuration | Memory page | Memory rules applied (self-reported) | Block library pages opened | Reference page | Lessons reported |
|---|---|---|---|---|---|
| Kimi K3 | loaded (11605 chars, 5 entries) | 8 | 5: hero, stats, quote, table, author-bio | read | 2 |
| Kimi K2.7 | loaded (11605 chars, 5 entries) | 8 | 4: hero, stats, quote, author-bio | read | 3 |
| Claude Sonnet 5 | loaded (11605 chars, 5 entries) | 8 | 5: hero, stats, quote, author-bio, table | read | 2 |
| Claude Opus 5 | loaded (11605 chars, 5 entries) | 8 | 5: hero, stats, quote, author-bio, table | read | 3 |
| Claude Haiku 4.5 | loaded (11605 chars, 5 entries) | 3 | 5: hero, stats, quote, table, author-bio | read | 3 |

Every model read the whole memory page (the approved tier plus five episodic run entries) and opened
the block-library page of each block it authored - the behavior the v2.9.2 prompt asks for, now
observable instead of assumed. The rules the models say they applied are the ones the evaluator had
been penalizing: `og:type: article` in the metadata block, an h2 before the stats band, no placeholder
links, body-only HTML on save, a verbatim source sentence for the pull quote (with the duplicate removed
from the body), "by Katie" with no invented role, every body image carried with its caption, the
"This Trip" sidebar carried as a stats band. Haiku applied three rules and posted the lowest content
score with the highest self-confidence (95), the same calibration gap the baseline flagged.

Two lessons the models reported are worth promoting into the approved tier after a human check:
Sonnet 5 found that `create_dalive_content`/`save_dalive_content` do not normalize a `<table>Metadata`
into `div.metadata` the way the editor does (author the div directly), and K3 found that a Playwright
snapshot taken immediately after navigate can return an empty `main` while block JS hydrates (wait and
re-snapshot before declaring the page broken).

## Method

- **Source**: `https://www.jackzhaojin.com/adapt-to-2026-demo/articles/one-week-above-10000-feet.html`
  (Katie's Travel Journal, the stage-demo legacy site) - unchanged from the baseline.
- **Migration**: same skill, same MCP servers, same reference page and block library. What changed
  between the two dates is the platform, not the experiment: the memory page
  ([`/ai-content/memory`](https://da.live/edit#/jackzhaojin/adapt-to-2026-demo/ai-content/memory), 11605
  chars at run time, five episodic entries from the daily loop) is injected into the prompt, and step 2
  of the prompt now requires one library-page read per block authored. Kimi ran in `opencode serve`
  (1.18.25, through the v2.8.1 wire-repair proxy); Claude ran in the Agent SDK.
- **Eval**: unchanged - platform eval engine, four dimensions, judge `claude-sonnet-4-6`, mode
  `redesign`. The K2.7 row was re-scored with `--eval-only` after its first pass lost the visual
  dimension to a one-off source-screenshot capture failure on the eval side; the migrated page was not
  touched. Its first-run evidence (rules applied, block pages) is recorded from that run.
- **Harness**: `--folder model-matrix-2026-09-08`, memory ON (the default since this change);
  `--no-memory` reproduces the pre-2.9 conditions.
- **Migrated pages** (live): `/model-matrix-2026-09-08/one-week-above-10000-feet-{k3,k27,sonnet,opus,haiku}`
  on `https://main--adapt-to-2026-demo--jackzhaojin.aem.page`; the baseline pages are still up under
  `/model-matrix-2026-08-29/`.
- **Evidence files**: `agents/output/model-matrix/model-matrix-2026-09-08/` (results.json, results.md,
  eval-report-<model>.json; local, gitignored run data - this page is the durable record).

## Observations

1. **Platform knowledge beat model choice again, and by more.** The baseline's spread was 84-88;
   with memory it is 84-90 and four models sit at 88-90. The rules that moved Structure came from
   the evaluator's own recurring findings, distilled into memory by the reflect step and by hand.
2. **Cost of reading: 1.5-2.5 extra minutes for Kimi and Sonnet.** Reading an 11.6k-char memory page
   and four or five block pages is not free. Opus 5 got slightly faster; it read the same pages.
3. **Content fidelity is the dimension memory did not move for Claude** (78 to 78, 83 to 81). The
   memory rules are about structure and site conventions; fidelity is about reading the source
   carefully, and that is still a model property.
4. **Haiku is the outlier**: fewest rules applied (3), lowest content (76), lowest visual (79),
   highest self-confidence (95). Cheap and fast, but it does not use what it is given.
5. **The evidence table is the demo.** "Did the AI use the block library and the memory?" is now a
   row per model, sourced from tool calls, not from the model's word.

## Version history

The baseline and this rerun bracket the v2.9 line. Tags, newest first:

| Tag | Date | Commit | What |
|---|---|---|---|
| `v2.9.3` | 2026-09-05 | `24fdd92` (`794f8cf`) | Evidence hotfix: read targets captured from any tool-part update (Cloudflare ordering) |
| `v2.9.2` | 2026-09-05 | `18b4e35` (`bb79ae1`) | Usage evidence: read targets logged and classified, `memoryApplied`/`referencesConsulted`, prompt step 2 requires a library page per block, dashboard Evidence panel |
| `v2.9.1` | 2026-09-05 | `d173d0f` (`9299371`) | Two-tier memory page: approved tier + episodic log the reflect step appends into; whole page read |
| `v2.9.0` | 2026-09-05 | `296385d` (`d6a34dd`) | Agent memory loop: migrator reads `/ai-content/memory`, `eval.reflect` appends distilled rules after each scored run |
| `v2.8.1` | 2026-09-02 | `e6cb293` | Kimi wire-repair proxy + same-session continuation; opencode pinned 1.18.25 |
| `v2.8.0` | 2026-08-29 | `04b2ade` | The baseline assessment (`c67b094` sdk backend + matrix harness, `a1eb4df` redesign eval mode) |

Release-by-release detail: [CHANGELOG.md](../../CHANGELOG.md) (2.8 and 2.9 sections).

## Reproducing / extending

```bash
cd agents
set -a; source .env; set +a          # CLAUDE_CODE_OAUTH_TOKEN; MOONSHOT_API_KEY for Kimi rows
npm run model-matrix                                   # all five, memory ON, ~50 min
npm run model-matrix -- --no-memory --folder mm-baseline-$(date +%F)   # same day, memory OFF: a controlled A/B
npm run model-matrix -- --models k27 --eval-only --folder model-matrix-2026-09-08   # re-score a row
```

Next steps that would make the claim load-bearing: run `--no-memory` and memory-on on the same day
(controls for judge drift between 08-29 and 09-08), and run each condition three times and report
medians. Note the Kimi key's 5-hour usage window: five Kimi turns in one afternoon exhausted it on
2026-09-05.
