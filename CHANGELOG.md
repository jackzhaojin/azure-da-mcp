# Changelog

Meaningful history of this monorepo, grouped by **minor version** (patch releases are folded into their minor line). Versioning is lockstep SemVer, tagged from `main` (see [RELEASES.md](./RELEASES.md)).

Two release lines:

- **v2.x** = the `agents/` A2A platform (the active line, deployed to Cloudflare Workers + Containers on `v2.x+` tags)
- **v1.x** = the legacy `content-authoring-eval` app (deprecated, frozen backup on Oracle; `v1.*` tags only)

---

## 2.9 (2026-09-05)

Tags: `v2.9.0` - agent memory (the self-improvement loop from the talk's "Core Capabilities" slide, restored from v1), `v2.9.1` - the two-tier memory page, `v2.9.2` - evidence that the block library and memory are actually used, `v2.9.3` - the evidence fix for Cloudflare.

- **Re-assessment on v2.9 (2026-09-08)**: the 2026-08-29 five-model matrix re-run with agent memory on - same source, same judge (`claude-sonnet-4-6`), same `redesign` mode. Every model held or improved: K3 88 to 90, K2.7 85 to 88, Claude Sonnet 5 84 to 88, Claude Opus 5 86 to 90, Claude Haiku 4.5 84 to 84; the lift is in Structure (82-90 to 90-95), where the memory rules live. All five read the whole memory page (11605 chars, 5 episodic entries) and opened the block-library page of every block they authored; four of five applied all eight memory rules. Report: [ai-docs/2026-09-08-model-assessment-with-memory/](./ai-docs/2026-09-08-model-assessment-with-memory/). Harness (`npm run model-matrix`) now threads `memoryPath` + `DALIVE_MCP_URL`, records the evidence per row (a second table in `results.md`), keeps it across `--eval-only` re-scores, and takes `--no-memory` for a controlled A/B.
- **2.9.3 (2026-09-05) - evidence hotfix.** The first v2.9.2 run on the mesh logged `K3 → webfetch` with no target and recorded zero reads: the opencode event tap read the tool input only from the first `running` update of a tool part, and on Cloudflare that update arrives before `state.input` is populated (locally it is already there, which is why the local proof passed). The tap's rules now live in `migration-agent/src/backends/opencode-events.ts` (`createToolTracker`, pure and unit-tested with the real part shapes): one note per tool part keyed by part id, the read target captured from ANY update of the part, a read tool's note deferred until its target is known (or the part completes), errors once. Also found on that run: the migration container was replaced by the rollout mid-turn and its task sat `working` past its cap while the coordinator polled for the whole 50-minute recovery window - the migration agent has no boot-time policy for orphaned opencode/sdk tasks (filed as a follow-up; the Make.com callback-after-restart path must keep working).

- **2.9.2 (2026-09-05) - usage evidence.** Until now the run log proved the memory page was in the prompt, but nothing showed whether the model opened the block library or applied a rule: tool notes carried the tool name only. Now the opencode and sdk backends log the TARGET of every read-type tool call (`K3 → webfetch https://…/ai-content/blocks/hero`, `K3 → dalive_get_dalive_content /source/…`) and classify those targets against the run (`migration-agent/src/usage.ts`): source, reference page, block-library index, individual block pages (which blocks were looked at), memory. The `migration-report` artifact gains `usage` (`reads` counts, `blocksLookedAt`, distinct `urls`, plus the model's self-reported `memoryApplied` and `referencesConsulted` from two new `FINAL_REPORT` fields); the backend emits one evidence line per run (`evidence — block library: index + 3 block page reads (hero, stats, author-bio) · reference page ✓ · memory: applied 2 rules`), the coordinator forwards it into the run's live activity and persists it on the branch, and the dashboard shows an "Evidence: what the migrator read" panel per branch plus a rules-applied count on the Memory card. The prompt's step 2 was sharpened (not a new step): open the block-library page for each block you are about to author - the library is the canonical definition on THIS site, memory only summarizes, a block authored from memory of another site renders wrong here. Verified locally before deploy: a K3 migration (92) proved the opencode event-tap path (7 memory rules applied), and a Claude `sdk` migration with the sharpened wording opened the library page of every block it authored (`blocksLookedAt: hero, stats, quote, author-bio`), then a K3 run on the mesh after.

- **2.9.1 (2026-09-05) - two-tier memory.** The memory page is now curated knowledge first, run log second: an **"Approved memory (condensed, human-curated)"** section - site facts (every block variant from the library, the canonical article's block order and exact cell shapes, the metadata keys the reference sets), what has worked (the 89-92 recipe), what has not (recurring evaluator findings from the last 7 real runs: placeholder links, missing og:type, the h1-to-h3 heading skip, truncated closing sections, mismatched alt text), evaluator findings the migrator cannot fix from a document (site chrome) so it stops spending turns on them, Playwright fallback guidance, and real-source migration rules learned from the Katie's Travel Journal runs - followed by an **"Episodic memory (append-only run log)"** section. `eval.reflect` now appends INSIDE the episodic section (an `<h3>` block, no new da.live section per run; falls back to the old append-a-section when a page has no episodic heading), the migration prompt carries the **whole page** (`MEMORY_PROMPT_MAX_CHARS` default 7k → 30k; the head+tail excerpt is only a safety net), and the reflect prompt knows the two tiers (never restate or contradict approved memory; emit lessons worth promoting). Compaction of episodic → approved is a separate, later process - the page shape is ready for it. The page content itself was hand-authored and saved to da.live (`/ai-content/memory`), keeping the seeded block-library line and the first run entry.

- **Agent memory lives in da.live again.** v1's Make.com prompt read and wrote an `agent-memory` page; v2 had lost that. The site's memory is now an ordinary da.live document (`adapt-to-2026-demo` → [`/ai-content/memory`](https://da.live/edit#/jackzhaojin/adapt-to-2026-demo/ai-content/memory), seeded by hand with the block-library pointer) that **the migration agent reads before every run and the eval agent appends to after every scored run**. Humans edit it directly; agents only ever append.
  - **Read (migration agent)**: `migration.run.v1` gains `memoryPath`; the `opencode`/`sdk`/`dryrun` backends fetch the page through the deployed da.live MCP (no model turn spent), inject it into the prompt as a `MEMORY` section (head + newest entries, capped at ~7k chars), and report how memory was used on the artifact (`memory: loaded|empty|skipped|error`). Never fatal - an unreadable page is a note, not a failed migration. The model now also returns `lessons` in its `FINAL_REPORT` (what the NEXT migration should do differently).
  - **Write (eval agent, new skill `eval.reflect`)**: after the branches are scored, the coordinator sends one `eval.reflect` per run (never per branch - fan-out would race on the page) with the migration report(s) + the severity-ranked eval findings. Claude (`claude-sonnet-4-6`, tool-free, `REFLECT_MODEL`) distils **0-3 new, generalizable rules** that are not already in memory; without creds it falls back to the migrator's lessons + the recommendations behind serious/critical findings. One dated section is appended (score line, preview + run links, summary, `Rule:` bullets), re-reading the page right before the save. Dryrun migrations are skipped so memory never fills with simulated runs; an in-flight reflect is never replayed after a restart (append-only).
  - **Block library**: the migration prompt now describes `blockLibraryUrl` as what it is - the index linking one showcase page per block (hero, columns, quote, gallery, cards, stats, table, accordion, newsletter, author-bio) - and tells the model to GET a block page only when it needs the exact shape.
  - **Dashboard**: a Memory card on the run detail (rules appended, tier/model, link to the page; or why nothing was written) and per-branch memory-read status, migrator lessons, and gaps. `runs.stats.memory` persists the outcome; the daily-loop GitHub summary gets a Memory row.
  - **Plumbing**: `a2a-common` gains a stateless da.live MCP client (`dalive.ts`, `tools/call` with the server's S2S auth) and the memory page module (`memory.ts`: HTML→prompt text, append-only entry writer). Memory is enabled only where `DALIVE_MCP_URL` is set explicitly (the fast e2e tier strips it, so tests never touch the real page); the eval container now receives it in `deploy/src/index.ts`. Site profiles carry `memoryPath`; `coordinate.run.v1` accepts a per-run override. Covered by `e2e/tests/memory.e2e.test.ts` + two new closed-loop cases (81 fast tests green).

## 2.8 (2026-08-29 to 2026-09-02)

Tags: `v2.8.0` (the model-assessment release, built for the adaptTo() talk's "Model and Prompt Comparison" slide), `v2.8.1` (Kimi empty-assistant hotfix).

- **2.8.1 (2026-09-02) - daily loop reliability.** From 2026-08-24 the daily loop failed on 4 of 10 days (both attempts) with a non-retryable Kimi 400, `the message at position N with role 'assistant' must not be empty`. opencode replays the whole session history on every agentic step, so one empty K3 turn (a stop with no content, or an aborted step persisted with no visible parts) bricked the migration mid-authoring; the eighth failure was an SSE read timeout. Upstream: anomalyco/opencode #37946, #46577, #46881, PR #45839 (unmerged). Fix, in `agents/migration-agent`:
  - **Kimi wire-repair proxy** (`src/backends/kimi-proxy.ts`): a tiny in-process HTTP proxy between `opencode serve` and `api.kimi.com`; the generated `OPENCODE_CONFIG` points `provider.kimi-code.options.baseURL` at it. It drops exactly the shape Kimi rejects (assistant with no text, no `tool_calls`, no `reasoning_content` - probed directly against K3) and streams everything else through untouched. Version-independent of opencode. Covered by `e2e/tests/kimi-proxy.e2e.test.ts` (real sockets, fake upstream speaking the Kimi wire shape).
  - **Same-session continuation**: when a turn still dies on a provider error, the backend sends one follow-up message into the same opencode session (within the original turn budget) instead of failing the task, so the pages already authored on da.live are finished rather than abandoned. `OPENCODE_MAX_CONTINUATIONS` (default 1).
  - **opencode pinned to 1.18.25** in `migration.Dockerfile` (was unpinned = newest at every image build) and `autoupdate: false` in the baked global config (opencode self-installs patch releases at startup).
  - `/health` on the migration agent now reports `opencodeVersion` and `kimiProxy` (base, upstream, requests, sanitized, dropped, upstream errors) - the blind spots that made this hard to see from outside.
  - The 9 failed daily-loop runs (2026-08-24 to 2026-09-02, all score 0, no child `tasks` rows) are pure noise on the dashboard; they are deleted by hand with one guarded `delete from runs where …` through the Worker's `/d1/query` (rows backed up first). Nothing else changes in D1.

- **`sdk` migration backend is now real** (it had been an M3 stub): the Claude Agent SDK drives the same migration prompt, `da-live-author-playwright` skill, and da.live/Playwright MCP servers as the opencode/Kimi backend. Auth via subscription OAuth (`CLAUDE_CODE_OAUTH_TOKEN`), per-run Claude model via the payload (`claude-sonnet-5`, `claude-opus-5`, `claude-haiku-4-5`, or aliases).
- **Model-matrix benchmark harness** (`npm run model-matrix` in `agents/`): runs the same migration + eval across N models sequentially, with resume/merge, `--eval-only` re-scoring, and per-row eval-report evidence. Docs in `agents/docs/model-matrix.md`.
- **New eval mode `redesign`** for replatform migrations: content stays source-aware, but visual judges content carryover (45) + new-template execution (35) + editorial polish (20) from both screenshots, agentic-only, with no deterministic fallback. Fixes fidelity mode punishing the intentional redesign (visual ~25 on every model; K3's page went 26 to 88 with zero page changes). Coordinator route map: generate routes use `quality`, migrate routes use `redesign`, evaluate-only stays `fidelity`.
- **Claude Agent SDK upgraded 0.1.77 to ^0.3.251** (all three workspaces; `@anthropic-ai/sdk` to ^0.93 for the peer dep). 0.1.77 emitted duplicate `tool_use` ids on parallel MCP calls, which silently degraded 3 of 4 agentic eval dimensions to deterministic fallback. All 4 dimensions are agentic again.
- **Assessment shipped**: [ai-docs/2026-08-29-model-assessment/](./ai-docs/2026-08-29-model-assessment/) - one run per model, same judge (`claude-sonnet-4-6`), redesign mode. Result: **Kimi K3 88** > Claude Opus 5 86 > Kimi K2.7 85 > Claude Sonnet 5 84 = Claude Haiku 4.5 84. K3 confirmed as the migration default (it already was, since 2.5.2).

## 2.7 (2026-08-18)

Tags: `v2.7.0` - the guidance channel (issue #13).

- **Migration guiding-principles channel**: per-run guidance (dashboard field) + per-site-profile principles merge into the migration prompt, so editorial rules travel with the run instead of living only in prompt code.
- **Image-quality rule** ships as the default guiding principle for the `adapt-to-2026-demo` site profile.
- `v2.6.1` is the pre-feature anchor tag for before/after comparison.

## 2.6 (2026-08-02 to 2026-08-18)

Tags: `v2.6.0`, `v2.6.1` - the migrate-a-real-page lane.

- **"Migrate a real page" dashboard lane**: paste one or many source URLs (fan-out = one branch per URL), override the target folder, and pick the Kimi model per run.
- Established the stage-demo setup: Katie's Travel Journal as the legacy source site, dated `travel-journal-*` target folder convention.
- 2.6.1: legacy-site-to-new-platform migration demo assets.

## 2.5 (2026-06-27 to 2026-08-02)

Tags: `v2.5.0`, `v2.5.1`, `v2.5.2` - eval honesty for generated content + Kimi model agility.

- **New eval mode `quality`** (`eval.run.v1` gains `mode`, default `fidelity`): scores a page on its own merits (intrinsic editorial quality + intrinsic design) instead of against the throwaway synthetic source. The coordinator sends it for any route that generated its own source. Validated live: the same article went 67 (fidelity) to 89 (quality).
- 2.5.1: migration timeouts extended for longer agentic turns; the opencode backend **resolves the real Kimi model name at runtime** instead of hardcoding "K2.6" (`kimi-for-coding` is a moving alias - it had silently become K2.7).
- 2.5.2: **per-run Kimi model selection**; the daily loop defaults to **K3**.

## 2.4 (2026-06-27)

Tags: `v2.4.0` - the Wilderness Journal retarget.

- **Retargeted the whole platform** off the retired `da-live-postal-2025-07` site to the **`adapt-to-2026-demo` "Wilderness Journal"** EDS site (the adaptTo() Sept 2026 demo target).
- **Per-site profiles** (`coordinator/src/site-profiles.ts`): editorial lane, voice, target folder, reference corpus, and prompt pattern keyed by site.
- **Content IA split**: `/ai-content/**` is the hand-built reference corpus the migrator learns from (never written by agents); AI drafts land in `/ai-articles/**`.
- Wilderness editorial lane + a real photo pool (real hero images instead of placeholders); article-pattern migration prompt modeled on `/ai-content/stories/chasing-sunsets`.
- **Deprecations**: `content-authoring-eval/` and `agent-claude-sdk/` officially deprecated (the former stays running as the frozen v1.x backup, D5).

## 2.3 (2026-06-25 to 2026-06-26)

Tags: `v2.3.0`, `v2.3.1` - content quality + CI deploy.

- **Agentic content backend**: content-gen writes compelling synthetic source pages with real Claude instead of lorem-style templates; rich typed feature blocks ported from the v1.0 block model.
- **Cloudflare CI deploy**: `.github/workflows/deploy-agents.yml` builds all four container images and runs `wrangler deploy` on `v2.x+` tag pushes (this and every later release deploys through it).
- Timeout budget realism: longer migration turns, longer coordinator recovery windows, Make.com callback 25m to 40m.
- 2.3.1: slimmed the agentic content + migration prompts to fit the 20-minute budget.

## 2.2 (2026-06-18)

Tags: `v2.2.0` - the agentic daily loop.

- **Daily content loop on GitHub Actions cron**: pre-warm, agent-led topic ideation (new `content.ideate` skill), full loop, preview - a fresh Wilderness Journal article every day with no human trigger, with self-heal retry.
- Dashboard sign-in opened to any Google account (issue #7).
- Agent-human collaboration thesis documented in [ai-docs/2026-06-17-v2.2-agentic-loop/](./ai-docs/2026-06-17-v2.2-agentic-loop/).

## 2.1 (2026-06-16)

Tags: `v2.1.0` - the hardening sprint + v1 UI parity.

- **Eval scoring honesty**: no fabricated 100s/0s - failed screenshots fail the visual dimension, missing sources exclude the content dimension with weight renormalization, and every dimension records its mode (`agentic` / `deterministic-only` / `deterministic-fallback`).
- **Coordinator dashboard reaches v1.0 eval-app parity**: single/bulk/direct-eval lanes, sample downloads, JSON export, live branch grid, failure reasons, evidence panel. The separate `agents/ui` app was retired and deleted.
- **Bulk source-to-target eval** (v1-parity comparison for PDF/webpage sources), backend-owned.
- Tolerant JSON extraction for agentic scorers (prose-wrapped JSON no longer silently zeroes a dimension).
- **Domain migration**: the mesh moved from `*.xpri.ai` to `content-factory*.jackzhaojin.com` (Cloudflare-native zone).
- E2E env-proofing (spawned agents get sanitized env) and narrated demo-video tooling.

## 2.0 (2026-06-11)

Tags: `v2.0.0` - the A2A platform itself, built June 5-10 and deployed to Cloudflare.

- **Ground-up re-architecture**: a mesh of four independently-addressable A2A agents (coordinator :4004, eval :4001, content-gen :4002, migration :4003), each its own Express server on the official `@a2a-js/sdk`, sharing the `a2a-common` chassis (Agent Cards, task lifecycle, streaming, push notifications, mesh auth, edge webhook shim).
- **The closed loop**: generate a synthetic legacy page, migrate it into da.live, evaluate the result across 4 dimensions, fan out and aggregate variance. Routes compose (`evaluate` / `migrate` / `generate+migrate` / `full-loop` / `auto`).
- **Multi-vendor proof**: the migration facade's `opencode` backend put **Kimi K2.6** behind the same contract as the Make.com and dryrun backends - a non-Anthropic model authoring real da.live pages, judged by a Claude-powered eval.
- **Eval engine decoupled** from the frozen v1 app: job-queued, browser-pooled, restart-rebuilding, reports persisted, screenshots to R2.
- **Coordinator dashboard** (Next.js 15 on the coordinator's own port) with Google SSO and per-user runs.
- **M5 Cloudflare deploy (2026-06-10)**: Workers + Containers, D1 via a Worker-proxied query endpoint (containers get no bindings), R2 artifacts, scale-to-zero sleep. Cloud acceptance: a Kimi-authored real page scored 91 by the in-container agentic eval.
- `store-mcp` (conversational store queries over stdio MCP), three real-server test tiers plus a cloud tier, and the Oracle deploy workflow scoped to `v1.*` tags so the two lines can never cross.

## 1.1 (2026-06-05)

Tags: `v1.1.0` - the last v1-line feature release, focused on `functions/` auth.

- **Server-side Adobe IMS S2S auth** in the MCP server, with per-request caller override (`bearerToken` accepted in tool-call args and advertised in tool schemas) - header-less clients can now write to da.live.
- `da-live-author-playwright` skill: block/metadata operations, EDS-spec metadata table form, external-image auto-ingestion documented.
- `hlx-admin/` joined the monorepo: auditable AEM admin API execution logs.

## 1.0 (2026-01-01 to 2026-05-14)

Tags: `v1.0.0` through `v1.0.7`. The founding line, tagged after ~150 commits of initial development (Oct to Dec 2025).

- **The original products**: the Azure Functions MCP server for da.live authoring (`functions/`), the `content-authoring-eval` Next.js migration evaluator (4-dimension scoring, deployed to Oracle Cloud via Docker), Make.com migration prompts, and the Agent SDK experiments (`agent-claude-sdk/`), including blog static-site and PDF generators.
- `list_dalive_content` MCP tool; open-source preparation pass.
- **Release strategy pivot** (1.0.2, 2026-05-12): dropped the `release/1.0` branch model for trunk-based tagging from `main`.
- 1.0.3 to 1.0.7: Docker/Playwright deployment hardening on Oracle (dual Chromium installs, separate browser caches, correct node_modules roots) - lessons that later saved the v2.0 container deploy.

---

Maintenance note: when cutting a release, add or extend the minor-version section here in the same commit as the version bump. Details worth recording: what shipped, why, and any migration/ops steps. Per-tag notes stay on [GitHub Releases](https://github.com/jackzhaojin/azure-da-mcp/releases).
