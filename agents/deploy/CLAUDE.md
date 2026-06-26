# CLAUDE.md — agents/deploy

**Purpose**: M5 — the Cloudflare Workers + Containers deployment of the whole A2A mesh. One Worker (`content-factory`) fronts four agent containers via hostname routing and owns the D1 binding. · **Tech**: wrangler 4.x (**Node 22** — `PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"`), `@cloudflare/containers`, Docker (linux/amd64). · **Status**: deployed; this workspace is standalone (NOT an npm workspace — Node version split).

## Topology

| Hostname | Container | Image | Instance |
|---|---|---|---|
| `content-factory.jackzhaojin.com` (+ `content-factor-dash.jackzhaojin.com`, workers.dev fallback) | CoordinatorContainer | `docker/coordinator.Dockerfile` (Next build baked) | basic |
| `content-factory-eval.jackzhaojin.com` | EvalContainer | `docker/eval.Dockerfile` (non-root appuser, dual Chromium caches, Claude CLI + MCP servers, runtime .claude.json) | standard-3 |
| `content-factory-gen.jackzhaojin.com` | ContentGenContainer | `docker/content-gen.Dockerfile` (agentic writer: non-root appuser, Claude CLI, runtime .claude.json — no Playwright) | basic |
| `content-factory-migrate.jackzhaojin.com` | MigrationContainer | `docker/migration.Dockerfile` (opencode + kimi config + skill + Chromium) | standard-1 |

- **D1 access**: containers have NO bindings — the Worker serves secret-gated `POST /d1/query` (header `x-d1-secret`) and a2a-common's `D1ProxyDb` calls back into it (`D1_PROXY_URL`/`D1_PROXY_SECRET` env). ~100ms/query (measured, references/cloudflare/d1-container). Schema changes: `wrangler d1 execute a2a-agents --remote --file …` — D1 has no `_migrations` table.
- **Env into containers**: ONLY string env vars, injected in each Container class constructor (src/index.ts) from Worker vars/secrets. Change an env → redeploy → containers pick it up on next cold start.
- **Long SSE through containers is safe** (22-min streams measured, references/cloudflare/long-session-container); open streams block `sleepAfter`.

