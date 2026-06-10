# CLAUDE.md — agents/migration-agent

**Purpose**: A2A migration agent — a **facade** exposing ONE Agent Card (`migration.run`) over swappable backends that author a source (PDF/webpage, incl. synthetic) into a da.live EDS page and self-validate. **Tech**: Express + `@a2a-js/sdk@0.3.13`, `@agents/a2a-common`, SQLite/D1 · **Port**: 4003 · **Status**: `dryrun` works · `makecom` fully implemented (needs only tunnel + scenario URLs) · **`opencode` (Kimi K2.6) implemented + verified end-to-end against real da.live (2026-06-08)** · `sdk` is a stub. v2.0 of the platform — **v1.1.0 = the frozen `content-authoring-eval/`, do not touch it (D5)**.

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
- `src/backends/sdk.ts` — M3 stub (will drive the `da-live-author-playwright` flow). `assertConfigured()` always throws today.
- `src/backends/opencode.ts` — **Kimi K2.6 backend (Backend C)**. Long-lived `opencode serve` singleton (lazy, reused across tasks); one A2A task = one opencode session. Spawns serve with `OPENCODE_CONFIG`→ a generated config that wires the da.live MCP (deployed, S2S self-auth) + Playwright MCP + the reused `da-live-author-playwright` skill, `permission:"allow"`. Taps the server's SSE `/event` stream → `onProgress` (tool + skill firing) and parses the model's `FINAL_REPORT` into a `MigrationResult`.
- `src/backends/opencode-config.ts` — config builder (`buildOpencodeConfig`), path resolution (`repoRoot`, `resolveSkillsPath`, `playwrightOutputDir`), `DEFAULT_DALIVE_MCP_URL`, `opencodeSetupProblem()`.
- `src/backends/opencode-prompt.ts` — `buildMigrationPrompt` (declares the context PRE-CONFIRMED so the headless run skips the SKILL.md confirmation gate), `migrationTargets` (deterministic folder/URLs), `parseMigrationReport` (tolerant JSON parse + fallbacks).

## Gotchas / non-obvious  ← READ THIS
- **Default backend is `dryrun`, NOT makecom** — `MIGRATION_DEFAULT_BACKEND` overrides. PRD's eventual default is makecom, but the scaffold ships dryrun so the closed loop is runnable without the tunnel. Per-call override: `payload.backend`.
- **Make.com needs the `cloudflared` tunnel.** The scenario runs in the cloud and must reach our callback. Set `MIGRATION_CALLBACK_BASE` to the tunnel hostname (`a2a.xpri.ai` → `:4003`); the callback URL is `${MIGRATION_CALLBACK_BASE}/callbacks/makecom/{taskId}`. Locally it defaults to `http://localhost:4003`.
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
- **The blocking agentic-turn POST routinely exceeds 5 minutes** — only survivable because `a2a-common/src/net.ts` disables undici's 300s timeouts process-wide (the standalone live test once passed at 248s purely by luck; a 10-min K2.6 turn through the coordinator died at exactly 5:01 before the fix). If you see `TypeError: fetch failed` at ~301s, something stopped importing a2a-common.

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
DALIVE_TEST_OWNER=jackzhaojin DALIVE_TEST_SITE=da-live-postal-2025-07 \
  npm run test:live -- tests-live/opencode-migration.live.test.ts
# or per-call: send migration.run with {"backend":"opencode", ...} to :4003
```
Verified 2026-06-08 against `da-live-postal-2025-07`: skill + `dalive_*` + `playwright_*` all fired, page authored → preview-published → validated, result PASS.

## Conventions
- **Contract `migration.run.v1`** requires: `sourceType` ∈ {`webpage`,`pdf`}, `sourceLocation` (http/https URL), `site`, `owner`, `pageSlug`. Optional: `folderPostfix`, `blockLibraryUrl`, `backend`, `maxRefinementIterations`, `runId`, `labels`.
- **Real tests, no mocks** (D-philosophy) — the makecom test stands up a fake Make.com speaking the exact wire protocol over real HTTP.
- Local SQLite = the same SQL as Cloudflare D1 (`a2a-common/migrations/`); store at `data/store.db`. Node 20.
- New backends register in `src/executor.ts`'s `BACKENDS` map — same seam, different runtime (`opencode`/Kimi is the proof: a non-Anthropic model vendor behind the identical contract).
- Never edit `content-authoring-eval/` (D5). This workspace is the live one.
