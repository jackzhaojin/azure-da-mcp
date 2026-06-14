# agents/ — A2A Agent Platform (v2.0)

The flagship **v2.0** platform: a decoupled mesh of A2A agents (generate → migrate → evaluate, intelligently routed), built for the adaptTo() 2026 demo. One Express A2A server per agent (D4). **Deployed on Cloudflare Workers + Containers since 2026-06-10** (M5/D6) — and still fully runnable locally with zero cloud dependencies. `content-authoring-eval/` is the **frozen v1.x backup** and not part of this system (D5).

**Docs**: [build report (as-built)](../ai-docs/2026-06-08-a2a-platform-v2.0/) — see especially [07: the M5 deployment chronicle](../ai-docs/2026-06-08-a2a-platform-v2.0/07-m5-cloudflare-deployment.md) · [PRD / plan](../ai-docs/2026-06-05-a2a-agent-platform/) · [dev hub `CLAUDE.md`](./CLAUDE.md) · [deploy runbook](./deploy/CLAUDE.md) · each workspace below has its own `CLAUDE.md`.

---

## Live deployment

| URL | What |
|---|---|
| **https://content-factor-dash.jackzhaojin.com** | The coordinator dashboard — Google SSO, trigger runs, live agent activity, branch grids, variance. Runs you trigger are tied to your Google identity (`runs.user_email`). |
| `https://content-factory.jackzhaojin.com` | Coordinator A2A surface (`/a2a` mesh-token gated, `/store/runs` edge-token gated, agent card + `/health` public) |
| `https://content-factory-eval.jackzhaojin.com` | Eval agent (real engine: Chromium + axe + agentic Claude tiers) |
| `https://content-factory-gen.jackzhaojin.com` | Content-gen agent (synthetic legacy sources → R2) |
| `https://content-factory-migrate.jackzhaojin.com` | Migration agent (dryrun / makecom / **opencode = Kimi K2.6**) |

