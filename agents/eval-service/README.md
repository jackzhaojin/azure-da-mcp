# Eval Service (`da-eval-agent`)

The 2.0 evaluation agent: an A2A server on port **4001** that scores a published
Edge Delivery Services page across four dimensions (**structure, accessibility,
content, visual**) and returns a graded report. It is the decoupled successor to
the 1.0 [`content-authoring-eval`](../../content-authoring-eval/README.md) app:
the engine was *copied* out of that app (which stays frozen, decision D5) and then
hardened here - scoring honesty, mode badges, three scoring modes, browser
concurrency caps, restart-safe queueing, R2 artifacts.

Everything in this document is read from the code in this workspace, not from the
1.0 docs. Where 2.0 differs from 1.0 it is called out explicitly.

- **Skill**: `eval.run` (contract [`contracts/eval.run.v1.json`](../contracts/eval.run.v1.json))
- **Transport**: A2A JSON-RPC at `/a2a` (`message/send`, `message/stream`, `tasks/get`), plus a flat edge shim `POST /hooks/eval/eval.run` for non-A2A callers
- **Scoring modes**: `fidelity` (default), `quality`, `redesign`
- **Judge model**: `CLAUDE_MODEL`, default `claude-sonnet-4-6`, driven through `@anthropic-ai/claude-agent-sdk` 0.3.251
- **Deployed**: Cloudflare Container behind the `content-factory` Worker at `content-factory-eval.jackzhaojin.com`; store on D1, screenshots on R2
- **AI context for editing this workspace**: [`CLAUDE.md`](./CLAUDE.md)

## Quick start

```bash
cd agents && nvm use 20 && npm install
set -a; source .env; set +a          # CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY, R2_* (optional)
npm run dev:eval                     # real engine on :4001 (EVAL_ENGINE=stub for the no-browser fake)

# smoke one eval through the edge shim (no A2A client needed)
curl -X POST localhost:4001/hooks/eval/eval.run -H 'Content-Type: application/json' \
  -d '{"targetUrl":"https://main--adapt-to-2026-demo--jackzhaojin.aem.page/ai-content/stories/chasing-sunsets","sourceType":"none"}'
# -> 202 {taskId, contextId, state}; poll /a2a tasks/get, or pass callbackUrl to receive the finished Task as a webhook

curl localhost:4001/health           # engine, queue depth, browser permits in use
npm run test:e2e                     # fast tier: stub engine, pins the A2A contract
npm run test:live                    # live tier: real Chromium/axe/screenshots, $0 without a key
```

## How one evaluation runs

1. **Accept.** `execute()` pulls the payload out of the A2A message (data part or
   JSON text part), validates it against `eval.run.v1`, publishes the Task as
   `submitted` with the payload stashed in `metadata.payload` (that is what
   restart-rebuild reads), and returns immediately. Submit-and-detach: the caller
   never blocks on the evaluation.
2. **Queue.** The job goes onto an in-process p-queue (`EVAL_CONCURRENCY`,
   default 2). While it waits, a 45 s heartbeat keeps the SSE stream alive
   (quiet streams get dropped across the Worker/container hops on Cloudflare).
3. **Run.** `runEvaluation()` fans the requested dimensions out in parallel
   (`Promise.all`). Each dimension runs its deterministic tools first, then an
   agentic pass, then blends the two. Every Chromium acquisition, whether a
   shell-out script or a Playwright MCP server spawned by the Agent SDK, takes
   one of `BROWSER_PERMITS` (default 3) from a service-wide semaphore.
4. **Aggregate.** Weighted overall score over the dimensions that produced a
   score, a grade, findings from every dimension plus notices for anything
   skipped or failed.
5. **Persist and emit.** The visual screenshot is uploaded to the artifact store
   (R2, or local `./output` served at `/artifacts`) and its URL rewritten into the
   report; an `eval_reports` row is written; the report is published as an A2A
   artifact named `eval-report`; the Task goes `completed`. Failures retry up to
   `EVAL_MAX_ATTEMPTS` (3) with 2 s / 8 s backoff before the Task goes `failed`.
