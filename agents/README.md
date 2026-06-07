# agents/ — A2A Agent Platform

The new platform subproject (PRD: [`ai-docs/2026-06-05-a2a-agent-platform/`](../ai-docs/2026-06-05-a2a-agent-platform/)).
One Express A2A server per agent (D4); local-first, Cloudflare Containers at M5 (D6);
`content-authoring-eval/` is frozen and not part of this system (D5).

## Layout

| Package | Port | What |
|---|---|---|
| `a2a-common/` | — | Shared bootstrap: server factory (Express + official `@a2a-js/sdk@0.3.13`), SQLite/D1 store adapter + migrations, structured logging. Edge shim + push sender land at M2. |
| `eval-service/` | 4001 | Eval agent — **skeleton stub** (fake 4-dimension scores); real engine copied in at M1 |
| `content-gen/` | 4002 | Content generator — **skeleton stub**; real Agent SDK backend at M3 |
| `coordinator/` | 4004 | A2A client, CLI-first; server face (`coordinate.run`) at M2 |
| `contracts/` | — | JSON Schemas for task payloads (lands with M1) |
| `migration-agent/` | 4003 | Lands at M3 |
| `ui/` | 3000 | Next.js dashboard, lands at M4 |
| `e2e/` | 14xxx | E2E suite (vitest) — real servers, real A2A over HTTP, no mocks |

## Run the walking skeleton

```bash
npm install
npm run dev:eval          # terminal 1 → :4001
npm run dev:content-gen   # terminal 2 → :4002
npm run hello             # terminal 3 — coordinator: discovers cards, streams a task
                          #   through each agent, verifies tasks/get persistence
```

Each agent writes its store to `<package>/data/store.db` (schema: `a2a-common/migrations/`,
SQLite dialect = same SQL as Cloudflare D1). Tasks survive server restarts — that's the
point of the SQLite task store (and the sleep-tolerance rule for Containers later).

## Tests

```bash
npm run test:e2e
```

Monorepo philosophy: **real tests only, no mocks.** Each suite spawns the actual agent
servers as child processes (isolated ports 14xxx + throwaway SQLite files) and drives
them with the real `@a2a-js/sdk` client over HTTP:

- `agent-card` — well-known card discovery, skill enumeration, health
- `task-lifecycle` — full SSE choreography (submitted → 4× working → artifact →
  completed final), contextId threading, `tasks/get`, the Part-2 store row mapping,
  and the A2A `-32001` TaskNotFound error shape
- `persistence` — **restart survival**: kill the server, restart on the same store
  file, the completed task must still be served (sleep-tolerance rule)

## Cloudflare resources (provisioned 2026-06-07)

| Resource | Name / ID |
|---|---|
| D1 database | `a2a-agents` — `db84ebfc-2132-45ac-902d-7ef7117786e8` (same migration files apply at M5) |
| R2 bucket | `a2a-agents-artifacts` — **pending**: account needs one-time R2 enable in the dashboard |

## Status

- [x] Walking skeleton: cards, `message/stream` (SSE), `tasks/get`, store-backed task store, restart survival — verified 2026-06-07
- [ ] M1: copy eval engine (from frozen `content-authoring-eval/src/lib/`), job queue, browser semaphore, R2 artifacts
- [ ] M2: push notifications, edge shim + `cloudflared` tunnel, coordinator server face, mesh bearer auth, Make.com round-trip
