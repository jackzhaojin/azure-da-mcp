# CLAUDE.md — agents/content-gen

**Purpose**: Generate content briefs + synthetic "legacy" source pages for the closed loop. · **Tech**: TypeScript, Node 20, Express A2A server on `@agents/a2a-common`, `@a2a-js/sdk@0.3.13`, `@anthropic-ai/claude-agent-sdk`. · **Port**: 4002. · **Status**: v2.0 A2A platform — **agentic backend live** (real Claude writing) with the deterministic template as the $0/no-creds/test fallback.

Platform docs: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) (v2.0), [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) (PRD). v1.1.0 `content-authoring-eval/` is the frozen legacy backup — **D5: never touch it.**

## When to work here
- Adding/changing the content skills: `content.ideate`, `content.brief`, `content.synthesize-source`.
- Tuning the **agentic** writing — the editorial prompts in `src/agentic.ts` (`BRIEF_SYSTEM`, `IDEATE_SYSTEM`) are where content quality lives now.
- Tuning the synthetic "legacy" HTML the closed loop migrates + scores.

## Key files
- `src/agentic.ts` — **the real writer**. `agenticBrief()` drives Claude (`@anthropic-ai/claude-agent-sdk` `query()`, tool-free, bounded by an abort timeout) to produce a substantive, compelling `Brief` (real headlines, multi-paragraph prose, a dek, in-body links). `agenticIdeate()` picks a fresh on-lane topic. `buildBrief()` / `pickTopic()` are the **entry points the executor calls**: agentic when `CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_API_KEY` is set, else the deterministic template — and agentic **never hard-fails the loop** (any error → template fallback). Model via `CONTENT_GEN_MODEL` (→ `CLAUDE_MODEL` → `claude-sonnet-4-6`).
- `src/generator.ts` — the deterministic template tier + the shapes. `generateBrief()` (coherent topic-substituted prose, NOT lorem); `synthesizeSource()` renders a `Brief` into standalone legacy HTML (`clean | dated | messy`, multi-paragraph + byline + dek + **typed feature blocks**) plus a `groundTruth` object eval scores fidelity against. The `Brief`/`SyntheticSource` shapes ARE the contract artifacts — agentic + template both return them.
- **`FeatureBlock` (ported from the v1.0 `blog-static-site-generator` block model)** is the lever for *compelling* pages: a section can carry one rich block beyond its prose — `stats` (metric strip), `callout` (tip/warning/note), `quote` (pull quote), `table` (comparison), or `cta`. `renderFeature()` lays them out in legacy chrome; the content (numbers, quote, table cells, CTA link) is always present so the page reads like a real article AND migration gets distinct semantic blocks to map to EDS (cards/columns/quote/table/cta). CTA links + feature text are folded into `groundTruth` so eval fidelity stays truthful.
- `src/extract-json.ts` — tolerant JSON extraction from the LLM reply (fence / pure / prose-wrapped) + `sanitizeJson` (`":="`→`":"`, the recurring AI typo, ported from v1.0's content sanitizer).
- `src/index.ts` — the A2A server: `startAgentServer({...})`, executor, skill discrimination, artifact store wiring. Working-notes report which tier ran (`agent-sdk` vs `template`).
- `package.json` — `npm run dev` (tsx); deps `@agents/a2a-common` + `@anthropic-ai/claude-agent-sdk`.
- `output/sources/*.html` — local artifact stand-in (gitignored). One file per synthesize task, keyed `sources/{taskId}.html`.

## Gotchas / non-obvious (MOST IMPORTANT)
- **Agentic vs template is creds-gated, not a flag**: `hasAgentAuth()` (OAuth token or API key) decides per-call. The fast e2e tier strips those creds (`SANITIZED_ENV_VARS` in `e2e/helpers/mesh.ts`) so CI is deterministic + $0; the agentic path is covered by `e2e/tests-live/content-gen-agentic.live.test.ts` (creds-gated, auto-skips).
- **Cloud needs the Claude CLI recipe**: the Agent SDK shells out to `@anthropic-ai/claude-code`, which refuses permission-skipping as root. So `deploy/docker/content-gen.Dockerfile` installs the CLI, runs as non-root `appuser`, and `content-gen-entrypoint.sh` writes `.claude.json` from `CLAUDE_ACCOUNT_UUID`/`CLAUDE_EMAIL`/`CLAUDE_ORG_UUID` (same secrets as eval; container bumped lite→basic). No creds → it just falls back to the template — safe, but not compelling.
- **Generation must never break the loop** — agentic failures (timeout, malformed JSON, no creds) fall back to the template inside `buildBrief`/`pickTopic`. A red content stage means something else.
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
