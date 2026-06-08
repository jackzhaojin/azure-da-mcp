# CLAUDE.md — agents/migration-agent

**Purpose**: A2A migration agent — a **facade** exposing ONE Agent Card (`migration.run`) over swappable backends that author a source (PDF/webpage, incl. synthetic) into a da.live EDS page and self-validate. **Tech**: Express + `@a2a-js/sdk@0.3.13`, `@agents/a2a-common`, SQLite/D1 · **Port**: 4003 · **Status**: M3 scaffolding — `dryrun` works, `makecom` fully implemented (needs only tunnel + scenario URLs), `sdk` is a stub. v2.0 of the platform — **v1.1.0 = the frozen `content-authoring-eval/`, do not touch it (D5)**.

Platform context: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) · original PRD [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) · sibling agents in [`agents/README.md`](../README.md).

## When to work here
- The `migration.run` skill (contract `agents/contracts/migration.run.v1.json`): one card, one contract, backend is an impl detail.
- Adding/changing a backend (the seam is the point: "Claude vs Kimi on the same 10 migrations" with no contract change).
- The Make.com async round-trip (webhook out → callback in) and its restart-tolerance.
- NOT for the coordinator, eval, content-gen, or UI — those are sibling workspaces.

## Key files
- `src/index.ts` — server bootstrap; `shimAgentId: "migration"`; registers `extraRoutes` → **`POST /callbacks/makecom/:taskId`** (bearer-gated by the edge token): resolves the in-process waiter, OR (post-restart) completes the task **directly from the store**.
- `src/executor.ts` — facade executor: extract → `validate` → pick backend (`payload.backend ?? MIGRATION_DEFAULT_BACKEND`) → `assertConfigured()` → `backend.run()` → emit `migration-report` artifact + `completed`. Unknown backend / config error → `failed` with a setup hint.
- `src/callbacks.ts` — in-memory pending-callback registry. `waitForCallback(taskId, timeoutMs)` parks a promise; `resolveCallback(taskId, report)` returns `true` iff an in-process waiter consumed it. In-memory by design — the store path covers process death.
- `src/backends/types.ts` — `MigrationRunPayload`, `MigrationResult`, the `MigrationBackend` seam (`assertConfigured()` + `run()`).
- `src/backends/dryrun.ts` — simulation, $0, deterministic per `pageSlug`. **Returns `previewUrl = sourceLocation`** (perfect simulated migration → downstream eval has a real reachable page). Default until the tunnel exists.
- `src/backends/makecom.ts` — **PRIMARY**. POSTs `MAKECOM_WEBHOOK_URL`, parks a waiter, completes on the callback.
- `src/backends/sdk.ts` — M3 stub (will drive the `da-live-author-playwright` flow). `assertConfigured()` always throws today.

## Gotchas / non-obvious  ← READ THIS
- **Default backend is `dryrun`, NOT makecom** — `MIGRATION_DEFAULT_BACKEND` overrides. PRD's eventual default is makecom, but the scaffold ships dryrun so the closed loop is runnable without the tunnel. Per-call override: `payload.backend`.
- **Make.com needs the `cloudflared` tunnel.** The scenario runs in the cloud and must reach our callback. Set `MIGRATION_CALLBACK_BASE` to the tunnel hostname (`a2a.xpri.ai` → `:4003`); the callback URL is `${MIGRATION_CALLBACK_BASE}/callbacks/makecom/{taskId}`. Locally it defaults to `http://localhost:4003`.
- **Field rename in the webhook mapping: `site` → `siteName`.** The webhook body POSTs `siteName: payload.site` (matching the scenario's `{{5.*}}` runtime var). The contract field stays `site`. Watch this when editing the Make.com mapping — 10 fields total incl. `callbackUrl` + `taskId`.
- **The waiter is parked BEFORE the webhook fires** — no race with a fast scenario. `MAKECOM_TIMEOUT_MS` defaults to 25min (scenarios run long; the callback design avoids the 300s scenario-timeout fight).
- **Callback path is restart-tolerant (two paths).** Normal: `resolveCallback` hands the report to the parked waiter, the executor completes the task. Post-restart: waiter is gone → the route completes the task **from the store** (409 if already terminal, 404 if unknown). A Make.com run outliving our process still lands (sleep-tolerance rule).
- **`/callbacks/*` is bearer-gated by the edge token** (`A2A_MESH_TOKEN` / edge token). Missing/wrong `Authorization: Bearer …` → 401.
- **`dryrun` confidence is deterministic** from a slug hash (80–97), `PASS` ≥ 85 else `NEEDS-REFINEMENT` — fan-out variance tests rely on this.

## Run / test
```bash
cd agents && set -a && source .env && set +a   # MAKECOM_WEBHOOK_URL, MIGRATION_CALLBACK_BASE, A2A_MESH_TOKEN
npm install
npm run dev:migration            # :4003 (dryrun backend by default)
npm run typecheck
npm run test:e2e                 # incl. migration-agent (dryrun contract, per-slug determinism,
                                 #   makecom/unknown/invalid failure paths) + makecom-roundtrip
                                 #   (fake Make.com on the wire protocol; callback-after-restart)
```
Smoke (dryrun, edge shim):
```bash
curl -X POST localhost:4003/hooks/migration/migration.run -H 'Content-Type: application/json' \
  -d '{"sourceType":"webpage","sourceLocation":"https://example.com","site":"demo","owner":"me","pageSlug":"hello"}'
```

## Conventions
- **Contract `migration.run.v1`** requires: `sourceType` ∈ {`webpage`,`pdf`}, `sourceLocation` (http/https URL), `site`, `owner`, `pageSlug`. Optional: `folderPostfix`, `blockLibraryUrl`, `backend`, `maxRefinementIterations`, `runId`, `labels`.
- **Real tests, no mocks** (D-philosophy) — the makecom test stands up a fake Make.com speaking the exact wire protocol over real HTTP.
- Local SQLite = the same SQL as Cloudflare D1 (`a2a-common/migrations/`); store at `data/store.db`. Node 20.
- New backends register in `src/executor.ts`'s `BACKENDS` map — same seam, different runtime (opencode/Kimi lands at M3+).
- Never edit `content-authoring-eval/` (D5). This workspace is the live one.
