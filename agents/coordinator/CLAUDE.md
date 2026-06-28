# CLAUDE.md — agents/coordinator

**Purpose**: Intelligent content coordinator — routes + fans out pipelines across content-gen, migration, and eval; aggregates variance stats. **Hybrid app**: the Express A2A server AND a Next.js 15 dashboard share one process + port. · **Tech**: TypeScript, Node 20, Express A2A server (client AND server) on `@agents/a2a-common`, `@a2a-js/sdk@0.3.13`, `p-queue`, Next.js 15 / React 19 / Tailwind 3 + shadcn-style UI (styling copied from the v1 eval app). · **Port**: 4004 (A2A + UI). · **Status**: v2.0 A2A platform, M3 routes done; closed loop runs end-to-end locally; dashboard live.

Platform docs: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) (v2.0), [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) (PRD part-6 = the coordinator). v1.1.0 `content-authoring-eval/` is the frozen legacy backup — **D5: never touch it.**

## When to work here
- Changing routing logic, fan-out, or variance aggregation for `coordinate.run`.
- Adding routes / stages to the pipeline, or upgrading `goal: auto` from the state table to the LLM planner (M3).
- CLI work: the `hello` / `batch` / `loop` commands.
- The coordinator dashboard (trigger, live runs, run detail) — `app/` + `components/` + `lib/`.

