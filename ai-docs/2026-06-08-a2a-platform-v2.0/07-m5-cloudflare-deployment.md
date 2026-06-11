# 07 — M5: The Cloudflare Deployment (as-built, with the war stories)

**Date**: 2026-06-10 (single working session, ~4 hours wall-clock from "let's finish deploying this thing" to acceptance-green)
**Status**: **DEPLOYED AND ACCEPTED.** The entire v2.0 mesh runs on Cloudflare Workers + Containers. Cloud e2e 4/4, including the headline: Kimi K2.6 authoring a real da.live page *from a container* and the real agentic eval scoring it 91.
**Companion docs**: [`03-cloudflare-and-deployment.md`](./03-cloudflare-and-deployment.md) (the pre-M5 infra: D1/R2/tunnel), [`05-opencode-kimi-backend.md`](./05-opencode-kimi-backend.md) (the backend this deployment had to containerize), [`06-coordinator-dashboard-and-hardening.md`](./06-coordinator-dashboard-and-hardening.md) (the dashboard + SSO that rode along).
**Operational reference**: [`agents/deploy/CLAUDE.md`](../../agents/deploy/CLAUDE.md) — the living runbook. This doc is the *narrative*: why each decision, what broke, how it was fixed.

---

## Executive summary

M5 took the mesh from "runs on Jack's laptop behind a cloudflared tunnel" to "runs on Cloudflare, laptop optional":

| | Before (M1–M4) | After (M5) |
|---|---|---|
| Compute | 4 Node processes on the laptop | 4 Cloudflare Containers behind one Worker |
| Store | local better-sqlite3 files | Cloudflare D1 via a Worker-proxy driver |
| Artifacts | R2 (already) | R2 (unchanged — it was designed for this) |
| Dashboard | laptop :4004 via tunnel | `content-factor-dash.xpri.ai` → coordinator container |
| Public surface | tunnel → :4003 only | 5 custom domains on the `content-factory` Worker |
| Availability | laptop awake + tunnel up | scale-to-zero containers, ~5–30s cold start |

The session split into four phases: **(1)** an async store seam so one codebase speaks SQLite locally and D1 in the cloud, **(2)** four Docker images + a routing Worker, **(3)** deploy + DNS + secrets, **(4)** a long deploy-test-fix loop where every distributed-systems failure mode showed up on schedule and got a durable fix. Phase 4 is most of this document, because that's where the real engineering lives.

A note on method: almost nothing in phases 1–3 was guessed. Two M2-era POCs in `references/cloudflare/` (the D1-access spike and the long-SSE spike) had already answered the two scariest questions, and the frozen v1 app's Dockerfile turned out to hold the answer to the third (agentic eval in a container). The session's job was assembly plus the discovery of five *new* failure modes nobody had spiked.

---

## Phase 0 — What we knew going in (the POC dividend)

### Why deploy-last was the right call (D6, vindicated)

The PRD deliberately scheduled deployment last so that every feature was proven against localhost before any cloud variable entered the picture. That paid off twice over: when cloud runs failed, *the agent logic was above suspicion* — the search space was always "what's different about Cloudflare," never "is the coordinator's fan-out wrong."

### POC 1: `references/cloudflare/d1-container` — how containers reach D1

The M2 spike had already settled the store question with measurements:

- **Cloudflare Containers get NO native bindings.** No `env.DB`, no KV, nothing — only string env vars injected at container start. A container cannot touch D1 directly.
- The viable pattern is **Worker-proxy**: the fronting Worker holds the `d1_databases` binding and exposes a secret-gated `POST /d1/query {sql, params}`; the container calls back over the public edge.
- Measured: **~100 ms/query steady state** (best ~65 ms, fresh-placement spikes to ~300 ms), essentially all network. Fine for task-record CRUD; would be wrong for hot per-token loops.
- The D1 REST API alternative was rejected (needs an account-scoped API token with rotation burden, and rides the slower control plane).

### POC 2: `references/cloudflare/long-session-container` — do long SSE streams survive?

The migration agent's Kimi turns run 9–20 minutes over a single A2A SSE stream. The spike proved:

