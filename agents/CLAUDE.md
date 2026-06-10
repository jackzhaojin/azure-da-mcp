# CLAUDE.md — `agents/` (A2A Agent Platform, v2.0)

The **v2.0** workstream: a decoupled mesh of independently-addressable AI agents speaking the **A2A protocol**. This is the "all-new thing" — distinct from **v1.x** (`content-authoring-eval`, the frozen Oracle app that is the backup; **never modify it — D5**).

- **Plan**: [`ai-docs/2026-06-05-a2a-agent-platform/`](../ai-docs/2026-06-05-a2a-agent-platform/) (decisions D1–D6)
- **As-built report**: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../ai-docs/2026-06-08-a2a-platform-v2.0/) — read this first to understand what exists
- **Per-workspace context**: each subdir has its own `CLAUDE.md` (read the one for the dir you're in)

## Structure (npm workspaces)

| Workspace | Port | What | CLAUDE.md |
|-----------|------|------|-----------|
| `a2a-common/` | — | Shared bootstrap: server factory, stores (task/push/artifact), client, logging, D1/SQLite migrations | [✓](./a2a-common/CLAUDE.md) |
| `contracts/` | — | JSON Schemas for every skill | — |
| `eval-service/` | 4001 | Eval agent — engine **copied** from the frozen app; `eval.run` (4 dims) | [✓](./eval-service/CLAUDE.md) |
| `content-gen/` | 4002 | Briefs + synthetic legacy source pages | [✓](./content-gen/CLAUDE.md) |
| `migration-agent/` | 4003 | One Agent Card, backends `dryrun`/`makecom`/`sdk`; owns the Make.com callback | [✓](./migration-agent/CLAUDE.md) |
| `coordinator/` | 4004 | A2A client+server: routing, fan-out, variance; CLI; **+ its own Next.js dashboard on :4004/** (trigger, live activity, branch grid) | [✓](./coordinator/CLAUDE.md) |
| `ui/` | 3000 | Thin Next.js dashboard (auth, runs, trigger) | [✓](./ui/CLAUDE.md) |
| `store-mcp/` | stdio | MCP server — conversational read access to the store | [✓](./store-mcp/CLAUDE.md) |
| `e2e/` | — | Real-server tests (fast/live/soak) | [✓](./e2e/CLAUDE.md) |
| `docs/` | — | `r2-setup.md` · `tunnel-setup.md` · `makecom-scenario-checklist.md` | — |

## Run it

```bash
cd agents
npm install                       # Node 20 (nvm use 20)
set -a; source .env; set +a       # load env (cp .env.example .env first; secrets gitignored)

# 5 servers, one per terminal (or background):
npm run dev:eval                  # :4001
npm run dev:content-gen           # :4002
npm run dev:migration             # :4003
npm run dev:coordinator           # :4004 (A2A + the coordinator dashboard at http://localhost:4004/)
npm run dev:ui                    # :3000 (legacy thin dashboard)

npm run loop -- "rooftop solar maintenance" --fan-out 2   # drive the closed loop
npm run loop -- "topic" --backend opencode --site da-live-postal-2025-07 --owner jackzhaojin  # Kimi K2.6 real migration
```

## Conventions (the things that bite)

- **Node 20** for the agents. **Wrangler / Cloudflare CLI needs Node 22**: `PATH="$HOME/.nvm/versions/node/v22.22.3/bin:$PATH"` (nvm default stays 20).
- **Env via shell, not dotenv.** Agents read `process.env` directly. Always `set -a; source .env; set +a` before `npm run dev:*`. `.env` is gitignored; `.env.example` is the tracked template.
- **One server per agent**, all on `@agents/a2a-common`'s `startAgentServer()`. Agent Cards at `/.well-known/agent-card.json`; JSON-RPC at `/a2a`; edge shim at `/hooks/:agent/:skill`.
- **Persistence**: local SQLite (better-sqlite3) running the **same SQL** as Cloudflare D1 (migrations in `a2a-common/migrations/`). Artifacts → **R2** (S3 API) when `R2_*` env set, else local `./output` served at `/artifacts`.
- **Auth**: `A2A_MESH_TOKEN` gates `/a2a` between agents; `A2A_EDGE_TOKEN` (falls back to mesh token) gates `/hooks/*` and the migration `/callbacks/*`.
- **Tests are real, no mocks.** Fast tier (`npm run test:e2e`, stub engine) is the CI gate; `test:live` (real engine/browsers/R2, creds-gated) and `test:soak` (10× loop) run locally. Typecheck: `npm run typecheck` (root + eval-service's own tsconfig).
- **`type: module`** across the workspaces — any copied CJS helper must be `.cjs` (this bit the eval engine's Playwright scripts).
- **undici's 300s fetch timeouts are disabled mesh-wide** (`a2a-common/src/net.ts`, side-effect of importing `@agents/a2a-common`). Node 20's fetch otherwise kills agentic turns >5 min (Kimi migrations) and quiet SSE streams at exactly 300s — "TypeError: fetch failed"/"terminated" at ~301s is THIS, not a network problem.

## Cloudflare infra (as-built, see the v2.0 report)

- **D1** `a2a-agents` (`db84ebfc-…`) — schema applied from the same migrations.
- **R2** `a2a-agents-artifacts` — public `pub-ae7a7d0dbe1049c69ae60848bc58bfbf.r2.dev`; creds in `.env`.
- **Tunnel** `a2a-mesh` (`8af08294-…`) → `a2a.xpri.ai` → `localhost:4003` (the Make.com ingress); config in `~/.cloudflared/config.yml`. `xpri.ai` DNS is on Cloudflare; registrar transfer off GoDaddy deferred to ~2027.
- **Deploy (M5)** = Cloudflare Containers, deliberately **last** (D6). Not started.

## Hard rules

- **Never touch `content-authoring-eval/`** or trigger `deploy-content-authoring-eval.yml` (D5).
- **Don't commit** `.env`, `data/`, `*.db`, `output/`, `.next/`, `next-env.d.ts` (all gitignored).
- The closed loop's headline route is `full-loop`, but the coordinator can also `evaluate` / `migrate` / `generate+migrate` / `auto` — it need not start at generate or end at eval.