6. **Survive restarts.** On boot the real engine re-enqueues any `submitted` /
   `working` task created in the last 30 minutes straight from the store; older
   ones are marked `failed` so container churn cannot resurrect abandoned work.

## Deterministic vs Agentic Breakdown

Same column layout as the 1.0 table so the two can be read side by side. The
important structural difference: in 2.0 **every dimension is a blend**. The
deterministic tier always runs and produces a score of its own; the agentic tier
interprets those numbers (and, where the prompt says so, goes and looks at the
live page) and produces a second score; a fixed formula combines them. Nothing
agentic sits between the four dimension scores and the final number.

| Component | Type | Responsibility | Technology |
|-----------|------|----------------|------------|
| **A2A server** | Deterministic | Agent Card at `/.well-known/agent-card.json`, JSON-RPC at `/a2a` (mesh-token gated), public `/health` with queue + browser stats, static `/artifacts` | Express + `@a2a-js/sdk@0.3.13` via `@agents/a2a-common` `startAgentServer()` |
| **Edge shim** | Deterministic | `POST /hooks/eval/eval.run`: flat JSON in, `202 {taskId}` out, finished Task delivered to `callbackUrl` as a webhook; edge-token gated | `a2a-common/src/server.ts` |
| **Payload validation + mapping** | Deterministic | Enforce `eval.run.v1` (`targetUrl` http/https required; `sourceLocation` required unless `sourceType: none`), filter `dimensions` to the four known ones, map to the engine's `EvaluationRequest` (`webpage` -> `expectedUrl`, `pdf` -> `pdfPath`, `mode`) | TypeScript, `src/executor.ts` |
| **Job queue** | Deterministic | Submit-and-detach; drains at `EVAL_CONCURRENCY` (2); 45 s queue-wait heartbeat | `p-queue` |
| **Browser semaphore** | Deterministic | Cap live Chromium instances service-wide at `BROWSER_PERMITS` (3) across the `.cjs` shell-outs *and* the Playwright MCP spawns inside agentic passes | `src/browser/semaphore.ts` |
| **Retry + heartbeat** | Deterministic | Up to 3 attempts, backoff `[2s, 8s]`; 45 s in-flight `working` heartbeat; names the judge model in the first status event | `src/executor.ts` |
| **Restart rebuild** | Deterministic | Re-enqueue `submitted`/`working` tasks younger than 30 min from the SQLite/D1 task store; expire older ones as `failed` | `src/index.ts` + `SqliteTaskStore` |
| **Evaluation orchestrator** | Deterministic | Run the requested dimensions in parallel, emit `agent-start` / `agent-complete` progress (mapped to A2A `working` messages), route each dimension by `mode`, collect skip / fail bookkeeping | `src/engine/evaluator.ts` |
| **Auth gate + deadline** | Deterministic | `hasAgentAuth()` = `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY`; every agentic pass gets an `AbortController` that fires at `AGENTIC_TIMEOUT_MS` (5 min) so a hung turn cannot hold a browser permit forever | `src/engine/agent-auth.ts` |
| **Prompt builder** | Deterministic | Fill `{{placeholders}}` in a JSON prompt template with the deterministic metrics (metrics tables, truncated text samples, diff examples, violation lists); template chosen by source type and `mode` | 11 templates in `src/engine/prompts/*.json`, string replace |
| **Agent SDK invocation** | Deterministic | `query()` with `model: CLAUDE_MODEL`, `maxTurns: 20` (1 for content quality), Playwright + filesystem MCP servers resolved per environment (Docker vs Homebrew vs nvm paths, `--headless --browser=chromium`, `--no-sandbox --disable-gpu` in containers), `bypassPermissions`, the abort controller above | `@anthropic-ai/claude-agent-sdk` 0.3.251, `src/engine/mcp-config.ts` |
| **Response extraction + validation** | Deterministic | Pull JSON out of the model's text whether it is fenced, bare, or prose-wrapped (balanced-brace slice); validate required fields per dimension; clamp `score` to 0-100. Tool use is counted and logged but *not* enforced | `src/engine/extract-json.ts` + each `agentic.ts` `parseClaudeResponse` |
| **Cheerio structure analysis** | Deterministic | Fetch the target HTML; extract 15 meta fields (title, description, OG, Twitter, canonical, robots, viewport, charset), the h1-h6 hierarchy with nesting-skip issues, landmark presence (`header/nav/main/footer/aside`), section/article/form counts, link classification (internal/external/broken/no-text). Deterministic score: 100 minus fixed penalties (no title -10, no description -8, no viewport -5, no og:title -7, no h1 -15, multiple h1 -10, bad nesting -5, no main -8, no header/footer/nav -4 each, broken anchors and text-less links capped at -10 each) | `cheerio` |
| **axe-core accessibility scan** | Deterministic | Shell out to `scripts/scan-accessibility.cjs`: headless Chromium at 1280x720, `networkidle`, axe tags `wcag2a wcag2aa wcag21a wcag21aa wcag22aa`; returns violations (with nodes + failure summaries), passes, incomplete, inapplicable. Score: 100 minus 10/5/2/1 per affected *node* by impact; WCAG level heuristic (no violations = AA, no critical/serious = A) | `playwright` + `@axe-core/playwright` |
| **Text extraction + diff (content, fidelity)** | Deterministic | PDF source: `unpdf` text + metadata + heading heuristic. Webpage source: Cheerio text of `<main>` (or body) with script/style/nav/footer stripped. Then sentence-level missing/extra/common lists (top 20 each) and a Jaccard word-overlap similarity. Score: similarity minus a word-count penalty (capped 15) minus 2 per unmatched source heading | `unpdf`, `cheerio` |
| **Substance proxy (content, quality mode)** | Deterministic | Target page only: 45 base + 8/12/10 at 200/400/800 words + 6/9 at 1/3 headings + 10 at 4 paragraphs. The floor under the editorial judgment and the whole score when no key is configured | `cheerio` |
| **Screenshot + pixel diff (visual)** | Deterministic | Shell out to `scripts/capture-screenshot.cjs` (1280x720 viewport, full-page PNG, `networkidle`) for the target and, with a webpage source, for the baseline; `pixelmatch` over the *shared* region when heights differ, with a capped size penalty (max 15) from the height/width delta; writes a diff PNG. Score: `100 - diff% - sizePenalty`, or 100 when there is no baseline to compare | `playwright`, `pixelmatch`, `pngjs`, `image-size` |
| **Structure agent** | Agentic | Interpret the Cheerio metrics for SEO and semantic quality; the prompt tells it to open the live page with Playwright MCP (`browser_navigate`, `browser_snapshot`) to see JavaScript-rendered DOM before scoring. Returns findings, strengths, score, summary | Claude via Agent SDK + Playwright MCP (`structure-no-source.json`) |
| **Accessibility agent** | Agentic | Re-rank the axe violations by real user impact, add plain-language explanations, `quickWins` and `majorIssues`; may optionally pull the live accessibility tree via Playwright MCP | Claude via Agent SDK + Playwright MCP (`accessibility-no-source.json`) |
| **Content fidelity agent** | Agentic | Judge whether meaning, intent, and tone survived the migration, given both text samples and the diff; the prompt instructs it to fetch the full pages and run text comparison tools rather than trust the 2000-char samples. Returns typed findings with snippets, `criticalGaps`, `minorImprovements` | Claude via Agent SDK + Bash/fetch tools (`content-pdf-source.json` / `content-html-source.json`) |
| **Content quality agent** | Agentic | Score intrinsic editorial quality (substance, coherence, completeness, expertise, structure) of up to 6000 chars of article text. Tool-free, `maxTurns: 1`, holds no browser permit | Claude via Agent SDK, text only (`content-no-source.json`) |
| **Visual agent** | Agentic | Claude vision over real pixels: the migrated screenshot always, plus the baseline screenshot (webpage source) or the PDF itself as a document block (PDF source). Fidelity prompts look for regressions; the redesign prompt scores content carryover 45 / new-template execution 35 / editorial polish 20 and deducts nothing for intentional layout, branding, chrome, or color changes. May capture extra screenshots via Playwright MCP | Claude vision via Agent SDK multimodal message + optional Playwright MCP (`visual-*.json`, 4 templates) |
| **Per-dimension blend** | Deterministic | Combine the two tiers with a fixed weight per dimension (see next table) | TypeScript |
| **Fallback + mode recording** | Deterministic | If the agentic pass throws (no key, timeout, bad JSON, SDK error) the dimension keeps its deterministic score and records `metadata.mode` = `deterministic-only` (no auth) or `deterministic-fallback` (attempted and failed, with `modeReason`) plus an info finding. Two exceptions fail the dimension instead: visual in `redesign` mode (pixel similarity answers the wrong question) and any content *measurement* failure (fetch/parse) | `src/engine/evaluator.ts` |
| **Score aggregation** | Deterministic | Weighted mean at 25/25/25/25 over the dimensions that produced a score (weights renormalize when one is skipped or failed); grade at 90/75/60/40; `passedDimensions` = dimensions at 75+; `totalDimensions` = 4 minus skipped (failed ones stay in the denominator) | `src/engine/constants.ts`, `evaluator.ts` |
| **Report + artifacts** | Deterministic | Upload the screenshot, rewrite `visual.metadata.screenshot` to `{path, url}`, write the `eval_reports` row (`overall_score`, `dimension_scores`, full `report` JSON) and an `artifacts` row, publish the `eval-report` A2A artifact | `a2a-common` artifact store (R2 via S3 API or local), SQLite/D1 |

