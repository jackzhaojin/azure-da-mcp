# Part 6 — Coordination, UI, and Rollout

## Coordinator

An **A2A client**, not a server — plain TypeScript that composes the three agents. But it is **not a fixed pipeline**: it is an *intelligent content coordinator* that, given an intent and the current state of the content, decides which capabilities to invoke. Two faces:

1. **CLI** (`agents/coordinator`) — primary interface for development and the adaptTo() demo terminal moments
2. **Thin HTTP trigger** — one endpoint so the UI (and Make.com, and cron) can launch pipelines

### What goes in, and how it's kicked off

**Input — one `coordinate` request** (a goal + whatever context exists, *not* a rigid pipeline):

```jsonc
{
  "goal": "migrate | generate+migrate | evaluate | full-loop | auto",  // what you want; "auto" lets the planner decide
  "sourceLocation": "https://...",        // optional — a PDF/URL/synthetic source, if content already exists
  "target": { "site": "...", "owner": "jackzhaojin", "pageSlug": "...", "folderPostfix": "..." },
  "alreadyMigratedUrl": "https://main--...aem.page/...",  // optional — if set, work can start at evaluate
  "backend": "makecom",                   // optional migration-backend hint (default makecom)
  "fanOut": 1                             // 1 = single run; N = repeat the chosen route + aggregate variance
}
```

**Kicked off by**: a **CLI command** (`coordinator run <request.json>`) or a **single thin HTTP trigger** (so the UI, cron, or Make.com can launch it). Nothing else — there is no separate coordinator service to stand up.

**MVP / talk build**: the coordinator is **CLI-first** — do *not* build a fancy coordinator UI for the demo. The Runs/variance dashboard (below) is post-MVP polish on the eval side; the coordinator itself is driven from the terminal.

### What the coordinator can do (four routes)

It runs exactly one of these per request — chosen by the `goal`, or inferred by the planner when `goal: auto`:

1. **Just migrate** — a source is already in hand; author it into da.live. → `Migrate`
2. **Generate + migrate** — make net-new content, then author it. → `Generate → Migrate`
3. **Just evaluate** — a page is already migrated; score it. → `Evaluate`
4. **All three (the closed loop)** — → `Generate → Migrate → Evaluate` (optionally Nx → aggregate variance)

It does **not** have to start at generation and does **not** have to end at evaluation.

### Intelligent routing (`goal: auto`)

The headline closed loop — *generate → migrate → evaluate* — is **one route, not the only one**. The coordinator runs a small agentic planner (a Claude Agent SDK `query()` with the three Agent Cards as available tools) that inspects the request and the current state, then chooses the stages:

| Starting state / intent | Route the coordinator takes |
|---|---|
| Net-new, no source yet | Generate → Migrate → Evaluate |
| Source already exists (PDF/URL/synthetic) | **Migrate → Evaluate** (skip generate) |
| Already migrated to EDS | **Evaluate only** |
| "Author this net-new content" (no quality gate asked for) | Generate → Migrate, **stop** (no eval) |
| "Just generate a brief" | Generate, **stop** |
| Fan-out consistency experiment | Generate → Migrate → Evaluate, **repeat Nx → aggregate** |

Principles:

- **Any subset, any order.** Generate, migrate, and evaluate are independently-addressable capabilities; the coordinator calls only the ones the goal requires.
- **No mandatory start.** Work does not have to begin at generation — if content already exists it begins at migrate; if already migrated it begins at evaluate.
- **No mandatory end.** It need not finish in evaluation; it stops when the stated goal is met (a published page, a brief, a score — whatever was asked for).
- **Deterministic when you want it.** For repeatable variance experiments, hand it an explicit pipeline spec (below) and it skips the planner — same agents, no improvisation. Intelligence is the default; determinism is opt-in.

State detection inputs the planner reads: presence/type of `sourceLocation`, whether a `previewUrl`/published page already exists for the target slug (via the migration agent or a da.live lookup), and the explicit `goal` field on the request.

### Pipeline Spec (explicit / deterministic mode)

```jsonc
{
  "name": "synthetic-loop-10x",
  "steps": [
    { "agent": "content-gen", "skill": "content.synthesize-source",
      "payload": { "brief": {...}, "legacyStyle": "messy" } },
    { "agent": "migration", "skill": "migration.run",
      "payload": { "backend": "sdk", "site": "...", "sourceLocation": "$prev.sourceUrl",
                   "folderPostfix": "$run.shortId-$branch" } },
    { "agent": "eval", "skill": "eval.run",
      "payload": { "targetUrl": "$prev.previewUrl", "sourceType": "webpage",
                   "sourceLocation": "$steps[0].sourceUrl" } }
  ],
  "fanOut": 10,            // run the whole chain 10x; "$branch" indexes the copy
  "concurrency": 2,        // max chains in flight (browser-bound)
  "failFast": false        // a failed branch records and continues
}
```

- `$prev.*` / `$steps[n].*` reference prior-step artifacts within a branch; each branch shares one A2A `contextId`
- Coordinator writes the `runs` row, spawns branches, listens via SSE (push notifications as the resilience fallback), and on completion computes `runs.stats`
- **Run-once vs run-10x is just `fanOut: 1` vs `fanOut: 10`** — the user's "unifying yet decoupling interface" requirement lands here

### Variance Reporting (the headline metric)

