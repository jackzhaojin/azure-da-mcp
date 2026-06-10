# CLAUDE.md — agents/ui

**Purpose**: Thin dashboard for the A2A agent mesh — Runs list + run-detail (branch grid, stage states, variance tables) and a manual Trigger. · **Tech**: Next.js 15 (App Router, React 19, TS), `better-sqlite3`, `@a2a-js/sdk@0.3.13` · **Port**: 3000 · **Status**: **LEGACY** — the M4 head-start scaffold, kept working as a reference surface. **Superseded by the coordinator's own dashboard at `:4004/`** (`agents/coordinator` — richer trigger incl. backend selection, live activity feed, database-free Next backend). New dashboard work belongs there, not here.

This is **NOT** the frozen `content-authoring-eval/` app. Per decision **D5**, never touch that app — this is a fresh, deliberately thin v2.0 surface. v1.1.0 = legacy `content-authoring-eval` (frozen backup). See `ai-docs/2026-06-08-a2a-platform-v2.0/` and `ai-docs/2026-06-05-a2a-agent-platform/` (esp. `part-6-orchestration-ui-rollout.md`).

## When to work here
- Runs dashboard / run-detail rendering (variance, branch grid, stage states)
- The manual Trigger flow (server-side A2A client → coordinator)
- Auth middleware / shared-secret login
- Anything touching how the UI **reads** the coordinator store or **triggers** the coordinator

This app only READS the store and FIRES the coordinator — the agents do all the work. If a change is really about eval/migration/coordination logic, it belongs in those agent packages, not here.

## Key files
- `src/middleware.ts` — gates all pages + API behind the `ui-auth` cookie (SHA-256 of password); `/login` + `/api/login` exempt; matcher skips `_next/static`, `_next/image`, `favicon.ico`
- `src/lib/auth.ts` — `expectedToken()` (SHA-256 hex of `agents-ui:${password}`), `authEnabled()` (true iff `UI_PASSWORD` set)
- `src/lib/db.ts` — read-only `better-sqlite3` over the coordinator's `runs` table (`COORDINATOR_DB`); returns `[]` if the file is missing
- `src/app/runs/page.tsx` — Runs table, polls `/api/runs` every 3s, expandable per-dimension variance
- `src/app/runs/[id]/page.tsx` — run detail: branch grid, per-stage ✓/✗, score/conf, variance; stops polling once terminal
- `src/app/trigger/page.tsx` + `src/app/api/trigger/route.ts` — form → server-side A2A `coordinate.run` (`goal: evaluate`)
- `src/app/api/{login,runs,runs/[id]}/route.ts` — JSON surface (login sets cookie; runs read the store)
- `src/app/page.tsx` — redirects `/` → `/runs`
- `.env.example` — `UI_PASSWORD`, `COORDINATOR_URL`, `COORDINATOR_DB`, `A2A_MESH_TOKEN`

## Gotchas / non-obvious (MOST IMPORTANT)
- **Auth is OFF when `UI_PASSWORD` is unset** — `middleware.ts` returns `next()` immediately. Fine for local dev; set `UI_PASSWORD` to actually gate anything. `/api/login` also no-ops (`{ok,note:"auth disabled"}`).
- **Shared-secret scaffold only** — real mechanism (Cloudflare Access vs Auth.js) is open question #6, due by M4. Don't over-build it.
- **Runs view is polling (v1, no realtime)** — 3s `setInterval` on `/api/runs`; detail page stops polling once `status !== "running"`. WebSockets/SSE are deliberately out of scope for now.
- **Read-only + trigger only** — `db.ts` opens SQLite `{ readonly: true, fileMustExist: true }`. This app must never WRITE the store. The only side effect is firing `coordinate.run`.
- **Mesh token never reaches the browser** — `/api/trigger` runs the A2A client server-side and injects `Authorization: Bearer ${A2A_MESH_TOKEN}` via a wrapped `fetchImpl`. Keep trigger logic server-side; never expose the token to client components.
- **`COORDINATOR_DB` resolves from `process.cwd()`** (which is `agents/ui/` under `next dev/start`). Default `../coordinator/data/store.db` points at the sibling package. A path mismatch silently yields zero runs, not an error.
- **`better-sqlite3` is a native module** — `next.config.ts` lists it in `serverExternalPackages` so Next doesn't try to bundle it. Don't remove that, and don't import it into client components.
- **Don't commit build output** — `.next/` and `next-env.d.ts` are gitignored. They exist on disk after a build; never stage them.
- **API routes are `force-dynamic`** — `runs` routes opt out of static caching on purpose (store is live data).

## Run / test
```bash
cd agents && set -a && source .env && set +a   # load mesh/coordinator env
npm run dev:ui          # → :3000 (set UI_PASSWORD to enable auth)
# or from agents/ui:  npm run dev | npm run build | npm run start
```
Needs the coordinator's store to show anything: run `npm run dev:coordinator` (+ a batch via Trigger or `npm run batch`). The live smoke is `e2e/tests-live/ui-smoke.live.test.ts` (real `next dev`, seeded store, `npm run test:live` from `agents/`).

## Conventions
- One Express A2A server per agent on `@agents/a2a-common`; ports eval 4001 / content-gen 4002 / migration 4003 / coordinator 4004 / ui 3000.
- Node 20; `@a2a-js/sdk@0.3.13` pinned across the mesh.
- Persistence is local SQLite using the **same SQL as Cloudflare D1** (migrations live in `a2a-common/migrations/`).
- REAL tests, NO mocks (monorepo philosophy). UI coverage is the live smoke; root `npm run typecheck` does **not** cover this app (only `tsconfig.json` + `eval-service`), so `next build` is the type gate here.
- House style for docs: concise, scannable, gotcha-first.