### Blend formulas, per dimension

| Dimension | Deterministic tier | Agentic tier | Final score |
|-----------|-------------------|--------------|-------------|
| Structure | Cheerio penalty score | Claude + Playwright MCP | 70% agentic + 30% deterministic |
| Accessibility | axe-core penalty score | Claude + Playwright MCP | 70% agentic + 30% deterministic |
| Content, `fidelity` / `redesign` | Jaccard similarity minus penalties | Claude + text tools | 70% agentic + 30% deterministic |
| Content, `quality` | Substance proxy | Claude, tool-free | 80% agentic + 20% deterministic |
| Visual, `fidelity` / `quality` | Pixel diff (or 100 with no baseline) | Claude vision | 70% agentic + 30% deterministic |
| Visual, `redesign` | Pixel diff runs for context only | Claude vision, both screenshots | 100% agentic; no deterministic fallback |

Note the consequence in `quality` mode (and `fidelity` with `sourceType: none`):
visual has no baseline, so its deterministic tier contributes a flat 100 and the
blend can only be pulled *down* by the vision pass.

## Scoring modes

`mode` rides on the payload and threads through `EvaluationRequest.mode` into the
orchestrator. Structure and accessibility are intrinsic (target only) in every
mode; only content and visual change behavior.

| Mode | Content dimension | Visual dimension | When the coordinator sends it |
|------|-------------------|------------------|-------------------------------|
| `fidelity` (default) | Source vs target text diff + semantic judgment. **Skipped** (excluded, weights renormalize) when `sourceType: none` | Target screenshot vs source screenshot (or PDF); regressions penalized | Evaluate-only routes, like-for-like migrations |
| `quality` | Target only: substance proxy + editorial judgment. Never skipped | Target screenshot only, intrinsic design quality; source ignored | Routes that *generated* the source (`route.includes("generate")`), where the synthetic source is a throwaway |
| `redesign` | Same source-aware path as `fidelity` (factual carryover matters) | Both screenshots reach the judge with the redesign-aware prompt; intentional design change is not a defect; agentic-only score | Migrate routes (`route.includes("migrate")`): replatform onto a new design system |