Everything is **scale-to-zero**: containers sleep after idle (see [Cost model](#cost-model--sleep-behavior)) and cold-start in ~5–30s on the next request. The first dashboard hit after a quiet period takes a few extra seconds — that's the deal.

**Acceptance status (2026-06-10)**: cloud e2e **4/4**, including the headline — Kimi K2.6, running inside the migration container, authored and preview-published a real da.live page in a ~9-minute agentic turn, and the real eval engine (deterministic + agentic Claude tiers, in-container) scored it **91** (structure 83 / accessibility 100 / content 79 / visual 100), watched live in the dashboard.

---

## Layout

| Package | Local port | What |
|---|---|---|
| `a2a-common/` | — | Shared bootstrap: server factory (Express + official `@a2a-js/sdk@0.3.13`), **the dual-driver store seam** (`StoreDb`: better-sqlite3 locally / D1-via-Worker-proxy in containers) + migrations, push notifications (store-backed), mesh bearer auth (`A2A_MESH_TOKEN`), edge webhook shim (`POST /hooks/{agent}/{skill}`), mesh-aware client factory, structured logging |
| `eval-service/` | 4001 | Eval agent — real engine (copied from the frozen app), job queue, browser semaphore, `eval.run` executor; screenshots → R2; `EVAL_ENGINE=stub` for the fake; heartbeats while queued *and* evaluating; restart rebuild with a 30-min age guard |
| `content-gen/` | 4002 | Content generator — `content.brief` + `content.synthesize-source` (template tier; Agent SDK backend at M3). Synthetic sources → R2 (public r2.dev) |
| `migration-agent/` | 4003 | Facade over swappable backends: `dryrun` (simulation), `makecom` (webhook out → callback in, restart-tolerant), **`opencode` (Kimi K2.6 via `opencode serve` — reuses the `da-live-author-playwright` skill + da.live/Playwright MCP; verified against real da.live, locally AND in-container)**, `sdk` (M3) |
| `coordinator/` | 4004 | A2A client AND server (`coordinate.run`): routed pipelines (`evaluate` \| `migrate` \| `generate+migrate` \| `full-loop` \| `auto`) with fan-out + variance stats; **stream-cut recovery via `tasks/get`** + cold-start retries; CLI `hello`/`batch`/`loop`; **+ the Next.js dashboard on the same port — the sole UI** (Google SSO via Auth.js, per-user runs; single/bulk/direct-eval lanes, sample downloads, JSON export, live activity; database-free backend over `/store/runs`) |
| `deploy/` | — | **The M5 Cloudflare deployment** (standalone, NOT an npm workspace — wrangler needs Node 22): the `content-factory` Worker, four Dockerfiles, wrangler config. See [deploy/CLAUDE.md](./deploy/CLAUDE.md) |
| `contracts/` | — | JSON Schemas: `eval.run.v1`, `coordinate.run.v1`, `migration.run.v1`, `content.brief.v1`, `content.synthesize-source.v1` |
| `store-mcp/` | stdio | Read-only MCP server over the local stores — "ask Claude about run results in natural language" |
| `e2e/` | 14xxx | E2E suites (vitest) — real servers, real A2A over HTTP, no mocks: **fast**, **live**, **soak**, and **cloud** tiers |

---

## Local architecture

Local dev uses SQLite + localhost ports — no Cloudflare dependency, no behavior drift (same SQL, same code paths; the store driver is selected by env).

```
  browser / curl / npm run loop                Make.com ── a2a.jackzhaojin.com (tunnel)
  ───────────────┬──────────────                              │
                 ▼                                            ▼
  :4004 coordinator (A2A + Next dashboard) ─── coordinator/data/store.db
  :4001 eval-service ─────────────────────────── eval-service/data/store.db
  :4002 content-gen ──────────────────────────── content-gen/data/store.db
  :4003 migration-agent ──────────────────────── migration-agent/data/store.db
                 │
                 └─ artifacts → ./output/** served at /artifacts
                    (or real R2 when all R2_* env vars are set — check the
                     startup log line: "artifact store: r2|local")
```

Each agent is its own process with its own SQLite file (see [Data persistence](#data-persistence--local-vs-cloud) for every path and table). Mesh calls between agents are plain HTTP to the localhost ports.

### Run it (unchanged by the cloud deploy)

```bash
npm install                      # Node 20
set -a; source .env; set +a      # cp .env.example .env first; secrets gitignored
npm run dev:eval                 # :4001 (real engine; EVAL_ENGINE=stub for fakes)
npm run dev:content-gen          # :4002
npm run dev:migration            # :4003 (dryrun backend by default)
npm run dev:coordinator          # :4004 (A2A + dashboard at http://localhost:4004/)

npm run hello                    # mesh smoke: cards + one task through each agent
npm run batch -- https://example.com https://example.org --fan-out 2
npm run loop -- "ski wax temperature guide" --fan-out 2 --legacy-style messy
                                 # THE CLOSED LOOP: generate → migrate (dryrun) → eval (real engine)
npm run loop -- "topic" --backend opencode --site da-live-postal-2025-07 --owner jackzhaojin
                                 # the REAL loop: Kimi K2.6 authors an actual da.live page (~10 min)
```

External callers skip A2A entirely via the edge shim (one flat POST, webhook back):

```bash
curl -X POST localhost:4001/hooks/eval/eval.run \
  -H 'Content-Type: application/json' \
  -d '{"targetUrl":"https://example.com","sourceType":"none","callbackUrl":"https://hook.make.com/xyz"}'
# → 202 {"taskId":...}; the completed task POSTs to callbackUrl (A2A push notification)
```

The same shim works against the cloud (bearer required there):

```bash
curl -X POST https://content-factor-dash.jackzhaojin.com/hooks/coordinator/coordinate.run \
  -H "Authorization: Bearer $A2A_EDGE_TOKEN" -H 'Content-Type: application/json' \
  -d '{"goal":"full-loop","topic":"anything","fanOut":1,"backend":"dryrun"}'
```

---

## Cloud architecture (M5)

```
                        ┌────────────────────────── Cloudflare ──────────────────────────┐
  browser / curl / e2e  │  Worker "content-factory"                                      │
  ──────────────────────┤   • hostname → container routing                               │
  content-factor-dash ──┼─→ CoordinatorContainer (basic) ── Next dashboard + A2A         │
  content-factory ──────┘    │        ▲                                                  │
  content-factory-eval ────→ EvalContainer (standard-3, non-root, Chromium ×2 revisions) │
  content-factory-gen ─────→ ContentGenContainer (lite)                                  │
  content-factory-migrate ─→ MigrationContainer (standard-1, opencode + Kimi config)     │
                        │    │ mesh calls between containers go via the public hostnames │
                        │    ▼                                                           │
                        │  POST /d1/query (x-d1-secret) ──→ D1 "a2a-agents"              │
                        │  R2 "a2a-agents-artifacts" (S3 API from containers)            │
                        └────────────────────────────────────────────────────────────────┘
```

Key facts (each measured or learned the hard way — full chronicle in [build-report 07](../ai-docs/2026-06-08-a2a-platform-v2.0/07-m5-cloudflare-deployment.md)):

- **Containers get NO native bindings.** The Worker owns the D1 binding and serves a secret-gated `/d1/query`; `a2a-common`'s `D1ProxyDb` calls back into it (~100 ms/query). Selected by `D1_PROXY_URL` + `D1_PROXY_SECRET` env — local dev keeps better-sqlite3 with identical SQL. Full detail: [Data persistence](#data-persistence--local-vs-cloud).
- **The store, not the stream, is the contract.** Quiet SSE dies at ~3–5 min crossing the Worker↔container hop, and containers can restart mid-task. So: heartbeats at every silent layer (eval queue-wait, eval in-flight, coordinator recovery polls) AND the coordinator recovers severed streams by polling `tasks/get` — which is what makes 9–20-min Kimi turns safe.
- **The agentic eval tier requires the v1 hardening recipe**: non-root user (the Claude CLI refuses agentic mode as root), runtime-generated `.claude.json`, and two merged Playwright browser caches. Don't touch `deploy/docker/eval.Dockerfile` without reading the frozen v1 app's Dockerfile first.
- **Rollouts kill in-flight runs** (the coordinator's boot policy marks running runs failed — safe, but blunt). Deploy between demos, never during.

### Deploy / operate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"   # wrangler needs Node 22 (agents stay Node 20)
cd agents/deploy && npm install
npm run deploy        # builds + pushes changed images (Docker required), syncs the da.live skill
npm run tail          # live worker logs (NOTE: container stdout is NOT here — debug via the store)
npx wrangler containers list
```

Secrets (13, set once via `printf '%s' "$VAL" | npx wrangler secret put NAME`): `D1_PROXY_SECRET`, `A2A_MESH_TOKEN`, `A2A_EDGE_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `MOONSHOT_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_ACCOUNT_UUID`, `CLAUDE_EMAIL`, `CLAUDE_ORG_UUID`.

Schema changes: append-only migration files in `a2a-common/migrations/` (local SQLite applies them automatically) **plus** `npx wrangler d1 execute a2a-agents --remote --file <migration>` for D1 (it has no `_migrations` table — file-by-file is the convention).

### Cost model / sleep behavior

Containers bill only while awake; everything here is scale-to-zero:

| Container | Instance | `sleepAfter` idle | Why |
|---|---|---|---|
| coordinator | basic (1 GiB) | **30m** | dashboard host — demo browsing stays warm |
| eval | standard-3 (8 GiB) | **15m** | the expensive one; sleep it aggressively |
| content-gen | lite (256 MiB) | **15m** | nearly free anyway |
| migration | standard-1 (4 GiB) | **15m** | wakes for migrations only |

- An **open SSE stream blocks sleep** (by design — a 20-min Kimi turn won't be killed); the idle clock starts when the last stream closes.
- A dashboard visit wakes the coordinator; triggering a run wakes whichever agents the route needs. Cold start ≈ 5–30s (the coordinator additionally 404s `/` for a few seconds while Next mounts — refresh).
- Changing `sleepAfter`: edit `deploy/src/index.ts`, `npx wrangler deploy` (worker-only change, seconds).

### Performance (measured)

| Operation | Cloud timing |
|---|---|
| D1 query via the proxy | ~100 ms (65–300 ms range) |
| Deterministic-only eval | ~15–40 s |
| Full agentic eval (4 dims, both tiers) | ~2 min |
| Kimi K2.6 real migration | ~9 min |
| Full closed loop, real everything | ~11 min |
| Re-deploy with no image changes | ~10 s |

---

## Data persistence — local vs cloud

Nothing important lives only in process memory. Every agent persists its A2A tasks, runs, reports, and push registrations through one seam — `a2a-common/src/store/db.ts`'s `StoreDb` interface — with two drivers behind it. The driver is chosen at boot by `openDb()`: if **both** `D1_PROXY_URL` and `D1_PROXY_SECRET` are set (Cloudflare Containers), it's the D1 proxy; otherwise it's local SQLite. Same SQL, same tables, same code paths either way.

### What gets stored (the schema)

One schema, defined once in `a2a-common/migrations/*.sql` (append-only, ordered by filename):

| Table | Written by | What |
|---|---|---|
| `runs` | coordinator | One row per triggered run: goal/route, status, fan-out, variance, `context_id`, `progress` (the live `{ts,note}[]` activity trail), `user_email` (Google SSO identity; `NULL` = system run from CLI/shim/mesh) |
| `tasks` | every agent | The **full A2A Task JSON**, upserted on every state change, keyed by `a2a_task_id` — this is what makes restart/sleep-wake recovery and `tasks/get` polling possible |
| `eval_reports` | eval agent | Per-evaluation scores + the full 4-dimension report JSON |
| `artifacts` | all agents | Index of produced artifacts (URL, kind, task FK) — the bytes live elsewhere (R2/FS, below) |
| `push_configs` | a2a-common | Webhook callback registrations (A2A push notifications) — persisted because the SDK ships in-memory only |
| `_migrations` | a2a-common | **Local SQLite only** — tracks which migration files have been applied. D1 has no such table (see below) |

### Local: one SQLite file per agent

Driver: **better-sqlite3** (WAL mode, foreign keys on). On boot each agent opens its file and auto-applies any unapplied `a2a-common/migrations/*.sql`, so a fresh checkout self-initializes.

**The default DB name is `data/store.db`, relative to each agent's package directory** (`STORE_DB_PATH` env overrides it). Because every agent is its own process, **each agent has its own separate database file** locally:

| Agent | Default local DB |
|---|---|
| coordinator | `agents/coordinator/data/store.db` ← runs, the dashboard's source of truth |
| eval-service | `agents/eval-service/data/store.db` ← eval_reports |
| content-gen | `agents/content-gen/data/store.db` |
| migration-agent | `agents/migration-agent/data/store.db` |

One consumer reads these files directly (read-only, no server): `store-mcp/` (`COORDINATOR_DB` + `EVAL_DB`). That's also why it can't run against the cloud store. (The dashboard does NOT read SQLite directly — it goes through the coordinator's `/store/*` loopback API.)

- **Inspect**: any SQLite client — e.g. `sqlite3 agents/coordinator/data/store.db 'select id, goal, status from runs order by created_at desc limit 5'`
- **Reset**: delete the `data/store.db` file(s); they're recreated + migrated on next boot. All `data/`, `*.db` are gitignored.
- **E2E tests** never touch these — they spawn servers on isolated 14xxx ports with throwaway SQLite files.

### Cloud: one shared D1 database for the whole mesh

In Cloudflare there is **one database for all four containers**: D1 **`a2a-agents`** (`db84ebfc-2132-45ac-902d-7ef7117786e8`). The local "four separate files" split disappears — coordinator, eval, content-gen, and migration all read/write the same D1 store, which is also what lets the dashboard join runs, tasks, and eval reports without any cross-agent API calls.

How a container reaches it — **containers get NO native bindings**, so a direct D1 binding is impossible. Instead:

1. The Worker (`deploy/src/index.ts`) owns the D1 binding and exposes `POST /d1/query`, gated by the `x-d1-secret` header (`D1_PROXY_SECRET`).
2. The Worker injects `D1_PROXY_URL` (= `https://content-factory.jackzhaojin.com`) + `D1_PROXY_SECRET` into every container's env, which flips `openDb()` to the `D1ProxyDb` driver.
3. Every `prepare().run/get/all()` becomes an HTTPS round trip: container → Worker → D1 → back. Measured ~100 ms/query (65–300 ms range) — fine for this workload, and it fails fast at boot (`select 1`) if misconfigured.

Schema changes on D1 are **manual and file-by-file** — it has no `_migrations` table: `npx wrangler d1 execute a2a-agents --remote --file a2a-common/migrations/000N_*.sql`. Keep the SQL plain-SQLite-dialect and positional-`?`-only (D1 has no named parameter binding) so the same file serves both worlds.

### Artifacts (the actual bytes) — R2 or local `./output`

The store tables hold metadata; the blobs themselves go through `a2a-common`'s `createArtifactStore()`, which has two backends:

| Where | Backend | Public URL |
|---|---|---|
| Cloud (always) | **R2 bucket `a2a-agents-artifacts`** via the S3 API (`aws4fetch`, SigV4) | `https://pub-ae7a7d0dbe1049c69ae60848bc58bfbf.r2.dev/<key>` |
| Local, `R2_*` keys filled in `.env` (the usual setup here) | same real R2 bucket | same |
| Local, no R2 creds | `<agent>/output/<key>` on disk, served by the owning agent at `/artifacts` | `http://localhost:<port>/artifacts/<key>` |

Selection is all-or-nothing (all five `R2_*` vars present → R2, else silent local fallback) — confirm via the boot log line `artifact store: r2|local`. The local fallback deliberately produces the identical URL contract as r2.dev, so the closed loop, CI, and prod share one URL shape.

Who writes what (the `<key>` is the same in both backends):

| Artifact | Producer | Key | Local fallback path | Local URL |
|---|---|---|---|---|
| **Synthetic legacy source pages** (the content generator's output — full HTML, clean/dated/messy) | content-gen | `sources/<taskId>.html` | `agents/content-gen/output/sources/<taskId>.html` | `http://localhost:4002/artifacts/sources/<taskId>.html` |
| **Eval screenshots** (target + diff PNGs from the visual dimension) | eval-service | `screenshots/<file>.png` | `agents/eval-service/output/screenshots/<file>.png` | `http://localhost:4001/artifacts/screenshots/<file>.png` |

Two things to know about the content-gen pages specifically:

- **They must be publicly fetchable to be useful beyond localhost.** The migration backends (Make.com's cloud scenario, Kimi in the cloud container) and the cloud eval agent fetch the source page by URL — a `localhost:4002` URL only works when the whole loop runs locally. That's why R2 is the usual setup even for local dev: a locally generated page lands on the public r2.dev URL and any backend, local or cloud, can consume it.
- **The URL is the handoff, the row is the index.** The generated page's URL is returned in the A2A task result and threaded into the migration step; an `artifacts` row (URL, kind, task FK) records it for queries. The HTML bytes are never stored in the database.

Local `output/` dirs are gitignored and safe to delete (you lose old local-fallback artifacts; R2-stored ones are unaffected).

### Login sessions: no database at all

The dashboard's Google SSO (Auth.js v5) uses **JWT sessions** — the session is an encrypted cookie in your browser, signed with `AUTH_SECRET`. Nothing server-side to store or lose: a container can sleep, restart, or be redeployed and you stay signed in. The only durable trace of identity is `runs.user_email`, written at run-creation time from the JWT.

### Why this matters operationally

- **Container sleep/wake is lossless** — wake the coordinator after a quiet night and every run, task, and report is still in D1; the in-browser JWT means you're still logged in.
- **The store, not the stream, is the contract** — severed SSE streams recover via `tasks/get` against the persisted Task rows; the eval agent rebuilds its queue from `tasks` on boot (with a 30-min `created_at` age guard so churn can't resurrect zombies).
- **Local and cloud never share data** — local runs land in your local SQLite files; cloud runs land in D1. The dashboards show whichever store their process is pointed at. (Keep `D1_PROXY_URL` commented out in `agents/.env` unless you *want* a local agent writing to the production store.)

---

## Tests

```bash
npm run test:e2e     # fast tier (~16s): 46 tests, protocol contract, stub engine — the CI gate
npm run test:live    # live tier: REAL engine — Chromium, axe, screenshots; $0 (no API keys)
npm run test:soak    # 10× loop endurance
npm run test:cloud   # CLOUD tier: drives the DEPLOYED mesh on content-factory*.jackzhaojin.com
```

Monorepo philosophy: **real tests only, no mocks.** Fast/live/soak spawn actual agent servers (isolated 14xxx ports + throwaway SQLite); the cloud tier spawns nothing — it drives the public hostnames with the real A2A client and asserts store state through `/store/runs` + `tasks/get`, exactly like a production consumer.

Cloud tier (`e2e/tests-cloud/`, gated on `A2A_MESH_TOKEN` in env):
- `cloud-mesh` — all four `/health`s; Agent Cards advertise public origins; `/a2a` + `/store/runs` 401 without bearers; a dryrun full-loop completes with the D1 run row, R2 source URL, live progress, and a real eval score
- `cloud-kimi` — **opt-in** (`DALIVE_TEST_OWNER` + `DALIVE_TEST_SITE`; writes to real da.live, spends a K2.6 turn): full-loop with `backend: opencode` → asserts a real `*.aem.page` preview URL, all three stages completed, all four dimensions scored, run durable in D1. ~11 min.

The fast tier's 13 suites and live tier's 6 are enumerated in [`e2e/`](./e2e/) and the [build report](../ai-docs/2026-06-08-a2a-platform-v2.0/04-testing-and-status.md).

---

## Cloudflare resources

| Resource | Name / ID |
|---|---|
| Worker | `content-factory` — 5 custom domains, the D1 proxy, all secrets; source in [`deploy/`](./deploy/) |
| Containers | `content-factory-{coordinator,eval,contentgen,migration}container` — singletons, scale-to-zero |
| D1 database | `a2a-agents` — `db84ebfc-2132-45ac-902d-7ef7117786e8` (schema = the same `a2a-common/migrations/` files, applied via wrangler) |
| R2 bucket | `a2a-agents-artifacts` — public at `pub-ae7a7d0dbe1049c69ae60848bc58bfbf.r2.dev` (S3 API from containers; [docs/r2-setup.md](docs/r2-setup.md)) |
| Tunnel (legacy) | `a2a-mesh` → `a2a.jackzhaojin.com` → local `:4003` only — the Make.com ingress to a LOCAL migration agent; the dashboard hostname moved to the Worker at M5 |

---

## The whole v2.0 story — what this is and why it exists

### The thesis

v1.x (`content-authoring-eval/`, now frozen) proved the *idea*: AI can migrate web content into da.live and AI can judge the quality of that migration. But it proved it as a single coupled Next.js app — one process, one vendor, one entry point, evaluation and migration welded together. v2.0 is the same idea rebuilt as **a mesh of independently-addressable agents speaking an open protocol (A2A)**, because the interesting questions for 2026 aren't "can a model do this?" — they're architectural:

- **Can agents from different runtimes and vendors compose?** The migration agent's backends are the proof: the *same* `migration.run` contract is served by a simulation, by a Make.com cloud scenario, and by **Kimi K2.6** (a non-Anthropic model driven through `opencode serve`) — while the eval agent judging the output runs on **Claude**. One pipeline, two model vendors, zero contract changes. That's the multi-vendor thesis made concrete.
- **Can quality be measured, not vibed?** Every migration is scored by a real 4-dimension engine (structure, accessibility, content fidelity, visual) with deterministic tools (cheerio, axe, Playwright screenshots) *and* an agentic Claude tier on top. Fan-out + variance stats (`μ ± σ`, pass rate, per-dimension distributions) turn "run it once and hope" into "run it ×N and know."
- **Can the whole thing survive reality?** Processes restart, containers sleep, streams sever, scenarios outlive callers. The store — not process memory, not an open stream — is the contract. Every agent persists full A2A Tasks; every consumer can recover from `tasks/get`. This rule was written in the PRD and then proven the hard way during the cloud deploy.

### The shape

Four agents, one protocol, one shared chassis:

- **`a2a-common`** is the chassis every agent boots from: Agent Card at `/.well-known/agent-card.json`, JSON-RPC + SSE at `/a2a` (mesh-token gated), an **edge webhook shim** (`POST /hooks/{agent}/{skill}` — one flat POST + callback webhook, so Make.com/curl/cron never need to speak A2A), store-backed tasks and push configs, and the dual-driver store seam (SQLite locally, D1 in the cloud — same SQL, selected by env).
- **content-gen** manufactures the demo's raw material: synthetic "legacy" pages (clean / dated / messy) with a `groundTruth` the eval can score fidelity against, published to a public URL (R2) because downstream agents and cloud scenarios must be able to fetch them.
- **migration** is a facade — one Agent Card, swappable backends. The seam is the point: "Claude vs Kimi on the same 10 migrations" is a config change, not a rewrite. The Kimi backend reuses the `da-live-author-playwright` **skill as a service** — the same skill file a human-driven Claude session uses, executed headlessly by a different vendor's model.
- **eval** is the v1 engine, decoupled: headless, job-queued, browser-pooled, restart-rebuilding, with reports persisted to `eval_reports` and screenshots to R2.
- **coordinator** composes them: deterministic route table (`evaluate` | `migrate` | `generate+migrate` | `full-loop` | `auto` — any subset, no mandatory start or end), fan-out with capped concurrency, one `contextId` threaded through every child so the stores tell one joinable story, variance aggregation, and live forwarding of child working-notes (the dashboard's `K2.6 → dalive_save_dalive_content` lines are real-time observability of another vendor's tool calls).
- **The dashboard** rides the coordinator's own process: Google SSO (Auth.js), per-user run attribution in the store, trigger any route/backend, watch the live activity trail, read branch grids and variance — its Next backend owns no database and consumes the same `/store/runs` surface any other client would.

### The journey (June 5 → June 10, 2026)

1. **PRD + decisions** (D1–D6): Cloudflare D1+R2 as the eventual home, official A2A SDK, one server per agent, freeze v1 as the safety net, deploy *last* — prove everything on localhost first.
2. **M1–M2**: walking skeleton → real eval engine extracted from v1 → push notifications, mesh auth, edge shim, coordinator with batch + variance. Two M2 spikes answered the scary Cloudflare questions early (how containers reach D1; whether long SSE survives) — both POCs stayed in `references/cloudflare/` and paid for themselves at M5.
3. **M3**: routed pipelines and the closed loop locally; then the breakthrough — **Kimi K2.6 authoring real da.live pages** through the migration facade, which also surfaced and fixed undici's 300s timeout ambush on long agentic turns.
4. **M4**: the coordinator dashboard (v1-app styling, database-free backend), then Google SSO with per-user runs.
5. **M5 (2026-06-10)**: the whole mesh containerized and deployed behind one Worker — and hardened through six observed production failure modes (container crashloops, quiet-SSE cuts, queue silence, rollout collateral, orphan resurrection, and the root-CLI agentic break whose fix was hiding in the frozen v1 Dockerfile). Full chronicle: [build-report 07](../ai-docs/2026-06-08-a2a-platform-v2.0/07-m5-cloudflare-deployment.md). Acceptance: cloud e2e 4/4, Kimi-authored real page scored 91 by the real agentic eval, end to end on Cloudflare.

### What's deliberately still open

Make.com scenario re-validation against the cloud callback base · the `sdk` (Claude Agent SDK) migration backend and the content-gen agentic tier · an LLM planner upgrading `goal: auto` beyond the state table · graceful run-aware deploys · container-log visibility · the v2.0 release tag.
