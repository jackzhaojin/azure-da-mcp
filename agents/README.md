# agents/ — A2A Agent Platform (v2.0)

The flagship **v2.0** platform: a decoupled mesh of A2A agents (generate → migrate → evaluate, intelligently routed). One Express A2A server per agent (D4); local-first, Cloudflare Containers at M5 (D6); `content-authoring-eval/` is the **frozen v1.x backup** and not part of this system (D5).

**Docs**: [build report (as-built)](../ai-docs/2026-06-08-a2a-platform-v2.0/) · [PRD / plan](../ai-docs/2026-06-05-a2a-agent-platform/) · [dev hub `CLAUDE.md`](./CLAUDE.md) · each workspace below has its own `CLAUDE.md`.

## Layout

| Package | Port | What |
|---|---|---|
| `a2a-common/` | — | Shared bootstrap: server factory (Express + official `@a2a-js/sdk@0.3.13`), SQLite/D1 store adapter + migrations, **push notifications (SQLite-backed config store)**, **mesh bearer auth** (`A2A_MESH_TOKEN`), **edge webhook shim** (`POST /hooks/{agent}/{skill}`), mesh-aware client factory, structured logging. |
| `eval-service/` | 4001 | Eval agent — real engine (copied from frozen app), job queue, browser semaphore, `eval.run` executor; visual screenshots stored to R2 (public r2.dev) when configured, else a local stand-in; `EVAL_ENGINE=stub` for the fake |
| `content-gen/` | 4002 | Content generator — `content.brief` + `content.synthesize-source` (template tier; Agent SDK backend at M3). Synthetic sources stored to R2 (public r2.dev) when configured, else a local stand-in |
| `coordinator/` | 4004 | A2A client AND server (`coordinate.run`): **routed pipelines** — `evaluate` \| `migrate` \| `generate+migrate` \| `full-loop` \| `auto` (deterministic state-table routing) with fan-out + **variance stats**; forwards child working-notes (live `K2.6 → <tool>` observability); CLI `hello` + `batch` + `loop`; **+ its own Next.js dashboard on the same port** (`:4004/` — trigger, live activity feed, branch grid, localStorage history; Next backend is database-free over `/store/runs`) |
| `contracts/` | — | JSON Schemas: `eval.run.v1`, `coordinate.run.v1`, `migration.run.v1`, `content.brief.v1`, `content.synthesize-source.v1` |
| `migration-agent/` | 4003 | Facade over swappable backends: `dryrun` (simulation), **`makecom` (primary — webhook out → `/callbacks/makecom/{taskId}` in, restart-tolerant; needs only the tunnel + scenario URLs)**, **`opencode` (Kimi K2.6 via `opencode serve` — reuses the `da-live-author-playwright` skill + da.live/Playwright MCP; verified end-to-end against real da.live)**, `sdk` (M3) |
| `ui/` | 3000 | **Legacy** thin Next.js dashboard (M4 scaffold): shared-secret auth (middleware), Runs list + run detail, Trigger (`goal: evaluate` only). Superseded by the coordinator's own dashboard on `:4004/` |
| `store-mcp/` | — | Read-only MCP server (stdio) over the coordinator + eval stores: conversational store queries via MCP (oq #8) — `list_runs` / `get_run` / `list_eval_reports` / `query_store` (single-SELECT escape hatch). The adaptTo() "ask Claude about run results in natural language" moment |
| `e2e/` | 14xxx | E2E suite (vitest) — real servers, real A2A over HTTP, no mocks |

## Run the walking skeleton

```bash
npm install
npm run dev:eval          # terminal 1 → :4001 (real engine; EVAL_ENGINE=stub for fakes)
npm run dev:content-gen   # terminal 2 → :4002
npm run dev:migration     # terminal 3 → :4003 (dryrun backend by default)
npm run dev:coordinator   # terminal 4 → :4004
npm run dev:ui            # terminal 5 → :3000 (set UI_PASSWORD to enable auth)
npm run hello             # mesh smoke: cards + one task through each agent
npm run batch -- https://example.com https://example.org --fan-out 2
                          # eval-only batch via coordinate.run → variance stats
npm run loop -- "ski wax temperature guide" --fan-out 2 --legacy-style messy
                          # THE CLOSED LOOP: generate → migrate (dryrun) → eval (real engine)
npm run loop -- "topic" --backend opencode --site da-live-postal-2025-07 --owner jackzhaojin
                          # the REAL loop: Kimi K2.6 authors + publishes an actual da.live page (~10 min)
# coordinator dashboard: http://localhost:4004/  (trigger runs, watch tool/skill activity live)
```

External callers skip A2A entirely via the edge shim (one flat POST, webhook back):

```bash
curl -X POST localhost:4001/hooks/eval/eval.run \
  -H 'Content-Type: application/json' \
  -d '{"targetUrl":"https://example.com","sourceType":"none","callbackUrl":"https://hook.make.com/xyz"}'
# → 202 {"taskId":...}; the completed task POSTs to callbackUrl (A2A push notification)
```

Each agent writes its store to `<package>/data/store.db` (schema: `a2a-common/migrations/`,
SQLite dialect = same SQL as Cloudflare D1). Tasks survive server restarts — that's the
point of the SQLite task store (and the sleep-tolerance rule for Containers later).

## Tests

```bash
npm run test:e2e    # fast tier (~5s): protocol contract, stub engine
npm run test:live   # live tier (~15s): REAL engine — Chromium, axe, screenshots; $0 (no API keys)
```

Monorepo philosophy: **real tests only, no mocks.** Each suite spawns the actual agent
servers as child processes (isolated ports 14xxx + throwaway SQLite files) and drives
them with the real `@a2a-js/sdk` client over HTTP.

Fast tier (`tests/`, stub engine pins the A2A contract):
- `agent-card` — well-known card discovery, skill enumeration, health
- `task-lifecycle` — full SSE choreography, contextId threading, `tasks/get`,
  Part-2 store row mapping, A2A `-32001` error shape
- `persistence` — restart survival: completed tasks outlive the process
- `browser-semaphore` — 10 concurrent acquisitions cap at exactly 3 permits
- `push-notifications` — webhook delivery of completed tasks + config restart survival
- `mesh-auth` — `/a2a` 401s without the bearer; card/health stay public
- `edge-shim` — flat POST → 202 → callback round-trip; 404/401 paths
- `coordinator-batch` — 3 targets × fanOut 2 → 6 children, one contextId, variance stats, runs row;
  **`/store/runs` + `/store/runs/:id` domain reads** (light vs full payloads, `a2aTaskId` join, 401-when-gated, 404)
- `migration-agent` — dryrun contract artifact, per-slug determinism, makecom/unknown/invalid failure paths
- `content-gen` — brief structure, fetchable synthetic source matching its own groundTruth, skill inference,
  **chain: synthesize-source → migration.run** over real HTTP (first two-agent composition)
- `closed-loop` — all four servers: full-loop × 2 with one contextId across 3 agents' stores,
  generate+migrate stops without eval (no mandatory end), migrate-only (no mandatory start),
  deterministic auto routing, per-branch failure isolation
- `makecom-roundtrip` — fake Make.com speaking the exact wire protocol: webhook trigger with
  1:1 runtime vars + callbackUrl → final-report callback completes the task; clean timeout;
  **callback after a restart completes the task from the store** (scenario outlives our process)
- `store-mcp` — spawns the real `store-mcp` server over stdio (MCP SDK `Client`): `tools/list`
  returns the 4 store tools, `list_runs`/`list_eval_reports` parse JSON columns from seeded
  SQLite, `query_store` runs a SELECT but rejects `DELETE` and stacked `select 1; delete …`,
  `get_run` on an unknown id returns not-found (no crash)

Live tier (`tests-live/`, real engine, API keys stripped → agentic falls back to
deterministic; real browsers, zero spend):
- live page eval: streamed dimension progress, real axe/screenshot scores, `eval_reports` row
- **restart mid-queue** (Part-2 DoD): kill the server mid-eval, boot rebuild re-enqueues
  from the store, task completes
- **5 concurrent evals** (Part-2 DoD): all complete, live Chromiums never exceed 3 permits
- **coordinator batch over the real engine**: 2 branches, genuine scores aggregated into
  variance stats, `eval_reports` joined through one contextId
- **ui smoke**: real `next dev` — middleware 401/redirect, login, authenticated read of a
  seeded runs row with parsed variance stats
- **closed loop over the real engine**: generated legacy pages scored by real Chromium —
  structure penalizes the messy markup, content scores fidelity against the source,
  eval_reports threaded under one contextId

Full agentic runs (with `CLAUDE_CODE_OAUTH_TOKEN`) are manual for now — same code path,
the fallback just doesn't trigger.

## Cloudflare resources (provisioned 2026-06-07)

| Resource | Name / ID |
|---|---|
| D1 database | `a2a-agents` — `db84ebfc-2132-45ac-902d-7ef7117786e8` (same migration files apply at M5) |
| R2 bucket | `a2a-agents-artifacts` — public at `pub-ae7a7d0dbe1049c69ae60848bc58bfbf.r2.dev`; content-gen sources wired (S3 API). See [docs/r2-setup.md](docs/r2-setup.md) — mint an API token to flip dev from the local stand-in to real R2 |

## Status

- [x] Walking skeleton: cards, `message/stream` (SSE), `tasks/get`, store-backed task store, restart survival — verified 2026-06-07
- [x] M1 core: engine copied (model bump → `claude-sonnet-4-6`), job queue (concurrency 2), browser semaphore (3 permits), real `eval.run` executor, `eval_reports` writes, restart rebuild-from-store — Part-2 DoD tests green 2026-06-07
- [x] R2 artifact storage: `createArtifactStore()` (S3 API / local fallback), content-gen sources + eval visual screenshots wired, `artifacts` rows recorded, bucket public, round-trip proven, env-gated live tests + soak — 2026-06-08
- [ ] M1 remainder: full-agentic smoke run (CLAUDE_CODE_OAUTH_TOKEN)
- [x] M2 core: push notifications (store-backed), mesh bearer auth, edge webhook shim, coordinator server face (`coordinate.run`) + CLI batch + variance stats — tests green 2026-06-07
- [x] M3 scaffolding: migration facade (backend seam + dryrun), content-gen real contracts (template tier) + public synthetic sources, synthesize→migrate chain test — 2026-06-07
- [x] M4 head start: `agents/ui` scaffold — auth middleware, Runs + variance view (polling), Trigger; `next build` clean + live smoke — 2026-06-07
- [ ] M2 remainder — **config only, agent code done**: `cloudflared` named tunnel, paste the Make.com webhook URL → `MAKECOM_WEBHOOK_URL` + add the scenario's final HTTP module POSTing to our `callbackUrl` (R2 done; mint an API token per docs/r2-setup.md to use real R2 in dev)
- [x] M3 routes: coordinator route engine — `full-loop`/`generate+migrate`/`migrate`/`evaluate`/`auto` (deterministic state table), ≥3 routes incl. non-eval-terminating demonstrated by tests; closed loop runs end-to-end locally (CLI: `npm run loop`) — 2026-06-07
- [x] M3 real backend — **migration `opencode` / Kimi K2.6**: headless `opencode serve`, reuses the `da-live-author-playwright` skill + da.live & Playwright MCP; **migrated a real page end-to-end** (authored → preview-published → validated, PASS) against `da-live-postal-2025-07` — live test `e2e/tests-live/opencode-migration.live.test.ts` — 2026-06-08
- [x] **Kimi K2.6 through the FULL closed loop**: `npm run loop --backend opencode` — content-gen source (R2) → K2.6 authors + publishes a real page (conf 90, skill + 11 tools, preview HTTP 200) → real eval scores it (86). Exposed + fixed undici's 300s fetch/SSE timeouts mesh-wide (`a2a-common/src/net.ts`); coordinator now forwards child working-notes (live observability + keepalive) — 2026-06-10
- [x] **Coordinator dashboard** (M4 superseding `agents/ui`): Next.js 15 riding the same :4004 Express process (A2A wire surface byte-identical), v1-eval-app styling; trigger any route/backend, live activity feed (`runs.progress` via migration `0003_runs_live`), branch grid, variance; Next backend **database-free** — reads via the A2A layer's `/store/runs` (edge-token gated), writes via `/a2a`, `tasks/get` enrichment — 2026-06-10
- [ ] M3 real backends (remaining): migration `sdk` (Claude Agent SDK) backend, content-gen Agent SDK generator; LLM planner upgrade for `goal: auto`
- [ ] Full suite: 46 fast + 12 live (+ 1 soak) — fast tier green in CI; live R2 + agentic tiers run locally with creds