For `fanOut ≥ 2`, `runs.stats` includes per-dimension **mean, stddev, min/max** and pass-rate across branches, plus migration confidence variance. Story: *"the migration agent scores 87±3 on structure but 78±11 on visual — visual fidelity is where the agent is least consistent."* Nobody at adaptTo() will be showing eval *variance* of an agentic migration pipeline; this is the differentiator. Implemented as plain SQL over `eval_reports` joined through `tasks.run_id`.

## UI Rebuild (`content-authoring-eval` → pure client)

| Today | Target |
|---|---|
| `useEvaluations` / `useLocalStorage` (50-cap, per-browser) | Supabase queries; history is global and durable. **Delete the hooks.** |
| `useEvaluationStream` / `useBatchEvaluationStream` (bespoke SSE parsing) | Supabase **Realtime** subscriptions on `tasks` + `eval_reports` — survives reconnects/restarts for free |
| API routes importing `runEvaluation` in-process | One thin route: validate form → A2A `message/send` to eval-service (or coordinator for pipelines) → return task id |
| Batch import/export JSON + `batch-storage.ts` | Runs dashboard: list `runs`, drill into branches/tasks, variance charts |
| Engine code in the Next.js image | Removed — image shrinks, deploys decouple from engine changes |

New pages: **Runs** (pipeline history + stats), **Run detail** (branch grid: synthesize → migrate → eval per row, live states via Realtime), **Variance view** (per-dimension distribution across branches). Existing single-eval form stays as the simple entry point, now submitting an A2A task.

Versioning/deploy: keeps riding the existing tag-driven Oracle deploy (`deploy-content-authoring-eval.yml`); `agents/*` services get a parallel workflow building to GHCR and joining the same compose.

## Rollout Plan (June → adaptTo, ~mid/late September 2026)

| Milestone | Target | Delivers | Exit criteria |
|---|---|---|---|
| **M1 — Headless eval core** | end of June | `agents/eval-service` with engine moved, job queue, Supabase persistence, browser semaphore. A2A server with minimal `message/send` + `tasks/get`. | Part 2 definition of done |
| **M2 — A2A complete + coordinator MVP** | mid-July | `a2a-common` hardened: SSE streaming, push notifications, Supabase task store. Coordinator CLI runs an eval-only batch (fanOut over a URL list — feature parity with today's batch mode). Make.com webhook round-trip proven on one toy task. | Old batch routes deletable; Make.com callback demo recorded |
| **M3 — Closed loop 1x + intelligent routing** | mid-August | Content-gen agent (both skills, `sdk` backend). Migration facade with `sdk` backend; `makecom` backend callback wired. One full synthesize → migrate → eval chain via coordinator, **plus the agentic planner** that skips stages by state (source supplied → migrate→eval; already migrated → eval only; brief-only → stop). | Part 4 + Part 5 definitions of done; coordinator demonstrates ≥3 distinct routes incl. a non-eval-terminating one |
| **M4 — Nx + variance + UI v2** | end of August | `fanOut: 10` stable within concurrency budget; variance stats; Runs/Run-detail/Variance UI on Realtime; localStorage deleted. | 10x run completes unattended overnight; UI shows it live |
| **M5 — Hardening + demo** | early September | Failure-path polish, seed demo content, scripted demo (CLI + UI + Supabase-MCP conversational query), talk materials. | Dry-run demo end-to-end twice without manual intervention |

Sequencing note: the EDS site build (separate PRD) should land its block library before M3, or M3 develops against the existing demo site.

## Risks & Mitigations (platform-wide)

| Risk | Likelihood | Mitigation |
|---|---|---|
| 4-CPU ARM VM can't sustain concurrency 2 × multi-browser | Medium | Semaphore is tunable to worst-case (1 chain, 2 permits); demo still works at fanOut 10 / concurrency 1, just slower. Escape hatch: temporarily resize VM for demo week. |
| A2A JS SDK rough edges eat schedule | Medium | Time-boxed (Part 3); fallback = SDK in-memory store + Supabase mirror |
| Scope creep vs EDS site build competing for the same calendar | High | M-gates are hard; anything not demoable by M4 is cut. The EDS site only *needs* a block library + 2-3 page templates for this platform's purposes. |
| Supabase free tier limits (500MB DB / 1GB storage) | Low | Screenshots are the only heavy artifact; retention job deletes artifacts of runs older than 30 days |
| Make.com backend drift (prompt edited in UI, repo copy stale) | Medium | Existing risk, now contract-tested: M3 adds a conformance check that the callback payload matches `migration.run.v1` |
| Claude API spend on 10x agentic runs | Medium | `claude-sonnet-4-6` for all agents; coordinator records per-run token usage in `runs.stats`; budget alarm threshold documented before M4 |

## Open Questions (to resolve before/at M1)

1. **Confirm D3**: Supabase vs Cosmos DB — this PRD assumes Supabase; flipping later means rewriting `store/` adapters only (they're isolated by design), but flip before M2.
2. Eval `ground-truth` source mode (Part 4) — v2 of `eval.run`, worth slotting into M4 if M3 lands early?
3. Should the coordinator itself be an A2A *server* too (pipelines as tasks)? Partially answered 2026-06-05: external callers (incl. Make.com) launch pipelines via the edge webhook shim (Part 3), so an A2A server face on the coordinator is purely for mesh-internal symmetry/learning — optional M4 stretch, not needed for any caller.
4. Public URL strategy for content-gen synthetic sources: Supabase Storage public bucket vs serving via the VM proxy (Storage assumed).
5. adaptTo() exact dates/format — anchor M5 precisely once confirmed.
