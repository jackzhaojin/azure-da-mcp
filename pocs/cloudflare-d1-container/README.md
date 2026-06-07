# POC: Cloudflare Container → D1 access pattern

**A2A platform PRD open question #7 / M2 spike.**

> "Container → Cloudflare D1 access pattern: Worker-proxy binding vs D1 REST API
> vs libsql driver — answer in the M2 spike."

This POC builds, deploys, and measures the only viable pattern (Worker-proxy)
and documents the alternatives.

- **Worker URL:** https://cf-d1-container-poc.jackzhaojin.workers.dev
- **Worker name:** `cf-d1-container-poc`
- **D1 DB:** `a2a-agents` (`db84ebfc-2132-45ac-902d-7ef7117786e8`) — existing, shared
- **Probe table left behind:** `spike_probe` (created by the test; non-destructive)
- **Status:** deployed, scale-to-zero (effectively free when idle).

---

## The core finding: Containers have NO native bindings

Confirmed against current docs (developers.cloudflare.com/containers/, June 2026):

- Cloudflare Containers are backed by a Durable Object + Worker. **The container
  process does NOT get `env.DB` / `env.KV` / any binding.** Only *string*
  environment variables can be injected (via the `Container` class `envVars`
  field or per-instance `startOptions.envVars`).
- The docs explicitly state bindings can't be passed natively — you must read a
  value (e.g. from a secret store) in the Worker and pass it to the container as
  a string env var.
- This is still true as of this spike. There is no "containers gain bindings"
  feature shipped. So a container **cannot** talk to D1 directly; it must reach
  D1 through code that *does* have the binding — i.e. its fronting Worker.

So the design space collapses to: **how does the container reach a thing that
holds the D1 binding?**

---

## Patterns evaluated

### 1. Worker-proxy (TESTED — recommended) ✅

The fronting Worker holds the `d1_databases` binding. It exposes a small,
secret-gated internal surface (`POST /d1/query {sql, params}`, gated by an
`x-d1-secret` header). The container calls back to its own Worker's public
`workers.dev` URL to run queries.

- The Worker injects `WORKER_BASE_URL` (its own origin) and `D1_PROXY_SECRET`
  into the container as env vars at container start, so the container knows where
  to call and how to authenticate.
- Round trip: `container → public edge → Worker (has env.DB) → D1 → back`.

**This is the path we measured (see results below).**

### 2. D1 REST API (documented — NOT usable here) ⚠️

`POST https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query`
with body `{ "sql": "...", "params": [...] }`.

- **Requires `Authorization: Bearer <API_TOKEN>`** — a scoped Cloudflare API
  token. We only have **wrangler OAuth** on this account; OAuth tokens are not
  accepted by this REST endpoint, and per the task we did **not** mint a token.
- Implications if adopted: you must create + store a long-lived D1 API token as
  a container secret, manage its rotation, and accept its blast radius (a token
  with D1 write is account-scoped to D1). It also bypasses the Worker entirely,
  so you lose the Worker as a place to enforce app-level auth/validation.
- Latency would be container → `api.cloudflare.com` (the control-plane API), not
  the data-plane Worker edge — generally **slower** than the Worker-proxy hop.

### 3. libsql / direct driver (documented — N/A) ⚠️

D1 has no public libsql/TCP wire endpoint you can point a generic SQLite/libsql
driver at. D1 is reached via the Workers binding or the HTTP REST API only. A
libsql driver would still be talking the REST API under the hood and inherits
its token requirement. Not a distinct viable option for D1 today.

---

## Measured latency (Worker-proxy, 10 iterations each, remote D1)

Run from inside the deployed container against the live Worker. Each value is the
**median** over 10 round trips. Multiple passes were taken to capture variance.

```
GET /run-test?base=<worker-url>&secret=<secret>&iters=10
```

| Pass | container state | INSERT median | SELECT median | rows read back |
|------|-----------------|---------------|---------------|----------------|
| A | warm (lucky colo) | **84.6 ms** | **63.7 ms** | 10/10 ✅ |
| B | fresh boot / distant colo | 299.8 ms | 198.1 ms | 10/10 ✅ |
| C | warm, steady-state | 99.5 ms | 100.0 ms | 10/10 ✅ |
| D | warm, steady-state | 100.2 ms | 99.9 ms | 10/10 ✅ |