- **Open SSE streams block container sleep** — a 22-minute stream ran with zero drops on `sleepAfter=2m`.
- Wake-from-sleep ≈ 5s, and all in-memory state is gone — empirical proof of the sleep-tolerance rule (the store, not process memory, owns task state).

What the spike did **not** test — and what bit hard in phase 4 — was a long **quiet** stream. The POC ticked every 5 seconds. Real agentic work goes silent for minutes.

---

## Phase 1 — The async store seam (`StoreDb`)

### Why

Every agent used better-sqlite3 *synchronously* (`db.prepare(sql).run(...)`). D1-over-HTTP is unavoidably async. The whole persistence layer needed an async seam without forking the codebase into "local" and "cloud" variants — one code path, two drivers, selected by env.

### What

`a2a-common/src/store/db.ts` now exports:

```ts
interface StoreDb { prepare(sql): { run(...p): Promise<{changes}>; get<T>(...p): Promise<T|undefined>; all<T>(...p): Promise<T[]> } }
```

- **`SqliteDb`** wraps better-sqlite3 (sync under the hood, async-shaped) and keeps the migration runner — local dev byte-identical.
- **`D1ProxyDb`** POSTs `{sql, params}` to `${D1_PROXY_URL}/d1/query` with an `x-d1-secret` header. Selected when `D1_PROXY_URL` + `D1_PROXY_SECRET` are set; fails fast at boot with a `select 1` probe.

Deliberately kept the `prepare()` shape so ~30 call sites changed by adding `await`, not by restructuring.

### How (and the four ripples)

1. **Named parameters died.** The task store used better-sqlite3's `@named` binding; D1 only binds positional `?`. The upsert was rewritten positionally with `excluded.` references.
2. **Module top-level went async.** `openDb` returning a Promise forced `startAgentServer` async and top-level `await` into all four agent entrypoints (ESM + tsx + ES2022 — free).
3. **Sync corners became fire-and-forget or async**: Express handlers in `runs-routes.ts`, `recordArtifact`, `writeEvalReport`, and the coordinator's `persistNote` (best-effort `.catch(() => {})` — a progress note must never stall a run).
4. **Agent Cards got `A2A_PUBLIC_BASE`.** Cards advertised `http://localhost:{port}/a2a`; mesh clients resolve the card and call `card.url`, which only works on one machine. Containers now advertise their public hostname.

**Validation before any cloud risk**: typecheck clean, the 46-test fast e2e tier green on the sqlite driver, and then — the clever bit — the **D1 driver was smoke-tested against live D1 through the still-deployed POC worker** (`/store/runs` returned `{"runs":[]}` from real D1) *before a single new cloud resource existed*. Commit `836de24`.

### Challenge: better-sqlite3 is a native module

First Docker build failed instantly: no prebuilt binary for the image's Node ABI, no compiler toolchain in `node:20-bookworm-slim`. Three options were weighed:

- ❌ Install python3/make/g++ in every image (+~300 MB, slow builds, pure waste — containers never open SQLite).
- ❌ `--omit=optional` after demoting it to an optionalDependency — **doesn't work**: `ui`/`store-mcp`/`e2e` still depend on it as a regular dep, so the lockfile node isn't "optional," and `npm ci -w X` materializes the *whole* workspace tree regardless.
- ✅ **`--ignore-scripts`** on `npm ci` in every Dockerfile + a **lazy `createRequire`** inside `openSqliteDb`. The package's files install but never compile; the d1-proxy path never `require()`s it. esbuild/Next's swc are unaffected (their binaries ship as platform packages, not install scripts).

This is documented as a load-bearing gotcha: removing `--ignore-scripts` "to clean up" will re-break every image.

---

## Phase 2 — Containerizing four very different agents

### Why one Worker, four container classes

A single Worker (`content-factory`) owns: hostname routing, the D1 binding + `/d1/query` proxy, and all secrets (injected into containers as string env at start — the only mechanism that exists). Four Durable-Object-backed `Container` classes, `max_instances: 1`, `getContainer(ns, "singleton")`. One deploy unit, one secret store, one place to reason about routing.

### The hostname scheme ("content factory ish")