## Key files
- `src/site-profiles.ts` — **per-target-site profiles** keyed by `payload.site`: the editorial lane + voice threaded to content-gen, and the target folder + reference corpus (`blockLibraryUrl`/`neighborPageUrl`) + prompt `pattern` threaded to migration. `adapt-to-2026-demo` → Wilderness Journal (lane `wilderness-journal`, folder `ai-articles`, reference `/ai-content/**`, pattern `article`); unprofiled sites get an empty profile (generic behavior preserved). This is how the same generic mesh produces site-appropriate content.
- `src/executor.ts` — the route engine. `resolveRoute()` is a deterministic state table mapping `evaluate | migrate | generate+migrate | full-loop | auto` → an ordered `Stage[]` (`generate | migrate | evaluate`, any subset, **no mandatory start or end**). `runPipelineBranch()` threads ONE `contextId` across content-gen→migration→eval, forwarding each stage's artifact (sourceUrl → previewUrl → score). `computeStats()` aggregates variance (mean / stddev / min / max / per-dimension / passRate) over the fan-out. `callAgent()` is the mesh A2A client call; it **forwards child working-notes** (e.g. the opencode backend's `K2.6 → <tool>` lines) into the coordinator's own stream — observability AND SSE keepalive.
- `src/index.ts` — wires the server: `startAgentServer`, `createCoordinateExecutor(db)`, the **restart policy** (interrupted in-flight `coordinate.run` rows are marked `failed`, not blindly re-fanned-out), and the **Next.js mount** (catch-all appended after the factory returns, so agent-card//a2a//hooks//health always win).
- `src/cli.ts` — `hello` (mesh smoke), `batch <url...>` (eval-only fan-out), `loop <topic...>` (the closed loop; `--backend opencode --site S --owner O` for real Kimi migrations). Agent URLs from env, defaults to localhost ports.
- `src/runs-routes.ts` — the A2A layer's domain reads (`GET /store/runs`, `/store/runs/:id` — edge-token gated, mounted via `extraRoutes`). The store's ONLY readers/writers live on this Express side.
- `app/` — Next.js App Router: dashboard `/`, run detail `/runs/[id]`, sign-in `/login`, JSON API `/api/{runs,runs/[id],trigger,mesh,auth/[...nextauth]}`.
- `auth.ts` + `middleware.ts` — Google SSO (Auth.js v5, JWT sessions, no DB). Enabled only when `AUTH_GOOGLE_ID`+`AUTH_GOOGLE_SECRET` are set (plus `AUTH_SECRET`; optional `AUTH_ALLOWED_EMAILS` allowlist); unset = open dashboard. Middleware gates pages (redirect `/login`) + `/api/*` (401) but never the Express surface (handled before the Next catch-all).
- `components/` — `Dashboard` (mesh chips, running-now cards, trigger form, recent runs, localStorage history), `RunDetail` (live activity feed, branch grid, variance), `StatusBadge`/`ScoreText`, plus `components/ui/` shadcn primitives copied from the v1 eval app.
- `lib/` — `coordinator-api.ts` (loopback client for `/store/runs` + mesh-token fetch for a2a-js; **server-only**), `hooks.ts` (`usePoll`, `useRunHistory` localStorage, `useElapsed`), `types.ts` (client-safe shapes).
- `package.json` — `npm run dev` (A2A + UI), `npm run build` (next build), `npm run hello | batch | loop`.

## Gotchas / non-obvious (MOST IMPORTANT)
- **`goal: auto` uses the deterministic state table, NOT an LLM** (planner is M3). Inference: `alreadyMigratedUrl` ⇒ `evaluate`; `sourceLocation` ⇒ `migrate,evaluate`; `topic` ⇒ full loop; none ⇒ throws. Don't expect semantic planning yet.
- **One shared `contextId` per run is how the stores group a pipeline's steps.** Every child task across all three agents inherits it; `store-mcp` / the UI join on it. Never mint a fresh contextId per stage.
- **Routes need not start at generate or end at eval** — `generate+migrate` deliberately stops with no eval; `migrate`-only has no generate. `validateForRoute()` enforces only what each route actually needs (`topic` for generate routes, `sourceLocation` for a bare migrate, `targets`/`alreadyMigratedUrl` for evaluate).
- **Fan-out shape differs by route**: evaluate-only fans out per target × `fanOut`; pipeline routes fan out `fanOut` branches of one config. Concurrency capped by `COORD_FANOUT_CONCURRENCY` (default 2).
- **fail-fast is per-branch, not per-run**: a failed stage breaks that branch; other branches keep going. Run status ends `completed` or `completed_with_failures`.
- **`computeStats` overall = eval scores when the route evaluated, else migration confidence.** `PASS_THRESHOLD = 75` (matches the eval engine's `passedDimensions` rule). It also emits a separate `migrationConfidence` block when confidences exist.
- **The eval stage picks its `mode` from the route (v2.5.0).** A route that GENERATED its source (`route.includes("generate")` — full-loop / generate+migrate→eval) sends `mode: "quality"` to the eval agent (score the generated page on its own merits); a route over a REAL source (migrate→evaluate / evaluate-only) sends `mode: "fidelity"`. This is why a full-loop article now scores ~85–90 instead of ~67 — fidelity-to-the-synthetic-source was the wrong signal. See `eval-service/CLAUDE.md` for what each mode does.
- This agent is an A2A **client and server**: it serves `coordinate.run` AND calls the other agents via `meshClientFactory()`. Agent URLs come from `EVAL_AGENT_URL` / `CONTENT_GEN_URL` / `MIGRATION_AGENT_URL`.
- **The Next.js side must never import `@agents/a2a-common`** (its `.ts`-extension NodeNext imports don't survive Next's bundler-resolution compile). `app//components//lib/` use `@a2a-js/sdk/client` + `better-sqlite3` directly; `coordinator/tsconfig.json` covers ONLY the Next side (excludes `src/`), while root `agents/tsconfig.json` keeps covering `src/`. `next build` is the Next side's type gate.
- **The Next.js side is database-free.** All reads proxy the A2A layer's `/store/runs` endpoints over loopback (edge-token injected server-side); the trigger goes through `/a2a` via a2a-js; `/api/runs/[id]` also enriches in-flight runs with `tasks/get` (`a2aState`). The Express side is the store's only owner — at M5 only IT migrates to D1. The browser never sees a token.
- **`/store/*` is reserved for the A2A layer's JSON reads** — Express routes register BEFORE the Next catch-all, so a bare Express `GET /runs/:id` would shadow the dashboard's `/runs/[id]` PAGE (this happened; hence the prefix). Never mount Express routes on paths the Next app uses.
- **`COORDINATOR_UI=off` disables the dashboard** (A2A surface unaffected) — lean mode if the Next boot is unwanted (e.g. CI debugging). UI boot failures are logged and swallowed; the agent stays up.
- **Live run data**: migration `0003_runs_live.sql` added `runs.context_id` (join a trigger's contextId → run) and `runs.progress` (JSON `{ts,note}[]`, capped at 200, written per working-note). Final `stats` JSON also embeds `branchResults`. Apply 0003 to Cloudflare D1 before M5.
- **Failure + live-branch visibility (0005, hardening sprint 2026-06-11)**: `runs.error` records WHY a failed run failed (executor catch + the restart policy's "interrupted by a coordinator restart"); `runs.live` holds JSON `BranchResult[]` snapshots updated per stage transition (the dashboard's live branch grid during a run), cleared when final stats land. Pinned by `e2e/tests/coordinator-live.e2e.test.ts`. **Apply `0005_runs_failure_live.sql` to Cloudflare D1 before the next worker deploy.**
- **Evidence reads**: `GET /store/evidence/:evalTaskId` (edge-gated) fetches the eval report artifact from the eval agent via A2A `tasks/get` and trims it to `{grade, dimensions: [{score, mode, modeReason, screenshotUrl, findings}], notes}`. The dashboard's per-branch "Evidence" panel (`/api/evidence/[taskId]` proxy) loads it on expand — this is how a surprising score becomes diagnosable from the UI.
- **Run history in the browser is localStorage** (`coordinator-history-v1`, v1 decision) — the store stays the durable record; localStorage is "what I ran from this browser".
- **SSO identity flows server-side only**: `/api/trigger` injects `requestedBy` from the Google session (never trusts the client body) → `coordinate.run` payload → `executor.ts` insert → `runs.user_email` (migration 0004). `/api/runs` pins `?user=` to the session; the store's `?user=` filter returns that user's runs **plus unowned (NULL) system runs** (CLI / edge shim / mesh have no SSO identity). `/store/runs/:id` stays capability-by-id.
- **OAuth redirect_uri origin gotcha**: Auth.js derives redirect_uri from `request.url`, which the custom-server mount builds against Next's default :3000 — fixed twice: `next({ hostname, port })` in `src/index.ts` AND `withRequestOrigin()` in `app/api/auth/[...nextauth]/route.ts` (rebuilds origin from `x-forwarded-*`/host headers so ONE server serves Google sign-in on `localhost:4004` and `content-factor-dash.jackzhaojin.com`). The Google OAuth client must list BOTH callback URLs; client JSON lives in `local-only/secrets/` (gitignored).
- **undici timeouts are disabled mesh-wide** via `a2a-common/src/net.ts` (side-effect import): Node 20's fetch otherwise kills >5-min agentic turns (Kimi migrations) and quiet SSE streams at exactly 300s. Don't "clean up" that import.

## Run / test
```bash
cd agents && set -a && source .env && set +a
npm run dev:eval   # :4001   (the loop needs eval + content-gen + migration up)
npm run dev:content-gen   # :4002
npm run dev:migration     # :4003 (dryrun backend by default)
npm run dev:coordinator   # :4004
npm run hello                                      # mesh smoke
npm run batch -- https://example.com --fan-out 2   # eval-only batch + variance
npm run loop -- "ski wax temperature guide" --fan-out 2 --legacy-style messy  # THE CLOSED LOOP
npm run loop -- "Chasing light on an alpine lake circuit" --backend opencode --site adapt-to-2026-demo --owner jackzhaojin  # real Kimi K2.6 migration (Wilderness Journal → /ai-articles)
# dashboard: http://localhost:4004/  (trigger runs, watch live activity, branch grid, variance)
```
Fast tests (from `agents/`, `npm run test:e2e`): `coordinator-batch` (3×2 → 6 children, one contextId, variance, runs row) and `closed-loop` (4 servers, full-loop, non-eval-terminating + no-mandatory-start routes, auto routing, per-branch failure isolation). Live tier scores over the real Chromium engine. **Real tests, no mocks.**

## Conventions
- Persistence: local SQLite `data/store.db` — same SQL as Cloudflare D1 (`a2a-common/migrations/`). The `runs` row (config + stats JSON) is the coordinator's record; eval rows live in eval-service's store, joined by contextId.
- Env from `agents/.env` via `set -a && source .env && set +a`.
- Ports: eval 4001 / content-gen 4002 / migration 4003 / coordinator 4004 (the sole UI).
- Contract: `agents/contracts/coordinate.run.v1.json`.
