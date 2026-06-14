# Domain Migration — Re-fronting the A2A Mesh on `jackzhaojin.com` (as-built)

**Date**: 2026-06-14
**Status**: **COMPLETE & verified live.** All mesh surfaces serve on `*.jackzhaojin.com`; apex `jackzhaojin.com` 301-redirects to `www`; coordinator dashboard + Google SSO confirmed via Playwright. **All code + active docs swept to `jackzhaojin.com`** (2026-06-14). The legacy `*.xpri.ai` **live infrastructure** (Worker custom-domain routes, the `a2a.xpri.ai` Make.com tunnel, DNS, the xpri OAuth redirect URI) still resolves in parallel and is **deferred to manual teardown** by Jack (next-day/next-week). Code changes committed; infra teardown pending.
**Author**: Jack Jin (with Claude Code)
**Companion to**: the M5 deploy in [`ai-docs/2026-06-08-a2a-platform-v2.0/07-m5-cloudflare-deployment.md`](../2026-06-08-a2a-platform-v2.0/07-m5-cloudflare-deployment.md) and the hardening sprint at [`ai-docs/2026-06-11-v2.1-hardening-sprint/`](../2026-06-11-v2.1-hardening-sprint/) (whose pending D1 migration became the one incident here).

---

## Why (the brief)

The deployed mesh was fronted on `*.xpri.ai`. `xpri.ai` carries the startup name, and the goal for adaptTo() demos/slides is to **not surface that name on screen** — a presentation-hygiene goal, not secrecy (every `xpri.ai` TLS cert is already in public Certificate Transparency logs forever; this migration does not, and cannot, un-disclose the name). The brief: re-front everything under a neutral personal domain, `jackzhaojin.com`, with a straight 1:1 subdomain mapping, and retire `xpri.ai` once verified.

A longer exploration preceded the build: whether to rescue the Azure-registered `jackzjin.com`. That domain is an **Azure App Service Domain hard-locked to Azure DNS** — its apex `NS` recordset is system-immutable, "Advanced management (preview)" exposes no nameserver field, and Cloudflare subdomain *zones* are Enterprise-only. The only path was a multi-hop registrar transfer-out (ASD → intermediate registrar → Cloudflare NS), ~1–2 weeks elapsed. We abandoned it in favor of **buying `jackzhaojin.com` directly on Cloudflare Registrar** — native zone, live in minutes, AI-administrable day one.

## The one-line story

> A native Cloudflare domain turned a ~2-week registrar-transfer saga into a same-session migration. The only scare — the coordinator dashboard crash-looping after deploy — wasn't the domain change at all; it was a **pending remote-D1 migration** the redeploy surfaced (and would have surfaced on the *next* deploy regardless).

## Before → after (straight 1:1 mapping, no `cf.` layer)

| Surface | Before (`xpri.ai`) | After (`jackzhaojin.com`) |
|---|---|---|
| coordinator (A2A + dashboard) | content-factory.xpri.ai | content-factory.jackzhaojin.com |
| dashboard (Google SSO host) | content-factor-dash.xpri.ai | content-factor-dash.jackzhaojin.com |
| eval agent | content-factory-eval.xpri.ai | content-factory-eval.jackzhaojin.com |
| content-gen agent | content-factory-gen.xpri.ai | content-factory-gen.jackzhaojin.com |
| migration agent | content-factory-migrate.xpri.ai | content-factory-migrate.jackzhaojin.com |
| brand apex | — | jackzhaojin.com **→ 301 →** www.jackzhaojin.com |
| personal landing | — | www.jackzhaojin.com → `jackzhaojin.github.io` (GitHub Pages, pre-existing, untouched) |

Worker `content-factory` · account `957b2690e54ade4c335d8e395c5b69d5` · zone `jackzhaojin.com` (`fdf0c615f7429cee464f8f9ca834852c`, Free plan, NS `coby`/`roxy.ns.cloudflare.com`).

---

## What Claude Code did automatically

**Reconnaissance first** — read the deploy worker, `wrangler.jsonc`, coordinator `auth.ts`, e2e cloud tests; confirmed `wrangler` was authenticated and that **D1/R2/containers bind to the Worker, not the hostname** (so storage/compute needed zero changes); inspected the live `jackzhaojin.com` zone via the Cloudflare API and discovered `www` already served GitHub Pages (which reshaped the plan — the mesh goes to subdomains, `www` stays the portfolio).

1. **Code — prefix-based routing** ([`agents/deploy/src/index.ts`](../../agents/deploy/src/index.ts)): switched the `HOSTS` map to `*.jackzhaojin.com` and rewrote the hostname→container switch to match by **subdomain prefix** (`host.startsWith("content-factory-eval.")`) instead of exact host, so `*.xpri.ai` and `*.jackzhaojin.com` both route correctly during the cutover — zero-downtime.
2. **Routes** ([`agents/deploy/wrangler.jsonc`](../../agents/deploy/wrangler.jsonc)): added the 5 `jackzhaojin.com` `custom_domain` routes alongside the existing xpri.ai ones.
3. **Deploy**: `wrangler deploy` — uploaded the Worker, rolled all 4 containers, and provisioned the 5 new custom domains + edge certs.
4. **DNS**: created the proxied apex placeholder record `jackzhaojin.com A 192.0.2.1` (prereq for the redirect rule) via the Cloudflare API.
5. **Remote D1 migration 0005** (*with explicit user authorization* — see incident): `alter table runs add column error text; add column live text;` against the `a2a-agents` D1.
6. **Verification**: curl probes of worker-health, all agent `/health` + agent cards, the apex 301 (path/query preserved), and the SSO redirect chain; then a **real browser render** of the dashboard login page via Playwright (`.playwright-mcp/dash-login-jackzhaojin.png`).
7. **Diagnostics**: isolated a false-alarm eval failure (local stale negative-DNS cache — resolved fine via `1.1.1.1`) and root-caused the coordinator crash from `wrangler tail` + git history + a remote-D1 schema check.

