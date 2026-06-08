# 04 — Testing & Status

## Testing philosophy: real, no mocks

Per the monorepo rule, the e2e suite uses **real child-process servers and real protocols** — no mocks, no stubs of the transport. `e2e/helpers/mesh.ts` `startAgent()` spawns each actual agent on an isolated port with a throwaway SQLite file and waits for `/health`; tests then speak real A2A over HTTP. The only "fake" is the **stub eval engine** (`EVAL_ENGINE=stub`) — and even that exercises the real server, store, queue, and protocol; it just skips Chromium + the model API so the fast tier is hermetic and $0.

## Three tiers

| Tier | Command | Engine | Cost | Where |
|------|---------|--------|------|-------|
| **Fast** | `npm run test:e2e` | stub | $0, no browsers | **CI** (`.github/workflows/agents-e2e.yml`) on `agents/**` changes |
| **Live** | `npm run test:live` | real (deterministic fallback) | real browsers, $0 with `NO_AI_ENV`; R2 needs creds | local |
| **Soak** | `npm run test:soak` | real | real browsers | local, on demand |

### Fast tier (CI) — 13 files, ~45 cases, all green
`agent-card`, `task-lifecycle`, `persistence` (restart survival), `mesh-auth`, `edge-shim`, `push-notifications`, `browser-semaphore`, `content-gen`, `migration-agent`, `coordinator-batch`, `closed-loop`, `makecom-roundtrip`, `store-mcp`. ~15 s wall.

### Live tier — real engine/browsers/R2 (creds-gated, auto-skips)
- `eval-engine.live` — real cheerio fetch + Playwright/axe scan + screenshot; asserts a **fetchable screenshot URL** (local `/artifacts` or real `r2.dev`) and the `artifacts` row.
- `r2.live` — real R2 PUT → public GET → DELETE (self-cleaning; skips without `R2_*`).
- `closed-loop.live`, `coordinator-batch.live`, `ui-smoke.live` (real `next dev` + middleware + store read).

### Soak — `full-loop-10x`
10 branches through the real engine + dryrun migration + template generation, unattended. Latest run: **10/10 complete in 35 s**, browsers never exceeded the 3-permit cap, stores consistent, variance stddev sane.

## Evidence captured this build

- Fast suite: **45/45** green (incl. the R2 `storage` contract assertion and the screenshot assertions).
- Soak: **10/10**, `maxBrowsers 3/3`, drained queue.
- Live R2: **2/2** against a real scoped token (PUT/GET/DELETE).
- Live eval: real screenshot stored + report carries a durable URL, both local-backend and real-R2 backend verified.
- Tunnel: `/health` + agent card through `a2a.xpri.ai`; shim `401` (no bearer) / `202` (with bearer).
- CI: `agents-e2e` green (checkout/setup-node v6, Node 20 runtime).

---

## Plan → built status grid

| Milestone (from PRD Part 6) | State | Notes |
|---|---|---|
| **Walking skeleton** — cards, `message/stream`, `tasks/get`, store, restart survival | ✅ | a2a-common bootstrap |
| **M1 — eval core** | ✅ | engine copied + model bump, p-queue (2), browser semaphore (3), real `eval.run`, `eval_reports`, restart rebuild |
| **M1 — R2 artifacts** | ✅ | `createArtifactStore()` (S3/local), content-gen sources + eval screenshots wired, live test + soak |
| **M2 — A2A layer** | ✅ | push notifications, mesh bearer auth, edge webhook shim |
| **M2 — coordinator** | ✅ | `coordinate.run` server face, CLI batch, variance stats |
| **M2 — Cloudflare spike** | ✅ | SSE-through-Containers, container→D1 (worker-proxy), R2 round-trip — all resolved via live POCs |
| **M3 — scaffolding** | ✅ | migration facade (dryrun), content-gen contracts (template tier), synth→migrate chain |
| **M3 — routing + closed loop** | ✅ | route engine (5 routes), full loop end-to-end (`npm run loop`) |
| **M3 — Make.com agent side** | ✅ | webhook out / callback in, restart-tolerant; tested vs a fake Make.com |
| **M4 — UI scaffold** | ✅ | auth middleware, runs/variance dashboard, manual trigger; live smoke |
| **store-mcp** | ✅ | stdio MCP, 4 read-only tools |
| **Public ingress (dev)** | ✅ | `cloudflared` named tunnel on `a2a.xpri.ai` (this session) |
| **M3 — real backends** | ⏳ | migration `sdk` (Agent SDK), content-gen Agent SDK generator, LLM planner for `goal:auto`, opencode/Kimi — all token-spending, need a watched first run |
| **Make.com scenario config** | ⏳ | human step: paste webhook URL → `MAKECOM_WEBHOOK_URL`, add final HTTP module → `/callbacks/makecom/{taskId}` with the edge bearer |
| **M5 — Cloudflare Containers deploy** | ⏳ | deliberately last (D6); design sketched in [`03`](./03-cloudflare-and-deployment.md) |
| **Full-agentic eval smoke** | ⏳ | one real eval with `CLAUDE_CODE_OAUTH_TOKEN` to exercise the Agent SDK + Playwright MCP path |

## What's left, in order

1. **Make.com scenario config** (human; unblocked by the now-live tunnel + edge token).
2. **Full-agentic eval smoke** (small token spend; confirms the agentic path beyond the deterministic fallback).
3. **M3 real backends** — `sdk` migration backend, Agent SDK content generator, LLM planner for `auto`, opencode/Kimi; each a watched first run.
4. **M5 — Cloudflare Containers deploy** (last, D6).

## Open questions (from the PRD, still open)

- adaptTo() exact dates → anchors the M5/M6 timeline.
- UI auth mechanism for production (Cloudflare Access vs Auth.js vs the shared-secret scaffold).
