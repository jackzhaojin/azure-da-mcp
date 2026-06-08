# 03 — Cloudflare Infrastructure & Deployment

What's actually provisioned on Cloudflare as of 2026-06-08, the POCs that de-risked it, and the path to the M5 container deploy. Per D6, **nothing is deployed as a container yet** — the mesh runs locally + via a tunnel. But the *persistence* and *ingress* halves of the Cloudflare story are live.

---

## Account

- **Account ID**: `957b2690e54ade4c335d8e395c5b69d5` (Jackzhaojin@gmail.com)
- Plan: Workers Paid ($5) already in place; R2 enabled; Zero Trust Free (optional, for the tunnels dashboard).

## D1 — structured persistence (proven, schema applied)

- **Database**: `a2a-agents`, id `db84ebfc-2132-45ac-902d-7ef7117786e8`.
- The **same migration files** (`agents/a2a-common/migrations/*.sql`) that build the local SQLite store have been applied to remote D1 — `runs`, `tasks`, `eval_reports`, `artifacts`, `push_configs`. One schema, two drivers (D3).
- **Access pattern at deploy** (resolved by POC, see below): containers get *no* native bindings, so a container reaches D1 via a fronting Worker `/d1/query` (shared secret) → D1 binding. ~100 ms/query steady-state (colo-dominated; batch, avoid N+1).

## R2 — blob/artifact storage (live)

- **Bucket**: `a2a-agents-artifacts`, public at **`https://pub-ae7a7d0dbe1049c69ae60848bc58bfbf.r2.dev`**.
- **S3 endpoint**: `https://957b2690e54ade4c335d8e395c5b69d5.r2.cloudflarestorage.com`.
- **Write path**: the S3-compatible API (SigV4 via `aws4fetch`) — one code path that works in local Node *and* in a container (no binding needed). **Reads are public** over `r2.dev`.
- **Wired producers**: content-gen synthetic sources and eval visual screenshots. A scoped **Object Read & Write** API token lives in gitignored `agents/.env` (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`). No env → automatic local `./output` stand-in, identical URL contract.
- Proven by the env-gated `e2e/tests-live/r2.live.test.ts` (real PUT → public GET → DELETE) and a real eval screenshot landing on `r2.dev`.

## Public ingress — `cloudflared` named tunnel (live)

The dev-time public surface so Make.com (cloud) can reach `localhost`.

- **Tunnel**: `a2a-mesh`, id `8af08294-bf29-434a-b091-fb7d8baa6fd2` (locally-managed, CLI-created).
- **Hostname**: `a2a.xpri.ai` → `CNAME → 8af08294-….cfargotunnel.com` (proxied).
- **Config**: `~/.cloudflared/config.yml` — single ingress rule `a2a.xpri.ai → http://localhost:4003` (the migration agent owns both Make.com surfaces: `/hooks/migration/*` and `/callbacks/*`), plus the required `http_status:404` catch-all.
- **Auth**: the public surface is bearer-gated by `A2A_EDGE_TOKEN` (in `agents/.env`).
- **Verified end-to-end** (2026-06-08): `/health` and the agent card return through the tunnel; `POST /hooks/migration/migration.run` → `401` without bearer, `202` with it. The tunnel survived a network change (hotspot → wifi) by auto-reconnecting.

### The domain (`xpri.ai`) — DNS moved, registrar deferred
- `xpri.ai` (registered at GoDaddy, previously unused but with **live Microsoft 365 email**) had its **DNS moved to Cloudflare** (zone `429ad23ae554eaf50c79625fb0652c54`, active `2026-06-08T20:10:51Z`, nameservers `coby`/`roxy.ns.cloudflare.com`). DNS hosting is free and was the only thing the tunnel needed.
- The M365 email records (MX, SPF, DMARC, autodiscover, SRV) were reconciled against GoDaddy and carried over set to **DNS-only** before the nameserver cutover — mail survived untouched. (No DKIM existed to migrate.)
- **Registrar transfer off GoDaddy → Cloudflare** (which *does* support `.ai`, ~$80/2yr at cost) is deliberately **deferred to ~2027 near expiry**, so the renewal isn't paid twice. DNS-on-Cloudflare is the prerequisite that's now done. See memory `xpri-ai-domain-for-tunnel`.

## POCs that de-risked the Cloudflare unknowns

Live spikes on the real account (now in [`references/cloudflare/`](../../references/cloudflare/)):

- **Long SSE through Containers** (`long-session-container`, worker `cf-long-sse-poc`): an open SSE stream *blocks* the sleep alarm — 22-min stream, 263/263 events, 0 drops at `sleepAfter=2m`; wake-from-sleep ≈ 5 s, all in-process state wiped → **sleep-tolerance rule** (rebuild from store on boot, which eval-service does).
- **Container → D1** (`d1-container`, worker `cf-d1-container-poc`): **Worker-proxy** verdict — containers have no native bindings, so proxy through a fronting Worker; ~100 ms/query.
- **R2 round-trip**: PUT `--remote` → public GET `200` → wired into `createArtifactStore()`.
- **Kimi K2.6 / opencode backend** ([`references/kimi/`](../../references/kimi/)): validated headless Kimi via `opencode serve` + REST for the migration agent's M3+ backend.

## What's deployed vs. local (today)

| Layer | State |
|-------|-------|
| Agents (eval, content-gen, migration, coordinator) | **Local** Express servers (`npm run dev:*`) |
| UI | **Local** `next dev` :3000 |
| D1 | Remote schema applied; local dev uses SQLite with the same SQL |
| R2 | **Live** (used from local dev directly) |
| Public ingress | **Live** `cloudflared` tunnel → `a2a.xpri.ai` → local :4003 |
| Container deploy (M5) | **Not started** — deliberately last (D6) |

## M5 path (Cloudflare Containers) — sketch, not yet built

1. One slim image per agent (`@cloudflare/containers`, Durable-Object-backed); content-gen needs no Chromium, eval does.
2. A fronting Worker per agent (or shared) for routing + the D1 `/d1/query` proxy (shared secret); R2 stays direct via the S3 API.
3. Apply migrations to D1 (already done); point agents at D1 + R2 via env.
4. Replace the dev `cloudflared` tunnel with Worker-fronted public hostnames (or keep the named tunnel — it already works).
5. Honor the sleep-tolerance rule (rebuild-from-store on cold start — built into eval-service).

The mesh was designed so this is swappable by construction (D4): same code, different process host.