## Deploy / operate

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"   # wrangler needs Node 22
cd agents/deploy && npm install
npm run deploy        # predeploy syncs the da-live-author-playwright skill into ./skills
npm run tail          # live worker logs
npx wrangler containers list
```

Secrets (set once; rotate via the same command): `D1_PROXY_SECRET`, `A2A_MESH_TOKEN`, `A2A_EDGE_TOKEN`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `MOONSHOT_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_ACCOUNT_UUID`, `CLAUDE_EMAIL`, `CLAUDE_ORG_UUID` — `printf '%s' "$VAL" | npx wrangler secret put NAME`. These are **container-runtime** secrets and **persist across deploys** (`wrangler deploy` never clears them), so CI does not manage them.

Validate: `cd agents && set -a && source .env && set +a && npm run test:cloud` (tier 1 always; the Kimi tier needs `DALIVE_TEST_OWNER`/`DALIVE_TEST_SITE`).

## CI deploy (GitHub Actions)

`.github/workflows/deploy-agents.yml` runs the exact same `npm run deploy` on a GitHub runner so releases don't depend on a laptop. It's the v2.x+ counterpart to `deploy-content-authoring-eval.yml` (frozen v1.x Oracle line, D5) — the two never overlap.

- **Triggers**: tag push `v[2-9].*` / `v[1-9][0-9].*` (v2.* … v99.*; `v1.*` is excluded — that's the Oracle app), plus `workflow_dispatch` (manual, any branch; `skip_tests` input skips the e2e gate for hotfix redeploys).
- **Flow**: `verify` job (Node 20, `agents/`: `npm ci` → `typecheck` → `test:e2e` stub gate) → `deploy` job (Node 20→**22**, Docker Buildx, free-disk, `npm install` in `deploy/`, `npm run deploy`, then a `/worker-health` smoke probe). Runner is linux/amd64 so images build amd64 with no `--platform` flag.
- **Two repo secrets needed** (add in GitHub → Settings → Secrets → Actions): **`CLOUDFLARE_API_TOKEN`** — account-scoped, permissions **Workers Scripts Edit · Cloudflare Containers Edit · Workers R2 Storage Edit · D1 Edit · Account Settings Read** (+ **Workers Routes Edit** only if you change custom domains in wrangler.jsonc); **`CLOUDFLARE_ACCOUNT_ID`** — the account id (= `R2_ACCOUNT_ID` in wrangler.jsonc, `957b2690…`). No other secrets: the container-runtime secrets above already live on the Worker.
- **Concurrency**: `group: deploy-agents`, `cancel-in-progress: false` — queues, never races ("deploy between runs, not during"). Rollouts still kill in-flight runs, so cut releases when the mesh is idle.

## Gotchas

- **Images must be linux/amd64**; local test builds need `docker build --platform linux/amd64` (Apple Silicon defaults to arm64 and better-sqlite3 has no arm64-linux prebuilt anyway).
- **`npm ci` runs with `--ignore-scripts`** in every Dockerfile: better-sqlite3 (optionalDependency, native) must NOT compile — containers use the d1-proxy driver and never `require()` it (lazy require in a2a-common/src/store/db.ts). Don't "fix" by removing the flag.
- **`npm ci -w X` still materializes the full lockfile tree** (ui/store-mcp/e2e deps included) — that's why ignore-scripts is the mechanism, not `--omit=optional`.
- **@playwright/mcp's bin is `playwright-mcp`** (renamed upstream); the eval engine's Docker path expects `/usr/local/bin/mcp-server-playwright` → the eval image symlinks it. Migration passes `PLAYWRIGHT_MCP_BIN=/usr/local/bin/playwright-mcp` instead (avoids npx-fetch at runtime).
- **The eval container runs as NON-ROOT `appuser`** — required: the Claude CLI refuses agentic permission-skipping as root (this silently killed the agentic tier AND crashed the container until fixed). The whole agentic recipe mirrors the frozen v1 app's Dockerfile (read it before changing eval.Dockerfile): runtime `.claude.json` via eval-entrypoint.sh (`CLAUDE_ACCOUNT_UUID`/`CLAUDE_EMAIL`/`CLAUDE_ORG_UUID` secrets), global `@anthropic-ai/claude-code`, and TWO merged playwright caches (the app's + @playwright/mcp's revisions GC each other if shared). Content-gen now follows the SAME non-root recipe (its agentic writer shells out to the Claude CLI too) but without Playwright — just the CLI + `content-gen-entrypoint.sh` writing `.claude.json`. Migration + coordinator stay root → Chromium launches need `--no-sandbox` (capture-screenshot.cjs detects `/.dockerenv`; mcp-config.ts and scan-accessibility.cjs already did).
- **Resilience stack (all observed-failure-driven)**: coordinator `callAgent` retries cold-start connects (4×15s), recovers severed streams via `tasks/get` polling with its own heartbeat notes; eval heartbeats while queued AND while evaluating (quiet streams die at ~3-5 min crossing the Worker↔container hop); eval rebuild has a 30-min `created_at` age guard (rebuild refreshes `updated_at`, so churn would otherwise resurrect zombies forever); `EVAL_CONCURRENCY=1` in cloud (2 concurrent agentic evals killed even standard-3).
- **Rollouts kill in-flight runs** (coordinator boot marks running runs failed; container replacement severs streams). Deploy between runs, not during.
- **The skill is synced, not sourced**: `npm run sync-skill` copies `/.claude/skills/da-live-author-playwright` → `deploy/skills/` (gitignored) because the Docker build context is `agents/`. Runs automatically via `predeploy`.
- **opencode global config is baked** (`docker/opencode-global.jsonc` → `/root/.config/opencode/opencode.jsonc`): kimi-code provider, key via `{env:MOONSHOT_API_KEY}`. The generated per-task config (OPENCODE_CONFIG) merges on top.
- **Cold starts**: ~5-30s per container (bigger images slower). First request after idle pays it; sleepAfter: coordinator 30m (demo browsing stays warm), others 15m (cost: scale-to-zero; any dashboard visit wakes the coordinator, mesh calls wake the rest).
- **content-factor-dash.jackzhaojin.com** is the Google-OAuth-registered dashboard hostname — its DNS is flipped from the cloudflared-tunnel CNAME to this Worker (route in wrangler.jsonc). The Worker preserves Host headers, so the coordinator's Auth.js origin-rewrite works unchanged.