| Hostname | Routes to | Why |
|---|---|---|
| `content-factory.xpri.ai` | coordinator | A2A surface + the canonical `D1_PROXY_URL` |
| `content-factor-dash.xpri.ai` | coordinator | **The Google-OAuth-registered redirect host.** Reusing it meant zero Google Console changes — the existing OAuth client, session cookies, and `AUTH_SECRET` all carried over from the tunnel era untouched. |
| `content-factory-eval.xpri.ai` | eval | mesh URL the coordinator dials |
| `content-factory-gen.xpri.ai` | content-gen | 〃 |
| `content-factory-migrate.xpri.ai` | migration | 〃 + `MIGRATION_CALLBACK_BASE` |

All single-level subdomains — Cloudflare Universal SSL covers `*.xpri.ai` one level deep; nesting under `content-factory.` would have needed paid certs.

### The four images (what's special about each)

**content-gen** (`lite`, 396 MB) — the control specimen. Plain Node, no browsers, no LLM. It booted in the cloud on the first try, which proved the entire chassis (workspace install, d1-proxy, card publishing, Worker routing) before the hard images were attempted.

**coordinator** (`basic`, 420 MB) — bakes `next build` into the image; at runtime the same hybrid process serves the A2A surface and the production Next dashboard on :8080. One latent bug surfaced here: the SSO route wrapper from the morning's work typed its params as `Request` where Next 15's generated route types demand `NextRequest` — the local dev server never type-checks, `next build` in Docker does. Fixed with `new NextRequest(url, req)` (the exact shape of next-auth's own `reqWithEnvURL`).

**eval** (`standard-3`, 2.25 GB) — Chromium via `playwright install --with-deps`, global MCP servers, the Claude Agent SDK. Looked done after one local smoke test ran a real evaluation (chromium + axe, example.com scored 66). It was not done — see phase 4; this image was eventually rebuilt around the v1 recipe.

**migration** (`standard-1`, ~616 MB + browser layer) — the exotic one:
- **opencode binary** via the official install script (linux/amd64, landed as v1.17.3).
- **The kimi-code provider config baked** at `/root/.config/opencode/opencode.jsonc` — a faithful copy of the laptop's global config, safe to commit because the key arrives at runtime via `{env:MOONSHOT_API_KEY}`.
- **The `da-live-author-playwright` skill synced, not sourced**: it lives at the *monorepo* root (`/.claude/skills/`), outside the `agents/` build context. A `predeploy` script (`npm run sync-skill`) copies it into gitignored `deploy/skills/` so the Dockerfile can `COPY` it. Drift-safe because the sync runs on every deploy.
- **`PLAYWRIGHT_MCP_BIN`** — a small but important code change to `opencode-config.ts`: locally the backend launches `npx -y @playwright/mcp@latest` (fetches latest from npm every run); in a container that's a runtime network dependency *and* a browser-revision roulette. The env var points at a pre-installed global bin with its exact Chromium revision pre-pulled.

### Cross-cutting Docker gotchas

- **Everything is linux/amd64** (Cloudflare requirement). Local test builds on Apple Silicon need `--platform linux/amd64` explicitly.
- **npm workspaces in Docker**: `npm ci -w @agents/X` *validates the entire workspace tree*, so every workspace's `package.json` stub must be COPY'd even into images that use none of them.
- **`@playwright/mcp` renamed its bin** upstream from `mcp-server-playwright` to `playwright-mcp`; the eval engine's Docker path hardcodes the old name → symlink in the image. Caught only because the local smoke test listed `/usr/local/bin`.
- Build order discipline: **smallest image first** (content-gen), debug the chassis cheaply, then fan out the three heavy builds in parallel.

---

## Phase 3 — Worker, deploy, DNS, secrets

### The Worker (`agents/deploy/src/index.ts`)

~200 lines: a hostname→namespace map, the `/d1/query` proxy (lifted nearly verbatim from the POC, secret moved from a plaintext var to a real secret), `/worker-health`, and per-class `envVars` built in each Container constructor from Worker vars + secrets. Sleep budgets: coordinator 1h, eval/migration 30m, content-gen 20m — generous because the long-SSE POC proved open streams block sleep anyway.

### Deploy mechanics

`wrangler deploy` builds all four images locally (Docker daemon, layer cache shared with the hand-built test images) and pushes to Cloudflare's managed registry. First full deploy ≈ 10 min dominated by the 2.25 GB eval push; subsequent deploys skip unchanged images entirely ("Image already exists remotely").

**Secrets** (13 by the end): `D1_PROXY_SECRET` (minted fresh), mesh/edge tokens, R2 keypair, the three `AUTH_*` SSO values, `MOONSHOT_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` (recovered from the v1 app's `.env.local` — the laptop shell never had it), and later `CLAUDE_ACCOUNT_UUID`/`CLAUDE_EMAIL`/`CLAUDE_ORG_UUID` (from the v1 app's `.env.docker`). Staged into a throwaway script and `wrangler secret put` immediately after the worker existed, before any container's first boot.

**D1 catch-up**: remote D1 was still on the 0001 schema. `0003_runs_live` + `0004_runs_user` applied via `wrangler d1 execute --file` (D1 has no `_migrations` table — file-by-file is the convention). The laptop's 10-run history was exported as `INSERT OR IGNORE` statements and imported, so the cloud dashboard was born with its history intact.

**The DNS flip**: `content-factor-dash.xpri.ai`'s CNAME to the tunnel was deleted via the Cloudflare API, the hostname added as a Worker custom domain, and the tunnel config shrunk to `a2a.xpri.ai → :4003` only (legacy local Make.com ingress). The Worker preserves Host headers, so the dashboard's Auth.js origin-rewrite — built that morning for the tunnel — worked on containers unchanged. Bonus discovered during UI validation: **the existing browser session JWT kept working** (same hostname + same `AUTH_SECRET`), so the flip was invisible to a signed-in user.

### Challenge: the self-inflicted DNS wound

Curling `content-factory.xpri.ai` *before* its DNS record existed poisoned macOS's mDNSResponder with a negative entry for ~30 minutes. `dig` resolved fine (it bypasses the system cache); node/curl got `ENOTFOUND`; no sudo available to flush. Worked around with `curl --resolve` pinning and by validating through the dash hostname (which predated the session) until the TTL expired. *Lesson: create DNS first, probe second.*

---

## Phase 4 — The deploy-test-fix loop (where the real lessons live)

Everything below was found by running real workloads against the deployed mesh and reading the evidence — D1 task rows, run progress trails, eval queue gauges — because **container stdout is effectively invisible** (worker logs don't include it), which made the store itself the primary debugging instrument. Fitting, given the architecture's thesis.

### Failure 1 — The eval container died mid-evaluation (and the crashloop)

**Symptom**: first cloud full-loop froze at `dimension structure: complete (score 60)`; minutes later the eval container's health showed an empty queue and `maxObserved: 0` — a fresh process. The coordinator's branch failed with `TypeError: terminated`.

**Diagnosis**: the container was dying partway through the agentic dimensions, restarting, and the restart-rebuild loop was re-enqueueing the same eval — which killed it again. A crashloop, visible only as oscillating health gauges and `tasks` rows whose `updated_at` kept refreshing.

**Fixes (layered)**: instance bumped standard-1 → **standard-3** (2 vCPU / 8 GiB); later `EVAL_CONCURRENCY=1` in the cloud (two concurrent agentic evals — each chromium + four Claude CLI subprocesses — killed even standard-3). The *true* root cause turned out to be failure 5.

### Failure 2 — Quiet SSE streams die at ~3–5 minutes

**Symptom**: with the container stable, the eval stream still cut (`TypeError: terminated` at 208s, 280s, 293s across runs) while the eval container kept working happily.

**Diagnosis**: agentic passes emit *nothing* for minutes; a silent SSE crossing the Worker↔container hops gets reaped by an idle timeout somewhere in the middle. The long-SSE POC never saw this because it ticked every 5s. The undici-timeout kill-switch (`a2a-common/src/net.ts`) protects the *client* end only — the middle of the path is Cloudflare's.

**Fixes — both ends**:
1. **Heartbeats at the source**: the eval executor publishes a `working: evaluating…` note every 45s while the engine runs, and (after failure 3) another while *queued*. No quiet window > 45s anywhere in an eval's life.
2. **Recovery at the sink — the structural fix**: the coordinator's `callAgent` now treats the task store as the source of truth. A severed or cleanly-ended stream that hasn't reached a terminal state falls into a `tasks/get` polling loop (10s interval, 25-min window) that harvests state *and artifacts* from the persisted Task. This is the sleep-tolerance rule completing its arc: streams are an optimization; the store is the contract. It is also exactly what makes 20-minute Kimi turns safe against *any* future stream cut.

### Failure 3 — The queue is silent too

**Symptom**: a test's *own* stream (test → coordinator) died during eval recovery; separately, a run showed a 4.9-minute gap with no eval notes at all.

**Diagnosis (two sub-cases)**: (a) a task parked in the eval queue behind another eval emits zero events until `runEvalJob` starts — the in-flight heartbeat doesn't cover the *wait*; (b) the coordinator's recovery loop itself emitted nothing while polling, so the coordinator's own callers went quiet and got reaped — the same disease one hop up.

**Fixes**: a queue-wait heartbeat in the eval executor (started at task acceptance, cleared when the job dequeues), and the recovery loop emits a `recovery: task … still 'working' (40s)` note every 4th poll. *The general law discovered here: on this platform, every layer that can be silent for minutes will eventually be the thing that kills a stream. Heartbeat every layer.*

### Failure 4 — Rollouts kill in-flight runs

**Symptom**: a validation run died with status `failed`, progress simply stopping after `migrate: completed` — no error note at all.

**Diagnosis**: a `wrangler deploy` replaces container instances; the coordinator's boot-time restart policy then marks any `running` run as `failed` (correct behavior — re-fanning-out blindly could double-run children). The run was collateral of the deploy that was meant to fix the previous failure. This also kept *re-creating* eval orphans for failure 5 to resurrect.

**Fix**: operational, not code — **deploy between runs, never during**. Documented in the runbook. (A graceful-drain mechanism is plausible future work; for a demo platform the rule is enough.)

### Failure 5 — Orphan resurrection (the subtle one)

**Symptom**: after marking crashloop orphans `failed` directly in D1 and adding an age guard (`updated_at` > 30 min ⇒ expire instead of re-enqueue), the zombie queue *came back anyway* — at one point 1 running + 3 queued when only one live eval existed.

**Diagnosis**: a genuinely sneaky feedback loop. The rebuild re-enqueues a task and starts applying events to it — *which refreshes `updated_at`*. So under container churn, an abandoned task's `updated_at` is always fresh, and an updated_at-based age guard can never fire. The guard was measuring the symptom it was supposed to prevent.

**Fix**: key the guard on **`created_at`** — an eval legitimately takes minutes, never 30; any submitted/working eval task created >30 min ago is abandoned by definition (its caller's recovery window is 25 min) and gets marked failed at boot. The next boot purged the zombies in one pass and the queue finally told the truth.

### Failure 6 — The agentic tier was structurally broken (the v1 recipe)

**Symptom**: even with a stable container and a singleton queue, agentic evals never finished — the task would sit `working` until something (churn or the age guard) ended it. Deterministic-only evals (no token) completed in ~40s. The one variable: `CLAUDE_CODE_OAUTH_TOKEN` being present.

**Diagnosis**: the answer was sitting in the repo, in the **frozen v1 app's Dockerfile** (read-only — D5 respected), which carries battle scars as phase-numbered comments:

1. *"PHASE 25.3: Create non-root user (REQUIRED for Claude CLI --dangerously-skip-permissions)"* — **the Claude CLI refuses agentic permission-skipping as root.** The M5 eval container ran as root. Every agentic pass died at spawn; retries multiplied chromium/CLI churn, which is almost certainly what was killing the container back in failure 1.
2. A runtime-generated **`.claude.json`** with the `oauthAccount` stanza (`CLAUDE_ACCOUNT_UUID`/`CLAUDE_EMAIL`/`CLAUDE_ORG_UUID`) — required for the CLI to use an OAuth token headlessly; v1 generates it in an entrypoint so credentials are never baked into an image.
3. **Two Playwright browser caches, merged**: the app's playwright revision and @playwright/mcp's revision must be installed into *separate* `PLAYWRIGHT_BROWSERS_PATH`s and merged with `cp -rn` — `playwright install` runs a GC pass that deletes revisions not in the calling package's `browsers.json`, so a shared cache always ends up missing one of them.

**Fix**: `eval.Dockerfile` rebuilt around the recipe — `useradd appuser`, `USER appuser`, `HOME=/home/appuser`, `eval-entrypoint.sh` generating `.claude.json` from three new Worker secrets, global `@anthropic-ai/claude-code`, dual-cache browser install (chromium-1223 + chromium-1226 verified side-by-side in the image).

**Result, first try after the rebuild**: an eval report with **both `deterministic` and `agentic` tiers on all four dimensions** — real Claude analysis inside a Cloudflare Container. The frozen backup app earned its keep not by running, but by remembering.

### Honorable mention — cold starts

Scale-to-zero means the first request after idle pays 5–30s while a container boots (the coordinator additionally 404s `/` for a few seconds while Next mounts — retry, not a bug). The fix was `callAgent` retrying the initial connection (4 attempts, 15s apart) with a `cold start? — retry 1/3` note, so a sleeping agent can never instantly fail a branch. The note showed up in production trails the same hour.

---

## Phase 5 — Cloud e2e and the acceptance

### The test tier (`agents/e2e/tests-cloud/`, `npm run test:cloud`)

A third vitest tier alongside fast/live, with cloud-specific rules: no spawned servers (drive the public hostnames), no direct sqlite/D1 assertions (everything through `/store/runs` + `tasks/get` with bearer tokens — the same surface production consumers get), 25-minute timeouts, `describe.skipIf` gating (mesh token for tier 1; `DALIVE_TEST_OWNER`/`SITE` to opt into the Kimi tier, which writes to real da.live and spends a K2.6 turn).

- **`cloud-mesh.cloud.test.ts`**: all four `/health`s; every Agent Card advertises its public origin; `/a2a` and `/store/runs` 401 without tokens; a dryrun full-loop completes with the run row in D1 (`userEmail: null` — mesh-triggered = system run), the synthetic source on `r2.dev`, live progress persisted, eval score > 0.
- **`cloud-kimi.cloud.test.ts`**: full-loop with `backend: "opencode"` — asserts the eval target is a real `*.aem.page` preview URL, all three stages completed, all four dimensions scored, and the run is durable in D1. On failure it prints the last 15 progress notes, because cloud debugging without the trail is guesswork.

### The acceptance run (2026-06-10 ~23:38–23:50 UTC)

```
 ✓ all four agents healthy, cards advertise public origins        17s
 ✓ A2A surface mesh-token gated                                   0.4s
 ✓ dryrun full-loop: D1 run row + R2 artifacts                    4m23s
 ✓ Kimi K2.6 + real eval: authors a real da.live page, scores it  11m08s
 Tests: 4 passed (4)
```

The Kimi branch, from the D1 progress trail: generate **1.4s** → migrate (opencode/K2.6) **9m03s** — `opencode serve` booted in-container, the skill fired, **15 tool calls** streamed live (`dalive_get/save/preview_publish_dalive_content`, `playwright_browser_navigate/evaluate/take_screenshot/snapshot`), including K2.6 gracefully routing around one transient `da.live API unavailable` error on the known-flaky list tool → evaluate **2m01s** with both tiers.

**Final: overall 91 (±0), pass rate 100%, migration confidence 90 — structure 83 / accessibility 100 / content 79 / visual 100.** The page is real and public: `https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-opencode-4d719aaf/content-factory-cloud-28d297-b1`.

### UI validation (in Chrome, against the cloud)

Verified by hand in the browser against `content-factor-dash.xpri.ai`: Google SSO gate (and the pre-flip session surviving the DNS move), all four mesh chips green (the cloud coordinator probing its sibling containers over public hostnames), D1-imported run history rendering, a run **triggered from the UI** landing in D1 with `user_email = jackzhaojin@gmail.com` (SSO attribution end-to-end in the cloud), the live-activity feed streaming K2.6 tool calls during the acceptance run, and the finished run's branch grid + variance table. Plus the published da.live page itself, rendering with hero and styled blocks.

---

## Performance characteristics (measured, not estimated)

| Operation | Cloud timing |
|---|---|
| D1 query via Worker proxy | ~100 ms typical, 65–300 ms range |
| Container cold start | ~5–30 s (image-size dependent); coordinator + a few s for Next mount |
| content-gen synthesize → R2 | ~1–2 s |
| dryrun migration | ~1 s |
| Deterministic-only eval | ~15–40 s |
| Full agentic eval (4 dims, both tiers) | ~2 min |
| Kimi K2.6 real migration | ~9 min (local-era runs: similar — the container costs nothing material) |
| Full closed loop (real everything) | ~11 min |
| `wrangler deploy`, no image changes | ~10 s |
| `wrangler deploy`, eval image changed | ~3–5 min |

The honest answer to "is the cloud slow?": no — steady-state matches the laptop. What *felt* slow during the session was failure handling: crashloops, zombie queues, and rollout collateral, each now structurally fixed.

---

## The commit trail (all on `main`, trunk-based)

| Commit | What |
|---|---|
| `4b1138a` | Google SSO + per-user runs (the morning's prelude — rode into every container) |
| `836de24` | feat(a2a-common): async store seam + D1 Worker-proxy driver |
| `1b46912` | feat(deploy): Worker + 4 Dockerfiles + content-factory routing |
| `3dec6ec` | test(e2e): the cloud tier |
| `ad70fe8` | docs(deploy): as-deployed runbook + dash hostname flip |
| `3a99f26` | fix(coordinator): stream-cut recovery via tasks/get + eval heartbeat |
| `982fe48` | fix(agents): queue heartbeat, recovery-poll heartbeat, orphan age guard |
| `d52efa1` | fix(deploy): the v1 agentic recipe (non-root, .claude.json, dual browsers) |
| `d19aa3c` | docs: M5 complete, acceptance green |

---

## What's deliberately not done (honest backlog)

- **Make.com in the cloud**: the makecom backend's `MIGRATION_CALLBACK_BASE` points at the public migrate hostname and *should* work, but the scenario round-trip hasn't been re-validated against the container; `a2a.xpri.ai` → local :4003 remains the tested path.
- **Graceful deploys**: rollouts still kill in-flight runs (boot policy marks them failed — safe, but blunt). A drain step or run-aware deploy gate is future work; for now the rule is "deploy between demos."
- **Container log visibility**: container stdout doesn't reach `wrangler tail`; debugging leaned entirely on the store. Shipping a lightweight log-to-D1 (or Workers Logs ingestion) would shorten the next incident.
- **Push-notification fallback for mesh calls**: `tasks/get` polling recovery is in and sufficient; A2A push configs between coordinator and children would eliminate even the polling.
- **The legacy `agents/ui` (:3000)** still reads local SQLite files directly and cannot run against D1 — superseded by the coordinator dashboard; retire or port someday.
- **Multi-instance / scale-out**: everything is `max_instances: 1` singletons. Fine for the demo; horizontal eval workers would need a real queue.
- **Tagging v2.0**: the platform is deployed but not yet release-tagged; the lockstep model (RELEASES.md) applies when ready.

## The lessons, compressed

1. **Spike the scary unknowns early, keep the spikes in the repo.** Both M2 POCs were consulted as primary sources months of context later; the latency table and "containers get no bindings" finding shaped the whole store design in minutes.
2. **A frozen legacy system is documentation.** The v1 Dockerfile's phase-numbered comments (non-root for the CLI, dual browser caches, runtime credentials) were the single highest-value artifact of the session. D5 said "never modify" — it never said "never read."
3. **On a stream-based mesh, silence is a failure mode.** Every layer that can be quiet for minutes — agentic passes, queue waits, recovery polls — eventually kills a stream. Heartbeat all of them, *and* make the store the contract so a dead stream is an inconvenience, not a failure.
4. **Beware metrics that the mechanism refreshes** (the `updated_at` age guard measuring its own symptom). Guard on facts the failure can't touch (`created_at`).
5. **One cheap image first.** content-gen proved the chassis for the price of a 396 MB build; every later failure was therefore known to be agent-specific.
6. **The store-as-truth architecture debugged itself.** With container logs invisible, D1 task rows + run progress trails were the flight recorder. The design principle (PRD part-2) turned out to be an observability strategy too.