The rule lives in one line of `coordinator/src/executor.ts`:
`route.includes("generate") ? "quality" : route.includes("migrate") ? "redesign" : "fidelity"`.
The `redesign` visual prompt applies to webpage sources; a PDF source keeps the
PDF comparison prompt.

## What the report tells you (scoring honesty)

These were all added during the 2.0 hardening and are pinned by
[`e2e/tests-live/eval-quality.live.test.ts`](../e2e/tests-live/eval-quality.live.test.ts):

- **Every dimension result carries `metadata.mode`**: `agentic`, `deterministic-only`
  (no Claude auth configured), or `deterministic-fallback` (the agentic pass was
  attempted and failed; `modeReason` says why). "91" and "91 produced in fallback
  mode" are different facts, and the coordinator dashboard shows the badge next to
  the score.
- **Not-applicable is not zero.** `sourceType: none` skips the content dimension
  and renormalizes the weights instead of scoring it 0 at 25%. A dimension the
  caller left out of `dimensions` is recorded as skipped with a reason.
- **Measurement failure is not a verdict.** A screenshot that never rendered fails
  the visual dimension (it used to score 100 on a blank placeholder); a source
  fetch/parse error fails content. Failed dimensions are excluded from the score
  and surface as a `serious` report-level finding.
- **Different page heights still get compared.** Source and target screenshots
  are compared over the shared region with a capped size penalty, rather than
  refusing to compare (which used to mean a silent 100).
