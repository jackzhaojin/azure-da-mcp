# CLAUDE.md — agents/a2a-common

**Purpose**: Shared A2A bootstrap every v2.0 agent imports as `@agents/a2a-common` — server factory, SQLite/D1 store adapter + migrations, task/push/artifact stores, mesh client factory, structured logging. · **Tech**: TypeScript (ESM, `.ts` imports run via tsx), Node 20, official `@a2a-js/sdk@0.3.13`, Express 4, better-sqlite3, aws4fetch. · **Status**: Active — backbone of the v2.0 A2A platform (the legacy `content-authoring-eval` app is v1.1.0, frozen, off-limits per D5).

This is the v2.0 "A2A agent platform" rebuild. Build report: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) · PRD: [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) (part-2 = store schema, part-3 = server/mesh/edge/push) · Sibling overview: [`agents/README.md`](../README.md).

## When to work here
- Changing the A2A server bootstrap shared by all agents (card shape, `/a2a`, mesh auth, edge shim, push, health, static/extra routes).
- Touching the persistence layer: store schema (`migrations/*.sql`), task store, push-config store, artifact store.
- Changing the mesh client (bearer injection) or the structured logger.
- Anything that must stay identical between local SQLite (dev) and Cloudflare D1 + R2 (deploy, M5).
- Do **not** add agent business logic here — that lives in each agent package (`eval-service`, `content-gen`, `migration-agent`, `coordinator`). This package only provides the seam.

## Key files
- `src/server.ts` — `startAgentServer(opts)`: the whole bootstrap. Builds the Agent Card, mounts the SDK `jsonRpcHandler` at `/a2a`, edge shim `POST /hooks/:agent/:skill`, push (SDK sender + SqlitePushNotificationStore), public `/health` + `/.well-known/agent-card.json`. Hooks: `staticRoutes`, `extraRoutes({app, db, edgeToken})`, `healthExtras`. Returns `{ app, server, db, log, card, requestHandler }`.
- `src/store/db.ts` — `openDb(dbPath)`: creates the SQLite file, WAL + FK pragmas, runs unapplied `migrations/*.sql` in filename order inside a transaction, tracked in `_migrations`. Same SQL files run on D1 at deploy.
- `src/store/taskStore.ts` — `SqliteTaskStore` (implements SDK `TaskStore`): upserts the full A2A `Task` JSON into `tasks`, keyed on `a2a_task_id`. Why it exists: tasks must survive restart / Container sleep-wake.
- `src/store/pushStore.ts` — `SqlitePushNotificationStore` (implements SDK `PushNotificationStore`): persists webhook callback registrations across restarts (SDK ships in-memory only).
- `src/store/artifactStore.ts` — `createArtifactStore(opts)` (R2 via S3/SigV4 when env set, else local FS stand-in) + `recordArtifact(db, …)` (writes an `artifacts` row, best-effort).
- `src/client.ts` — `meshClientFactory(token?)`: SDK `ClientFactory` that injects `Authorization: Bearer <A2A_MESH_TOKEN>` on every transport call (cards/discovery stay public).
- `src/logging.ts` — `createLogger(agent)`: one-line JSON logs; convention is to include `a2a_task_id` / `context_id` fields.
- `src/net.ts` — side-effect module (imported by `index.ts`): **disables undici's 300s headers/body timeouts process-wide** via `setGlobalDispatcher`. Without it, Node 20's fetch kills >5-min agentic turns (Kimi migrations) and quiet A2A SSE streams at exactly 300s.
- `src/index.ts` — public surface; agents import only from here (importing it is what installs the net.ts dispatcher).
- `migrations/0001_init.sql` — `runs`, `tasks`, `eval_reports`, `artifacts` (+ indexes on `a2a_task_id` / `run_id` / `context_id`).
- `migrations/0002_push_configs.sql` — `push_configs` (PK `task_id, config_id`).
- `migrations/0003_runs_live.sql` — `runs.context_id` (trigger→run join) + `runs.progress` (live `{ts,note}[]` trail for the coordinator dashboard). Applied to D1 2026-06-10.
- `migrations/0004_runs_user.sql` — `runs.user_email` (+ index): the Google SSO identity that triggered the run (coordinator dashboard `requestedBy` → `user_email`; NULL = system run from CLI/shim/mesh). Applied to D1 2026-06-10. Note: D1 has NO `_migrations` table — it was migrated file-by-file via `wrangler d1 execute`; keep doing that for new migrations.

