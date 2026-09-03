# CLAUDE.md — agents/migration-agent

**Purpose**: A2A migration agent — a **facade** exposing ONE Agent Card (`migration.run`) over swappable backends that author a source (PDF/webpage, incl. synthetic) into a da.live EDS page and self-validate. **Tech**: Express + `@a2a-js/sdk@0.3.13`, `@agents/a2a-common`, SQLite/D1 · **Port**: 4003 · **Status**: `dryrun` works · `makecom` fully implemented (needs only tunnel + scenario URLs) · **`opencode` (Kimi) implemented + verified end-to-end against real da.live (2026-06-08)** · **`sdk` (Claude via Agent SDK, OAuth) implemented 2026-08-29** — same prompt/skill/MCP servers as opencode, per-run Claude model; powers the model-matrix benchmark (`agents/docs/model-matrix.md`). v2.0 of the platform — **v1.1.0 = the frozen `content-authoring-eval/`, do not touch it (D5)**.

Platform context: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) · original PRD [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) · sibling agents in [`agents/README.md`](../README.md).

## When to work here
- The `migration.run` skill (contract `agents/contracts/migration.run.v1.json`): one card, one contract, backend is an impl detail.
- Adding/changing a backend (the seam is the point: "Claude vs Kimi on the same 10 migrations" with no contract change).
- The Make.com async round-trip (webhook out → callback in) and its restart-tolerance.
- NOT for the coordinator, eval, content-gen, or UI — those are sibling workspaces.