- **Prose-wrapped JSON no longer degrades a dimension.** A model reply that
  starts with "Based on the analysis..." used to fail `JSON.parse` and silently
  drop the dimension to its deterministic score; the extractor now slices the
  first balanced object out of the prose.
- **The judge is named up front.** The first `working` status message reads
  `evaluation started (mode: <mode>, judge: <model>)` so anyone comparing rows
  (the model matrix, for instance) can see the same judge scored every run.

### Report shape

The A2A artifact (`name: "eval-report"`) carries one data part:

```jsonc
{
  "overallScore": 88,
  "grade": "good",                       // excellent 90+ | good 75+ | acceptable 60+ | needs-improvement 40+ | critical
  "dimensionScores": { "structure": 91, "accessibility": 84, "content": 82, "visual": 95 },
  "report": {                            // the full EvaluationReport
    "request": { "migratedUrl": "...", "expectedUrl": "...", "mode": "quality" },
    "summary": { "overallScore": 88, "grade": "good", "passedDimensions": 4, "totalDimensions": 4 },
    "results": {
      "visual": {
        "score": 95,
        "findings": [ /* severity, issue, recommendation, details; strengths arrive as info findings */ ],
        "metadata": {
          "mode": "agentic",
          "deterministic": { "toolsUsed": ["playwright", "pixelmatch", "pngjs"], "durationMs": 4120 },
          "agentic": { "model": "claude-sonnet-4-6" },
          "screenshot": { "path": "screenshots/screenshot-....png", "url": "https://pub-....r2.dev/screenshots/..." }
        }
      }
      // structure, accessibility, content: same shape (no screenshot)
    },
    "findings": [ /* all dimension findings + skip/fail notices */ ],
    "metadata": { "createdAt": "...", "completedAt": "...", "durationMs": 61234, "version": "1.0.0" }
  }
}
```

The same report is stored verbatim in `eval_reports.report`, with
`overall_score` and `dimension_scores` denormalized for querying. The
`metadata.version` string is the engine label carried over with the copy, not
the platform version.

## Configuration

All read from `process.env` (no dotenv); `set -a; source .env; set +a` first.