## Gotchas / non-obvious  ← READ THIS FIRST
- **`edgeToken = A2A_EDGE_TOKEN || A2A_MESH_TOKEN`** (server.ts:62). This single value gates the `/hooks/*` edge shim here, the migration agent's `/callbacks/*` receiver, AND the coordinator's `/store/runs` domain reads (all via `extraRoutes`). Change/override one place and you've changed all of them. With neither env set, the mesh and shim are fully open (dev default).
- **Don't "clean up" the `import "./net.ts"` side effect in index.ts** — it's the mesh-wide fix for undici's 300s fetch/SSE timeouts. A `TypeError: fetch failed` or stream `terminated` at ~301s means a process that didn't import a2a-common.
- **Mesh auth is selective**: bearer is enforced only on `/a2a`. `/.well-known/agent-card.json`, `/health`, `/hooks/*`, and static routes are NOT behind `A2A_MESH_TOKEN` (the shim uses `edgeToken` instead; card/health are intentionally public for discovery). The card only advertises `securitySchemes` when `meshToken` is set.
- **pushStore MUST mirror the SDK's `config.id = taskId` backfill** (pushStore.ts:17): `save` sets `config.id ?? taskId`. The SDK's `getTaskPushNotificationConfig` looks configs up by that id — drop the backfill and config retrieval breaks silently.
- **better-sqlite3 is synchronous.** The store classes are `async` only to satisfy the SDK interfaces; internally there is no I/O await. Don't add `await` expecting concurrency, and don't assume the DB call yields the event loop.
- **Local artifact backend writes to the SAME dir an agent serves via `staticRoutes`** (e.g. `./output/artifacts` → `/artifacts`). The returned public URL therefore has the IDENTICAL contract to R2's `r2.dev` URL — this is deliberate so the closed loop, CI, and prod all use one URL shape. When wiring an agent: point `localDir` at the static dir and `localPublicBase` at `http://localhost:<port>/<route>`.
- **R2 selection is all-or-nothing**: `createArtifactStore` only uses R2 when `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE`, and one of `R2_S3_ENDPOINT`/`R2_ACCOUNT_ID` are ALL present; any missing → silent fallback to local. Check the startup log line (`artifact store: r2|local`) to confirm which backend is live.
- **`recordArtifact` is FK-gated and best-effort**: it no-ops (warn only) if the `tasks` row isn't persisted yet, since `artifacts.task_id` FKs `tasks.id`. Persist the task before recording its artifacts, or the row is dropped without error.
- **`shimAgentId` defaults from the agent name** by stripping `da-` prefix / `-agent` suffix (server.ts:63). The shim 404s if `:agent` in the URL doesn't match it. Override via `opts.shimAgentId` if your agent name doesn't reduce to the slug you want in the URL.
- **Edge shim is fire-and-forget**: it calls `sendMessage` with `blocking: false` and returns `202 {taskId, contextId, state}` immediately; the result is delivered later to `callbackUrl` as an A2A push (a plain webhook POST of the Task). The flat body's `callbackUrl`/`callbackToken` are stripped out; everything else becomes the skill's `data` part.
- **Migrations are append-only & ordered by filename.** `openDb` runs them once (tracked in `_migrations`) — never edit a shipped migration; add `000N_*.sql`. The same files are the source of truth for D1, so keep the SQL D1-compatible (plain SQLite dialect, no driver-specific extensions).
- **`.ts` import specifiers everywhere** (e.g. `./store/db.ts`). This is intentional for the tsx/ESM runtime — don't "fix" them to extensionless.

## Run / test
This package is a library, not a runnable server — it's exercised through the agent packages and the `agents/` test suites. From the `agents/` workspace root:
```bash
# env: agents read process.env directly (no dotenv) — load before running anything
cd agents && set -a && source .env && set +a
# wrangler/D1/R2 tooling needs Node 22, agents need Node 20:
#   PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"   (wrangler only)
npm run test:e2e     # fast tier — protocol contract, stub engine (real servers, no mocks)
npm run test:live    # live tier — real engine, $0 (no API keys)
```
- Persistence sanity: an agent's store lands at `<package>/data/store.db`; delete it to reset, inspect with any SQLite client.
- REAL tests only — NO mocks/stubs (monorepo rule). Tests spawn actual agent servers on isolated 14xxx ports with throwaway SQLite files.

## Conventions
- **One Express A2A server per agent** on this bootstrap. Ports: eval 4001 · content-gen 4002 · migration 4003 · coordinator 4004 (also serves the dashboard, the sole UI).
- **Persistence parity**: local SQLite (better-sqlite3) runs the EXACT SQL that runs on Cloudflare D1. Artifacts → R2 (S3 API) when `R2_*` env is set, else local `./output` served at `/artifacts`.
- **No dotenv** — agents read `process.env` directly; always `source .env` first.
- **D5 (hard rule)**: never touch `content-authoring-eval/`. It's the frozen v1.1.0 backup, not part of this system.
- Logs are structured JSON; thread `a2a_task_id` and `context_id` through every line.