## Key files
- `src/index.ts` — server bootstrap; `shimAgentId: "migration"`; registers `extraRoutes` → **`POST /callbacks/makecom/:taskId`** (bearer-gated by the edge token): resolves the in-process waiter, OR (post-restart) completes the task **directly from the store**.
- `src/executor.ts` — facade executor: extract → `validate` → pick backend (`payload.backend ?? MIGRATION_DEFAULT_BACKEND`) → `assertConfigured()` → `backend.run()` → emit `migration-report` artifact + `completed`. Unknown backend / config error → `failed` with a setup hint.
- `src/callbacks.ts` — in-memory pending-callback registry. `waitForCallback(taskId, timeoutMs)` parks a promise; `resolveCallback(taskId, report)` returns `true` iff an in-process waiter consumed it. In-memory by design — the store path covers process death.
- `src/backends/types.ts` — `MigrationRunPayload`, `MigrationResult`, the `MigrationBackend` seam (`assertConfigured()` + `run()`).
- `src/backends/dryrun.ts` — simulation, $0, deterministic per `pageSlug`. **Returns `previewUrl = sourceLocation`** (perfect simulated migration → downstream eval has a real reachable page). Default until the tunnel exists.
- `src/backends/makecom.ts` — **PRIMARY**. POSTs `MAKECOM_WEBHOOK_URL`, parks a waiter, completes on the callback.
- `src/backends/sdk.ts` — **Claude Agent SDK backend (Backend B)**. Same `buildMigrationPrompt` + `da-live-author-playwright` skill + dalive/playwright MCP servers as opencode — only the harness differs (Claude Code's agent loop via `@anthropic-ai/claude-agent-sdk`, `permissionMode: bypassPermissions`). Auth: `CLAUDE_CODE_OAUTH_TOKEN` (subscription) or `ANTHROPIC_API_KEY`. Model: `payload.model` ("sonnet"/"opus"/"haiku" or a full id) else `CLAUDE_MIGRATION_MODEL` (default sonnet). The skill is loaded by seeding a tmp workspace's `.claude/skills` + `settingSources:["project"]` (cwd stays OUT of the repo so no monorepo CLAUDE.md leaks into the run). Deadline `SDK_MIGRATION_TIMEOUT_MS` (40 min), `SDK_MIGRATION_MAX_TURNS` (150).
- `src/backends/opencode.ts` — **Kimi K2.6 backend (Backend C)**. Long-lived `opencode serve` singleton (lazy, reused across tasks); one A2A task = one opencode session. Spawns serve with `OPENCODE_CONFIG`→ a generated config that wires the da.live MCP (deployed, S2S self-auth) + Playwright MCP + the reused `da-live-author-playwright` skill, `permission:"allow"`. Taps the server's SSE `/event` stream → `onProgress` (tool + skill firing) and parses the model's `FINAL_REPORT` into a `MigrationResult`.
- `src/backends/opencode-config.ts` — config builder (`buildOpencodeConfig`), path resolution (`repoRoot`, `resolveSkillsPath`, `playwrightOutputDir`), `DEFAULT_DALIVE_MCP_URL`, `opencodeSetupProblem()`.
- `src/backends/opencode-prompt.ts` — `buildMigrationPrompt` (declares the context PRE-CONFIRMED so the headless run skips the SKILL.md confirmation gate; since v2.4 adds a concise **article-pattern** recipe — Theme `paper`/Template `article`, hero/stats/quote/author-bio — gated on `payload.pattern === "article"`, and points the "GET one reference page" step at `payload.neighborPageUrl`), `migrationTargets` (deterministic folder/URLs — honors an explicit `payload.folder` verbatim, e.g. `ai-articles`, else the `migration-batch-opencode*` default), `parseMigrationReport` (tolerant JSON parse + fallbacks).
- `src/backends/kimi-proxy.ts` - **Kimi wire-repair proxy (v2.8.1)**: an in-process HTTP proxy between `opencode serve` and `api.kimi.com` (the generated config points `provider.kimi-code.options.baseURL` at it). Drops the one assistant-message shape Kimi rejects with a non-retryable 400 (no text, no `tool_calls`, no `reasoning_content`), streams everything else through, logs what it repaired; `kimiProxyStatus()` feeds `/health`. Tested by `e2e/tests/kimi-proxy.e2e.test.ts`.

## Gotchas / non-obvious  ← READ THIS
- **Default backend is `dryrun`, NOT makecom** — `MIGRATION_DEFAULT_BACKEND` overrides. PRD's eventual default is makecom, but the scaffold ships dryrun so the closed loop is runnable without the tunnel. Per-call override: `payload.backend`.
- **Make.com needs the `cloudflared` tunnel.** The scenario runs in the cloud and must reach our callback. Set `MIGRATION_CALLBACK_BASE` to the tunnel hostname (`a2a.jackzhaojin.com` → `:4003`); the callback URL is `${MIGRATION_CALLBACK_BASE}/callbacks/makecom/{taskId}`. Locally it defaults to `http://localhost:4003`.
- **Field rename in the webhook mapping: `site` → `siteName`.** The webhook body POSTs `siteName: payload.site` (matching the scenario's `{{5.*}}` runtime var). The contract field stays `site`. Watch this when editing the Make.com mapping — 10 fields total incl. `callbackUrl` + `taskId`.
- **The waiter is parked BEFORE the webhook fires** — no race with a fast scenario. `MAKECOM_TIMEOUT_MS` defaults to 25min (scenarios run long; the callback design avoids the 300s scenario-timeout fight).
- **Callback path is restart-tolerant (two paths).** Normal: `resolveCallback` hands the report to the parked waiter, the executor completes the task. Post-restart: waiter is gone → the route completes the task **from the store** (409 if already terminal, 404 if unknown). A Make.com run outliving our process still lands (sleep-tolerance rule).
- **`/callbacks/*` is bearer-gated by the edge token** (`A2A_MESH_TOKEN` / edge token). Missing/wrong `Authorization: Bearer …` → 401.
- **`dryrun` confidence is deterministic** from a slug hash (80–97), `PASS` ≥ 85 else `NEEDS-REFINEMENT` — fan-out variance tests rely on this.

### opencode / Kimi K2.6 backend (Backend C) — gotchas
- **Headless path is `opencode serve` + REST, NOT `opencode run`** — `run` emits no body for this reasoning model in v1.16.2 (see `references/kimi/`). We POST `/session` then `/session/:id/message` and watch `/event`.
- **Config goes in via `OPENCODE_CONFIG` (a generated file), merged ON TOP of the user's global `~/.config/opencode/opencode.jsonc`** — the global config holds the `kimi-code` provider + the `$MOONSHOT_API_KEY` Kimi-For-Coding key; ours only adds `mcp` + `skills` + `permission` + the model pin. `OPENCODE_CONFIG_CONTENT` (inline) is fiddly to quote — prefer the file. Verify it loaded via `GET /config` (`mcp keys` must be non-empty); `GET /mcp` shows `{dalive:{status:"connected"}}`.
- **MCP tool names are `<server>_<tool>`** — e.g. `dalive_save_dalive_content`, `playwright_browser_navigate`. The skill is invoked via the built-in `skill` tool.
- **`permission:"allow"` (blanket) so a headless run never blocks** — opencode otherwise emits permission events on `/event` that nobody answers. MCP timeout is bumped to 120s (the 5s default is too short for preview-publish + first-call S2S mint).
- **Skill discovery**: opencode scans `~/.claude/` + `~/.agents/` by default, but the repo skill is NOT there — we point `skills.paths` at `<repo>/.claude/skills` (absolute). The skill itself is host-agnostic and reused verbatim (skill-as-a-service).
- **da.live auth = none needed**: the deployed `functions/` MCP self-authenticates via its own S2S technical account (anonymous inbound). Set `DALIVE_BEARER_TOKEN` only to attribute writes to a real user, or point `DALIVE_MCP_URL` at a local `functions/` (`:7071`) running YOUR S2S creds (`functions/local.settings.json`).
- **Confirmation gate**: SKILL.md says "ask first, act second" — fatal headless. The prompt declares the context pre-confirmed; keep that if you edit the prompt or the agent will stall waiting for a human.
- **`MOONSHOT_API_KEY` must be in the agent's env** — it's exported from `~/.zshrc`, so launch `npm run dev:migration` from an interactive shell (or put it in `agents/.env`).
- **The model is `KIMI_MODEL_ID` (env), default `kimi-for-coding` — a MOVING ALIAS, not a version.** Moonshot re-resolved it K2.6 → **K2.7 Coding** server-side with no deploy on our side, so never hardcode a version in a label; `resolveKimiModelLabel()` asks `GET /coding/v1/models` for the real `display_name` (cached per process, falls back to `"Kimi"`, surfaced on `/health` as `kimiModelResolved`). Other models on this key: `k3`, `k3-256k` (both expose `think_efforts` low/high/**max**, default high), `kimi-for-coding-highspeed`. **Swapping is TWO edits, and forgetting the second fails at message time, not boot**: the env var *and* a matching entry in opencode's `provider.kimi-code.models` map — `~/.config/opencode/opencode.jsonc` locally (untracked!), `deploy/docker/opencode-global.jsonc` in cloud (baked into the image, set via the `KIMI_MODEL_ID` var in `wrangler.jsonc`). opencode never reads the provider's `/models` catalog for custom providers. Local A/B: `KIMI_MODEL_ID=k3 npm run test:live -- tests-live/opencode-migration.live.test.ts`.
- **The blocking agentic-turn POST routinely exceeds 5 minutes** — only survivable because `a2a-common/src/net.ts` disables undici's 300s timeouts process-wide (the standalone live test once passed at 248s purely by luck; a 10-min K2.6 turn through the coordinator died at exactly 5:01 before the fix). If you see `TypeError: fetch failed` at ~301s, something stopped importing a2a-common.
- **Kimi bricks a session on ONE empty assistant turn - the proxy is what keeps the daily loop alive (v2.8.1).** From 2026-08-24 K3 runs died ~40% of days with `the message at position N with role 'assistant' must not be empty` (400, `isRetryable:false`): opencode replays the full history every step, so an empty turn (K3 stop with no content / aborted step) poisons every later request. Probed against K3: `content:""`+`tool_calls` OK, `content:""`+`reasoning_content` OK, `content:" "` OK, `content:""` alone → 400, `content:[]` alone → 400. `kimi-proxy.ts` drops exactly that shape. `KIMI_PROXY_DISABLED=1` bypasses it (debug only). If the 400 ever reappears, check `/health` → `kimiProxy` (null = not wired) and the boot log line `routed through the wire-repair proxy`. Upstream: anomalyco/opencode #37946 #46577 #46881, PR #45839.
- **A provider-side turn error gets ONE same-session continuation** (`OPENCODE_MAX_CONTINUATIONS`, default 1; never with <4 min left of `OPENCODE_MIGRATION_TIMEOUT_MS`): the backend posts a follow-up into the same opencode session ("continue where you left off, end with FINAL_REPORT") - the da.live pages already authored survive. The daily loop's own retry (new run, new session) stays as the outer safety net.
- **opencode is PINNED (1.18.25) in `deploy/docker/migration.Dockerfile` and `autoupdate:false` everywhere** (baked global config + the generated config). Before v2.8.1 the image took whatever `opencode.ai/install` served at build time and opencode auto-installed patch releases at startup, so the running version was unknowable - `/health` now reports `opencodeVersion`. Bumping = change `OPENCODE_VERSION`, run the opencode live test, redeploy.

## Run / test
```bash
cd agents && set -a && source .env && set +a   # MAKECOM_WEBHOOK_URL, MIGRATION_CALLBACK_BASE, A2A_MESH_TOKEN
npm install
npm run dev:migration            # :4003 (dryrun backend by default)
npm run typecheck
npm run test:e2e                 # incl. migration-agent (dryrun contract, per-slug determinism,
                                 #   makecom/unknown/invalid failure paths) + makecom-roundtrip
                                 #   (fake Make.com on the wire protocol; callback-after-restart)
```
Smoke (dryrun, edge shim):
```bash
curl -X POST localhost:4003/hooks/migration/migration.run -H 'Content-Type: application/json' \
  -d '{"sourceType":"webpage","sourceLocation":"https://example.com","site":"demo","owner":"me","pageSlug":"hello"}'
```
opencode / Kimi K2.6 (writes a REAL da.live page — needs `MOONSHOT_API_KEY` in env):
```bash
# live e2e: the "can it actually migrate a page" acceptance (opt-in; writes to da.live)
cd agents && set -a && source .env && set +a
DALIVE_TEST_OWNER=jackzhaojin DALIVE_TEST_SITE=adapt-to-2026-demo \
  npm run test:live -- tests-live/opencode-migration.live.test.ts
# or per-call: send migration.run with {"backend":"opencode", ...} to :4003
```
Verified 2026-06-08 against `da-live-postal-2025-07` (now retired): skill + `dalive_*` + `playwright_*` all fired, page authored → preview-published → validated, result PASS. Current target is **`adapt-to-2026-demo`** — the deployed da.live MCP's S2S technical account must be a **writer** on that site (a 401 in the report = it isn't; grant it).

## Conventions
- **Contract `migration.run.v1`** requires: `sourceType` ∈ {`webpage`,`pdf`}, `sourceLocation` (http/https URL), `site`, `owner`, `pageSlug`. Optional: `folderPostfix`, **`folder`** (explicit target folder, verbatim — e.g. `ai-articles`; overrides the `migration-batch-*` default and keeps the URL clean), `blockLibraryUrl`, **`neighborPageUrl`** (a best-practice exemplar page the migrator GETs + mimics), **`pattern`** (`article` | `generic`; `article` authors a journal article — Theme `paper` + Template `article`, hero/stats/quote/author-bio), **`guidance`** (free-text operator guiding principles appended to the opencode prompt — e.g. the issue-13 image-quality rule; unsatisfiable principles land in the report's `gaps`, other backends ignore the field), `backend`, `maxRefinementIterations`, `runId`, `labels`.
- **IA convention (`adapt-to-2026-demo`)**: generated drafts go to **`folder: "ai-articles"`** (clean `/ai-articles/<slug>`); the migrator's reference (`blockLibraryUrl`/`neighborPageUrl`) points at the curated `/ai-content/**` corpus, which agents never write to. The coordinator derives all of this from `coordinator/src/site-profiles.ts`.
- **Real tests, no mocks** (D-philosophy) — the makecom test stands up a fake Make.com speaking the exact wire protocol over real HTTP.
- Local SQLite = the same SQL as Cloudflare D1 (`a2a-common/migrations/`); store at `data/store.db`. Node 20.
- New backends register in `src/executor.ts`'s `BACKENDS` map — same seam, different runtime (`opencode`/Kimi is the proof: a non-Anthropic model vendor behind the identical contract).
- Never edit `content-authoring-eval/` (D5). This workspace is the live one.