| Variable | Default | Effect |
|----------|---------|--------|
| `PORT` | `4001` | A2A server port |
| `STORE_DB_PATH` | `./data/store.db` | SQLite task/report store (D1 in deploy via the Worker proxy) |
| `EVAL_ENGINE` | `real` | `stub` = no browsers, no API, random 70-99 scores; same event choreography (used by the fast e2e tier and CI) |
| `EVAL_CONCURRENCY` | `2` | Evaluations running at once |
| `BROWSER_PERMITS` | `3` | Service-wide cap on live Chromium instances |
| `EVAL_MAX_ATTEMPTS` | `3` | Retries per task (backoff 2 s, 8 s) |
| `CLAUDE_CODE_OAUTH_TOKEN` / `ANTHROPIC_API_KEY` | unset | Either enables the agentic tier; with neither, every dimension is `deterministic-only` |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Judge model for all four dimensions |
| `AGENTIC_TIMEOUT_MS` | `300000` | Per-dimension agentic deadline |
| `EVAL_PUBLIC_BASE` | `http://localhost:4001/artifacts` | Public base for the local artifact stand-in |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`, `R2_S3_ENDPOINT` or `R2_ACCOUNT_ID` | unset | All present = screenshots go to R2; any missing = local `./output` (all-or-nothing) |
| `PLAYWRIGHT_HEADED` | unset | `true` shows browser windows for the Playwright MCP passes (local debugging only) |
| `A2A_MESH_TOKEN` / `A2A_EDGE_TOKEN` | unset | Bearer for `/a2a` / for `/hooks/*`; unset = open (dev) |

## What changed from the 1.0 table

Reading the 1.0 breakdown against this one:

- **No agentic score aggregation and no agentic report generation.** 1.0 listed
  both as Claude tasks. In 2.0 the overall score is a weighted mean in
  `constants.ts`, and the "report" is the JSON artifact above; the coordinator
  dashboard renders it. Nothing an LLM says can move the final number except
  through its own dimension score.
- **Web UI / API routes and the batch orchestrator moved out.** This service has
  no UI; the A2A server, edge shim, and queue replace the Next.js routes, and
  fan-out/batching is the coordinator's job.
- **Deterministic tools got a floor of their own.** Each dimension's
  deterministic tier now produces a real score that stands alone when the
  agentic tier is unavailable, and the report says which happened.
- **One model, three modes.** The 1.0 engine had a single source-vs-target
  posture; 2.0 adds `quality` (born from the daily content loop, where the
  redesign succeeding used to tank fidelity-visual) and `redesign` (born from the
  model-matrix finding that fidelity-visual scored about 25 on every model
  purely for an intentional redesign).
- **Playwright in three places, all counted.** The deterministic `.cjs` scripts,
  the Playwright MCP server the Agent SDK spawns, and the per-dimension agentic
  passes all draw from the same `BROWSER_PERMITS` pool.

## Carried over from 1.0 but not on the 2.0 path

These exist in `src/engine/` because the engine was copied wholesale; the
orchestrator never calls them. Listed so nobody documents them as live behavior:

- `compareStructure`, `comparePDFToHTML` and `pdf-structure.ts`: structure is
  evaluated against the target only; there is no source-vs-target structure
  comparison in 2.0.
- `compareAccessibility`, `comparePDFToHTMLAccessibility` and
  `pdf-accessibility.ts`, plus the `accessibility-html-source.json` and
  `accessibility-pdf-source.json` prompts: the evaluator always invokes the
  accessibility agent with no source, so only `accessibility-no-source.json` is
  ever used.
- `constants.ts` still holds 1.0's `API_ENDPOINTS`, `STORAGE_KEYS`, and
  `AGENT_TIMEOUTS`; the timeouts that actually apply are the shell-out limits
  (60 s axe, 45 s screenshot) and `AGENTIC_TIMEOUT_MS`.

## Tests that pin this

- Fast tier (`npm run test:e2e`, stub engine, real servers on 14xxx ports):
  `task-lifecycle`, `edge-shim`, `push-notifications`, `persistence`,
  `agent-card`, `mesh-auth`, `browser-semaphore`, `extract-json`.
- Live tier (`npm run test:live`, real engine, no API key needed):
  `eval-engine.live.test.ts` (real Chromium, axe, screenshots) and
  `eval-quality.live.test.ts` (skip / fail / subset / size-mismatch semantics).
- The closed-loop and coordinator suites exercise `eval.run` end to end through
  the mesh.

## Files

```
eval-service/
  src/index.ts                 server bootstrap, engine pick, restart rebuild
  src/executor.ts              eval.run: validate -> queue -> runEvalJob -> persist + emit
  src/stub-executor.ts         EVAL_ENGINE=stub
  src/jobs/queue.ts            p-queue (EVAL_CONCURRENCY)
  src/browser/semaphore.ts     BROWSER_PERMITS
  src/engine/evaluator.ts      orchestrator: parallel dimensions, mode routing, blend, aggregate
  src/engine/agent-auth.ts     auth gate + agentic deadline
  src/engine/extract-json.ts   tolerant JSON extraction
  src/engine/mcp-config.ts     Playwright/filesystem MCP server paths + flags
  src/engine/constants.ts      weights, grade thresholds
  src/engine/agents/<dim>/     deterministic.ts + agentic.ts per dimension
  src/engine/prompts/*.json    11 prompt templates
  src/engine/types/            EvaluationRequest / EvaluationReport
  scripts/*.cjs                Playwright shell-outs (must stay .cjs under "type": "module")
```
