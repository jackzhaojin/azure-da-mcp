# CLAUDE.md — agents/coordinator

**Purpose**: Intelligent content coordinator — routes + fans out pipelines across content-gen, migration, and eval; aggregates variance stats. · **Tech**: TypeScript, Node 20, Express A2A server (client AND server) on `@agents/a2a-common`, `@a2a-js/sdk@0.3.13`, `p-queue`. · **Port**: 4004. · **Status**: v2.0 A2A platform, M3 routes done; closed loop runs end-to-end locally.

Platform docs: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) (v2.0), [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) (PRD part-6 = the coordinator). v1.1.0 `content-authoring-eval/` is the frozen legacy backup — **D5: never touch it.**

## When to work here
- Changing routing logic, fan-out, or variance aggregation for `coordinate.run`.
- Adding routes / stages to the pipeline, or upgrading `goal: auto` from the state table to the LLM planner (M3).
- CLI work: the `hello` / `batch` / `loop` commands.

## Key files
- `src/executor.ts` — the route engine. `resolveRoute()` is a deterministic state table mapping `evaluate | migrate | generate+migrate | full-loop | auto` → an ordered `Stage[]` (`generate | migrate | evaluate`, any subset, **no mandatory start or end**). `runPipelineBranch()` threads ONE `contextId` across content-gen→migration→eval, forwarding each stage's artifact (sourceUrl → previewUrl → score). `computeStats()` aggregates variance (mean / stddev / min / max / per-dimension / passRate) over the fan-out. `callAgent()` is the mesh A2A client call.
- `src/index.ts` — wires the server: `startAgentServer`, `createCoordinateExecutor(db)`, plus the **restart policy** (interrupted in-flight `coordinate.run` rows are marked `failed`, not blindly re-fanned-out).
- `src/cli.ts` — `hello` (mesh smoke), `batch <url...>` (eval-only fan-out), `loop <topic...>` (the closed loop). Agent URLs from env, defaults to localhost ports.
- `package.json` — `npm run dev` (server), `npm run hello | batch | loop`.

## Gotchas / non-obvious (MOST IMPORTANT)
- **`goal: auto` uses the deterministic state table, NOT an LLM** (planner is M3). Inference: `alreadyMigratedUrl` ⇒ `evaluate`; `sourceLocation` ⇒ `migrate,evaluate`; `topic` ⇒ full loop; none ⇒ throws. Don't expect semantic planning yet.
- **One shared `contextId` per run is how the stores group a pipeline's steps.** Every child task across all three agents inherits it; `store-mcp` / the UI join on it. Never mint a fresh contextId per stage.
- **Routes need not start at generate or end at eval** — `generate+migrate` deliberately stops with no eval; `migrate`-only has no generate. `validateForRoute()` enforces only what each route actually needs (`topic` for generate routes, `sourceLocation` for a bare migrate, `targets`/`alreadyMigratedUrl` for evaluate).
- **Fan-out shape differs by route**: evaluate-only fans out per target × `fanOut`; pipeline routes fan out `fanOut` branches of one config. Concurrency capped by `COORD_FANOUT_CONCURRENCY` (default 2).
- **fail-fast is per-branch, not per-run**: a failed stage breaks that branch; other branches keep going. Run status ends `completed` or `completed_with_failures`.
- **`computeStats` overall = eval scores when the route evaluated, else migration confidence.** `PASS_THRESHOLD = 75` (matches the eval engine's `passedDimensions` rule). It also emits a separate `migrationConfidence` block when confidences exist.
- This agent is an A2A **client and server**: it serves `coordinate.run` AND calls the other agents via `meshClientFactory()`. Agent URLs come from `EVAL_AGENT_URL` / `CONTENT_GEN_URL` / `MIGRATION_AGENT_URL`.

## Run / test
```bash
cd agents && set -a && source .env && set +a
npm run dev:eval   # :4001   (the loop needs eval + content-gen + migration up)
npm run dev:content-gen   # :4002
npm run dev:migration     # :4003 (dryrun backend by default)
npm run dev:coordinator   # :4004
npm run hello                                      # mesh smoke
npm run batch -- https://example.com --fan-out 2   # eval-only batch + variance
npm run loop -- "ski wax temperature guide" --fan-out 2 --legacy-style messy  # THE CLOSED LOOP
```
Fast tests (from `agents/`, `npm run test:e2e`): `coordinator-batch` (3×2 → 6 children, one contextId, variance, runs row) and `closed-loop` (4 servers, full-loop, non-eval-terminating + no-mandatory-start routes, auto routing, per-branch failure isolation). Live tier scores over the real Chromium engine. **Real tests, no mocks.**

## Conventions
- Persistence: local SQLite `data/store.db` — same SQL as Cloudflare D1 (`a2a-common/migrations/`). The `runs` row (config + stats JSON) is the coordinator's record; eval rows live in eval-service's store, joined by contextId.
- Env from `agents/.env` via `set -a && source .env && set +a`.
- Ports: eval 4001 / content-gen 4002 / migration 4003 / coordinator 4004 / ui 3000.
- Contract: `agents/contracts/coordinate.run.v1.json`.