- Every pass: **10 rows inserted, 10 rows read back, `selectSucceeded: true`** —
  real data round-tripped through the proxy.
- **Steady-state median ≈ 100 ms** per query (INSERT ≈ SELECT). Best observed
  ~65–85 ms; a fresh/distant container placement spiked to ~200–300 ms.
- These are full round trips: container → public workers.dev edge → Worker →
  D1 (remote, ENAM/ORD) → response. The D1-side `sql_duration_ms` is sub-1ms;
  essentially **all** the time is the network: the container→edge→Worker hop plus
  the Worker→D1 service hop.

> **Surprise / key finding:** latency is dominated by *colo placement*, not D1.
> The container reaches its Worker over the **public edge** (there is no
> in-process service binding from a container back to its own Worker today), so
> when the container lands in a colo far from the Worker/D1 you pay a real WAN
> leg — 3–4× the warm case. Plan for ~100 ms typical and budget for occasional
> 200–300 ms spikes.

---

## Verdict / recommendation for `a2a-common` store adapter (M5)

**Adopt the Worker-proxy pattern with a shared-secret internal D1 endpoint.**

- **~100 ms per query** (INSERT and SELECT) round trip from inside a container at
  steady state, best ~65–85 ms, with occasional 200–300 ms spikes on
  fresh/distant container placement. This is **acceptable** for the A2A agent
  store's access profile (task/agent record CRUD, not a hot per-token loop). It
  would be too slow for chatty per-request fan-out of many small queries — so:
- **Design implication:** the `a2a-common` D1 adapter should **batch** writes/reads
  where possible (D1 `batch` API over the proxy), keep queries coarse-grained,
  and cache hot reads in the container/DO where it makes sense. Avoid N+1 query
  patterns across the proxy hop; each hop costs ~60–90 ms.
- **Auth:** use a shared secret (header-gated). For production, store it via
  `wrangler secret put` (not a plaintext `var`) so it is never in source/config,
  and rotate on a schedule. Consider also restricting the `/d1/query` surface to
  a tight SQL allowlist or a typed RPC instead of arbitrary SQL passthrough.
- **Reject the REST API path** unless a container genuinely has no fronting
  Worker — it needs an account-scoped D1 API token (extra secret + rotation +
  blast radius) and adds control-plane latency.

---

## Security tradeoff in THIS poc

The shared secret is a **plaintext `var` in `wrangler.jsonc`** (`D1_PROXY_SECRET`)
because this is a throwaway spike. That means the secret is in the repo/config.
**Do not do this in production** — use `wrangler secret put D1_PROXY_SECRET` so it
lives only in Cloudflare's secret store and is injected at runtime. The Worker
code already reads it from `env.D1_PROXY_SECRET`, so the only change for prod is
moving the value out of `vars` into a secret.

---

## Files

```
cloudflare-d1-container/
├── package.json          wrangler devDep + @cloudflare/containers
├── wrangler.jsonc        worker cf-d1-container-poc, container class,
│                         D1 binding to a2a-agents, shared-secret var
├── src/index.ts          Worker: /health, /d1/query (secret-gated D1 proxy),
│                         /proxy-test + /run-test proxied into container,
│                         injects WORKER_BASE_URL + secret as container env vars
├── container/
│   ├── server.js         Node :8080 — /run-test runs the latency loop against
│   │                     the Worker proxy, returns JSON stats; /health-container
│   │                     reports injected env (proves no native binding)
│   └── Dockerfile        node:22-alpine
└── .gitignore            node_modules/, .wrangler/
```

## Reproduce

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"   # wrangler 4.x needs Node 22
npm install
npx wrangler deploy

BASE="https://cf-d1-container-poc.jackzhaojin.workers.dev"
SECRET="poc-d1-proxy-7f3a9c21e4b06d58"   # value from wrangler.jsonc vars

# robust path (params override injected env):
curl -s "${BASE}/run-test?base=${BASE}&secret=${SECRET}&iters=10" | jq

# uses only the env vars the Worker injected into the container:
curl -s "${BASE}/proxy-test" | jq

# container health — shows it has NO D1 binding, only injected string env:
curl -s "${BASE}/health-container" | jq
```

The POC is left **deployed**. Cloudflare Containers scale to zero when idle
(`max_instances: 1`, `instance_type: lite`), so it costs effectively nothing
between runs; the first request after idle pays a cold-start.
