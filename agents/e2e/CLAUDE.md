# CLAUDE.md — agents/e2e

**Purpose**: End-to-end suite for the A2A agent mesh — REAL servers, real A2A over HTTP, **no mocks** (monorepo testing philosophy). · **Tech**: Vitest 3, `tsx`, `@a2a-js/sdk@0.3.13`, `better-sqlite3`, `@modelcontextprotocol/sdk`, `aws4fetch` · **Ports**: spawns agents on isolated `14xxx` ports · **Status**: fast tier green in CI; live + soak run locally with creds.

v2.0 "A2A agent platform" (v1.1.0 = legacy `content-authoring-eval`, frozen — D5: never touch it). PRD: `ai-docs/2026-06-08-a2a-platform-v2.0/` and `ai-docs/2026-06-05-a2a-agent-platform/` (DoD criteria are scattered through parts 2/4/5/6).

## When to work here
- Adding/adjusting end-to-end coverage across the mesh
- Proving a protocol contract (agent cards, task lifecycle, push notifications, mesh auth, edge shim)
- Validating multi-agent composition (closed loop, coordinator batch, Make.com round-trip)
- Live evidence with real Chromium / real R2 / real `next dev`

## Key files
- `helpers/mesh.ts` — `startAgent(service, port, {dbPath?, env?})` spawns a real agent (`tsx src/index.ts`) as a child process on an isolated port with a throwaway SQLite file (`mkdtemp`), merges `process.env`, polls `/health` (20s deadline), returns an `AgentHandle` with `output()`. `stopAgent()` kills + awaits exit.
- `helpers/receiver.ts` — minimal real HTTP webhook receiver (plays Make.com's Custom Webhook); records every POST, `waitFor(predicate, timeoutMs)`. Used by push-notification / callback tests.
- `vitest.config.ts` — **fast** tier (`tests/`, 30s timeout, retry 0)
- `vitest.live.config.ts` — **live** tier (`tests-live/`, 240s timeout, `fileParallelism: false`)
- `vitest.soak.config.ts` — **soak** tier (`tests-soak/`, 900s timeout)
- `tests/` — fast (stub engine), `tests-live/` — real engine/browsers/R2, `tests-soak/` — `full-loop-10x`

## Gotchas / non-obvious (MOST IMPORTANT)
- **THREE tiers, three commands** (run from `agents/`):
  - `npm run test:e2e` → fast (`tests/`, **the CI tier**) — stub engine, no browsers, no API keys. Safe to run with or without `.env` sourced: `startAgent` strips behavior-changing env (mesh/edge tokens, SSO, peer URLs, `EVAL_ENGINE`, D1 proxy, R2, Make.com) before spawning, so spawned agents are deterministic regardless of the invoking shell. A test that wants one of those vars passes it explicitly via `opts.env` (see `SANITIZED_ENV_VARS` in `helpers/mesh.ts`).
  - `npm run test:live` → live (`tests-live/`) — real engine, real Chromium/axe/screenshots, real R2; creds-gated
  - `npm run test:soak` → `tests-soak/full-loop-10x` — M4 DoD "10x run completes unattended"
- **Live R2 + eval tests auto-skip without creds** — `describe.skipIf(!haveR2)` etc. A green `test:live` may mean *skipped*, not *passed*. R2 test needs `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE` / (`R2_S3_ENDPOINT` | `R2_ACCOUNT_ID`).
- **Live engine runs with API keys STRIPPED** — `NO_AI_ENV` blanks `CLAUDE_CODE_OAUTH_TOKEN` + `ANTHROPIC_API_KEY` so agentic passes fall back to deterministic scoring: real browsers, **$0 spend**. Full-agentic runs are manual (provide a real `CLAUDE_CODE_OAUTH_TOKEN`).
- **Root `npm run typecheck` does NOT cover e2e** — it only checks `tsconfig.json` + `eval-service/tsconfig.json`. The CI tsc gate skips this package; e2e type errors surface only when the tests run.
- **e2e declares its own devDeps** — `@agents/a2a-common` + `aws4fetch` are listed here specifically for the live R2 test (SigV4 PUT through `createArtifactStore()` + public r2.dev read-back, self-cleaning).
- **Spawned coordinators also boot the Next.js dashboard** (dev mode, in-process) — harmless for tests because `/health` answers before Next prepares; set `COORDINATOR_UI=off` in a test's env if it ever matters.
- **No retries by design** — `retry: 0` in all three configs. A flake IS a finding; don't paper over it with retries.
- **Flat live timeouts, serial live runs** — live/soak set `fileParallelism: false` (real browsers + shared ports). Fast tier may parallelize.
- **Isolated everything** — each spawned agent gets its own port and a throwaway `store.db`; tests wire one agent to another via env (e.g. `EVAL_AGENT_URL: evalAgent.url`). Cross-agent contextId threading is asserted by reading the spawned agents' SQLite stores directly.
- **CI** — `.github/workflows/agents-e2e.yml` runs the **fast tier only** on `agents/**` (or workflow) changes: `npm ci` → `npm run typecheck` → `npm run test:e2e`. Never touches the frozen `content-authoring-eval` deploy (D5).

## Run / test
```bash
cd agents && set -a && source .env && set +a   # creds for live tiers
npm install
npm run test:e2e     # fast (CI tier)
npm run test:live    # live (creds-gated; skips R2/eval without creds)
npm run test:soak    # full-loop-10x
```
Fast tier needs nothing but the repo — it spawns real servers itself.

## Conventions
- One Express A2A server per agent on `@agents/a2a-common`; ports eval 4001 / content-gen 4002 / migration 4003 / coordinator 4004 (tests use `14xxx`).
- Node 20; `@a2a-js/sdk@0.3.13` pinned across the mesh.
- Persistence is local SQLite = **same SQL as Cloudflare D1** (migrations in `a2a-common/migrations/`); tests assert on store rows.
- REAL tests, NO mocks: every suite drives the actual `npm run dev:*` processes over real HTTP with the real A2A client.
- Test file naming: `*.e2e.test.ts` (fast), `*.live.test.ts` (live), `*.soak.test.ts` (soak) — the configs `include` by suffix.