## What Jack did manually (the things Claude couldn't / shouldn't)

1. **Bought `jackzhaojin.com`** on Cloudflare Registrar.
2. **Google OAuth redirect URI** — added `https://content-factor-dash.jackzhaojin.com/api/auth/callback/google` to the Web Client ID (project "da live mcp 2025") in Google Cloud Console. *(Claude has no access to Google Cloud.)*
3. **Apex→www 301 redirect rule** — created the Cloudflare Redirect Rule (Rules → Redirect Rules). *(Claude's API token can write DNS + Workers custom domains + D1, but **not rulesets**.)*
4. **Authorized the production D1 migration** — Claude's safety guardrail blocked the remote-D1 write as out-of-scope; Jack gave an explicit green light before it ran.

## The one incident — coordinator dashboard crash (and why it wasn't the domain)

Right after deploy, `content-factory.jackzhaojin.com` and the dash host returned **500** — *and so did the old `*.xpri.ai` hosts*, which immediately ruled out the domain change. `wrangler tail` showed `Container crashed while checking for ports` / `no container instance can be provided` — the coordinator app never bound `:8080`. The agents (eval/gen/migrate) stayed healthy.

Root cause: `wrangler deploy` rebuilt the coordinator image from current `main`, which includes the hardening-sprint dashboard code (commit `bd7cd6a`) that reads `runs.error` and `runs.live`. **Those columns had never been applied to remote D1** — exactly the *"D1 migration 0005 pending before next cloud deploy"* note from the v2.1 sprint. A `PRAGMA table_info(runs)` against remote D1 confirmed both columns missing. Applying 0005 fixed it on the next cold start — **no redeploy required** (the code was already live; it only needed the schema).

**Lesson (now in memory):** apply pending remote-D1 migrations *before* redeploying the Worker. D1 has no auto-migration table; schema is applied manually with `wrangler d1 execute … --remote --file`.

## Result — verification matrix

| Check | Result |
|---|---|
| 5 `jackzhaojin.com` custom domains + TLS | created, certs valid |
| eval / gen / migrate `/health` + agent cards | `200`; cards advertise `*.jackzhaojin.com/a2a` |
| coordinator A2A card | `da-coordinator` @ `content-factory.jackzhaojin.com/a2a` |
| coordinator dashboard | renders; SSO login page confirmed in a real browser (Playwright) |
| `/api/auth/signin` callback origin | `…jackzhaojin.com` (Auth.js `trustHost` deriving correct host) |
| apex `jackzhaojin.com` | `301` → `www.jackzhaojin.com`, path + query preserved |
| www | unchanged → GitHub Pages portfolio |
| D1 / R2 / containers | untouched (Worker-bound, not hostname-bound) |

## What's left + recommendation

**Code + active docs are fully swept to `jackzhaojin.com`** (2026-06-14): all `*.xpri.ai` references in source, config, and current docs (READMEs, CLAUDE.md files, e2e defaults, `.env.example`) now name `jackzhaojin.com`. The dated **historical** build reports + prompt-logs under `ai-docs/2026-06-08-*` and `ai-docs/2026-06-11-*` were **intentionally preserved** as point-in-time records (the prompt-logs quote the user verbatim); this June-14 doc is the forward pointer.

What remains is **live infrastructure teardown — a manual follow-up Jack will do next-day/next-week** (no fixed date). The `*.xpri.ai` hosts still resolve in parallel until then:
1. **Worker routes**: delete the 5 `*.xpri.ai` entries from [`wrangler.jsonc`](../../agents/deploy/wrangler.jsonc) and redeploy (one container rollout / brief coordinator cold-start — deploy between runs). Routing already matches by subdomain prefix, so jackzhaojin keeps working.
2. **The `a2a.xpri.ai` Make.com tunnel** (the last live xpri host): add `a2a.jackzhaojin.com` (CNAME → tunnel `8af08294-…` + an ingress rule in `~/.cloudflared/config.yml`), **repoint the Make.com scenario's callback URL** to it, then drop `a2a.xpri.ai`. The Make.com edit is external (Jack-only).
3. **DNS**: the `xpri.ai` zone / records, once nothing references them.
4. **OAuth**: remove the two `content-factor-dash.xpri.ai` redirect URIs from the Google OAuth client.

## Appendix — key facts

- Container image tag built this deploy: `8bd541e1`.
- Redirect rule: dynamic, `concat("https://www.jackzhaojin.com", http.request.uri.path)`, preserve query, status 301; apex proxied record `A 192.0.2.1`.
- Aborted alternative (`jackzjin.com` transfer-out) documented in memory `jackzjin-com-to-cloudflare-transfer` (superseded) and `mesh-on-jackzhaojin-com`.
