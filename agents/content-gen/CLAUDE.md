# CLAUDE.md — agents/content-gen

**Purpose**: Generate content briefs + synthetic "legacy" source pages for the closed loop. · **Tech**: TypeScript, Node 20, Express A2A server on `@agents/a2a-common`, `@a2a-js/sdk@0.3.13`. · **Port**: 4002. · **Status**: v2.0 A2A platform, M3 scaffolding — template tier (Agent SDK backend lands at M3 real-backends).

Platform docs: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) (v2.0), [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) (PRD). v1.1.0 `content-authoring-eval/` is the frozen legacy backup — **D5: never touch it.**

## When to work here
- Adding/changing the two content skills: `content.brief`, `content.synthesize-source`.
- Swapping the template generator for the Claude Agent SDK backend (M3) — replace the bodies of `generateBrief` / `synthesizeSource`, keep the signatures (the structured shapes ARE the contract artifacts).
- Tuning the synthetic "legacy" HTML the closed loop migrates + scores.

## Key files
- `src/generator.ts` — pure template tier. `generateBrief()` (outline + copy + target EDS blocks → `Brief`); `synthesizeSource()` renders a `Brief` into standalone legacy HTML (`clean | dated | messy`) plus a `groundTruth` object eval scores fidelity against. Deterministic per topic → $0, good for pipeline tests.
- `src/index.ts` — the A2A server: `startAgentServer({...})`, executor, skill discrimination, artifact store wiring.
- `package.json` — `npm run dev` (tsx); only dep is `@agents/a2a-common`.
- `output/sources/*.html` — local artifact stand-in (gitignored). One file per synthesize task, keyed `sources/{taskId}.html`.

## Gotchas / non-obvious (MOST IMPORTANT)
- **The synthetic source URL MUST be public** — this is the whole reason it goes through the shared artifact store, not just returned inline. Make.com (migration `makecom` backend) and the eval agent both fetch it over HTTP. Returning HTML in the artifact would break that.
- **Artifact store is R2-or-local, same URL contract either way**: `createArtifactStore({ localDir: "./output", localPublicBase })`. Real Cloudflare R2 (S3 API) when `R2_*` env is set; otherwise a local filesystem stand-in served via `staticRoutes: [{ route: "/artifacts", dir: "./output" }]` at `http://localhost:4002/artifacts`. The `synthetic-source` artifact carries `artifacts[].storage = artifactStore.kind` so consumers see which backend produced the URL.
- **Skill discrimination is shape-inferred** (`resolveSkill`): explicit `skill` field wins; else presence of `brief` / `briefTaskId` / `legacyStyle` ⇒ `synthesize-source`, else `brief`. `content.brief` requires `topic`.
- **`synthesize-source` accepts an inline `brief` OR a `topic`** (it generates a throwaway brief). `briefTaskId` reuse is a stub — "lands later" — don't assume it resolves a prior brief yet.
- **Default `legacyStyle` is `dated`** when omitted (table/`<font>` markup). `messy` adds floats + inline styles to stress the migration; `clean` is `<section>`/`<h2>`.
- No browser here. Generation is CPU-only template rendering today.

## Run / test
```bash
cd agents && set -a && source .env && set +a   # load R2_*, mesh token, etc.
npm run dev:content-gen                          # → :4002 (or `npm run dev` in this dir)
```
Fast test: `agents/tests/content-gen` — brief structure, fetchable source matching its own `groundTruth`, skill inference, and the **synthesize-source → migration.run** two-agent chain over real HTTP. Run from `agents/`: `npm run test:e2e`. **Real tests, no mocks.**

## Conventions
- Persistence: local SQLite (`data/store.db`) — same SQL as Cloudflare D1 (migrations in `a2a-common/migrations/`). Tasks survive restart.
- Env loaded from `agents/.env` via `set -a && source .env && set +a` (not per-package).
- Mesh: one Express A2A server per agent; ports eval 4001 / content-gen 4002 / migration 4003 / coordinator 4004 / ui 3000.
- External callers can skip A2A via the edge shim: `POST /hooks/content-gen/{skill}`.
