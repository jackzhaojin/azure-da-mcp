# Part 6 — Coordination, UI, and Rollout

## Coordinator

An **A2A client *and* server** (revised 2026-06-06 — open question #3 resolved "yes, from day one") — plain TypeScript that composes the three agents. It is **not a fixed pipeline**: it is an *intelligent content coordinator* that, given an intent and the current state of the content, decides which capabilities to invoke. Three faces:

1. **CLI** (`agents/coordinator`) — primary interface for development and the adaptTo() demo terminal moments
2. **A2A server face** (`:4004`, skill `coordinate.run`) — pipelines as tasks, with the same lifecycle/streaming/push semantics as every other agent; this is what `agents/ui` (and any A2A client) submits to
3. **Edge webhook shim** (from `a2a-common`, like every agent) — so Make.com, cron, and curl can launch pipelines with one flat POST

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

**Kicked off by**: a **CLI command** (`coordinator run <request.json>`), an **A2A `coordinate.run` task** (from `agents/ui` or any A2A client), or the **edge shim** (Make.com, cron, curl).

**MVP / talk build**: the coordinator is **CLI-first** — the server face is thin wiring from `a2a-common`, not a separate build effort. The `agents/ui` dashboard (below) lands at M4; until then the coordinator is driven from the terminal.

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

## New UI (`agents/ui`) — the old app is frozen (D5, revised 2026-06-06)

The original plan here (slim `content-authoring-eval` to a pure client) is **dropped**: that folder is frozen, keeps running on Oracle untouched, and its deploy workflow never fires. Its localStorage/batch plumbing is no longer anyone's problem — it serves the legacy flows as-is. The new platform gets its own thin app instead:

| Concern | `agents/ui` answer |
|---|---|
| Framework | Next.js (App Router) — backend logic lives in API routes / server actions, so secrets and the mesh bearer token never reach the browser |
| Auth | Required from day one (the app will eventually be public); mechanism is open question #6 — Cloudflare Access vs Auth.js vs simple shared-secret login. Pick the cheapest that protects a public deployment |
| Trigger | Form → API route → A2A `coordinate.run` to the coordinator (or a direct single-agent task) — the UI is an A2A client with a browser face |
| Live runs | Pages poll the store (local SQLite in dev, Cloudflare D1 deployed) via API routes — v1 is polling; upgrade to SSE/WebSockets only if polling chafes |
| Pages | **Runs** (history + status), **Run detail** (branch grid: synthesize → migrate → eval per row, live states), **Variance view** (per-dimension distribution across branches), **Trigger** (manual run launcher) |
| Deploy | Last, with everything else (M5): OpenNext on Workers or a small container — decide then |

## Rollout Plan (June → adaptTo, ~mid/late September 2026)

| Milestone | Target | Delivers | Exit criteria |
|---|---|---|---|
| **M1 — Headless eval core (local)** | end of June | `agents/eval-service` with engine **copied** in, job queue, SQLite store (+ R2 from day one), browser semaphore. A2A server with minimal `message/send` + `tasks/get`. | Part 2 definition of done, on the dev machine |
| **M2 — A2A complete + coordinator MVP** | mid-July | `a2a-common` hardened: SSE streaming, push notifications, store-backed task store. Coordinator CLI **+ server face** runs an eval-only batch (fanOut over a URL list — feature parity with today's batch mode). Make.com webhook round-trip proven through the `cloudflared` tunnel. **Cloudflare spike**: ~~done in full, two months early~~ — SSE survival (`references/cloudflare/long-session-container/`: 22-min stream, 0 drops, wake ≈ 5s) **and** container→D1 (`references/cloudflare/d1-container/`: Worker-proxy verdict, ~100ms/query — open question #7 resolved). Remaining M5-de-risk item is only the R2 round-trip (pending account enable). | Eval-only batch submitted via `coordinate.run`; Make.com callback demo recorded; spike findings written up (container→D1 access pattern) |
| **M3 — Closed loop 1x + intelligent routing** | mid-August | Content-gen agent (both skills). Migration facade with `sdk` backend; `makecom` backend callback wired. One full synthesize → migrate → eval chain via coordinator, **plus the agentic planner** that skips stages by state (source supplied → migrate→eval; already migrated → eval only; brief-only → stop). | Part 4 + Part 5 definitions of done; coordinator demonstrates ≥3 distinct routes incl. a non-eval-terminating one |
| **M4 — Nx + variance + UI v1 (still local)** | end of August | `fanOut: 10` stable within concurrency budget; variance stats; `agents/ui` (auth, Runs, Run detail, Variance, Trigger) polling the store. | 10x run completes unattended overnight on the dev machine; UI shows it live |
| **M5 — Cloudflare deployment (D6: deploy last)** | early September | 4 containers + fronting Worker router; Cloudflare D1 migrations applied (R2 already live since M1); `agents/ui` deployed; tunnel retired. | The same closed loop + a 10x run green on Cloudflare |
| **M6 — Hardening + demo** | mid-September | Failure-path polish, seed demo content, scripted demo (CLI + UI + conversational store query), talk materials. **Fallback rehearsed: laptop + tunnel** in case anything regresses on Cloudflare. | Dry-run demo end-to-end twice without manual intervention — once on Cloudflare, once local |

Sequencing note: the EDS site build (separate PRD) should land its block library before M3, or M3 develops against the existing demo site.

## Risks & Mitigations (platform-wide)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Deployment compressed into M5, right before the conference | High | The platform is local-first by construction — laptop + `cloudflared` tunnel is a full-fidelity demo fallback; the M2 Cloudflare spike pulls the unknowns (container→D1 access pattern, instance sizing, sleep/wake) forward by two months |
| Cloudflare Containers scale-to-zero kills in-flight/queued work or long SSE streams | Medium | Sleep-tolerance rule enforced from M1 (store is authoritative; queues rebuild on wake). POC 2026-06-07 (`references/cloudflare/long-session-container/`): open SSE streams **block** the sleep alarm (22 min, 0 drops, `sleepAfter=2m`; #147/#162 not reproduced on wrangler 4.98 / containers 0.3.7); sleep fires ~2m after streams close; wake ≈ 5s; in-process state wiped on sleep. Keep `renewActivityTimeout()` + push notifications + `tasks/get` polling as the durable contract regardless. |
| A2A JS SDK rough edges eat schedule | Medium | Time-boxed (Part 3); fallback = SDK in-memory store + mirror writes to the store |
| Scope creep vs EDS site build competing for the same calendar | High | M-gates are hard; anything not demoable by M4 is cut. The EDS site only *needs* a block library + 2-3 page templates for this platform's purposes. |
| Cloudflare D1/R2 limits or instance sizing surprises | Low | R2 free tier (10GB) + Workers Paid D1 allotments dwarf this workload; eval container sized `standard-3`, with Cloudflare's Browser Rendering API as a deferred alternative to in-container Chromium; retention job deletes artifacts of runs older than 30 days |
| Make.com backend drift (prompt edited in UI, repo copy stale) | Medium | Existing risk, now contract-tested: M3 adds a conformance check that the callback payload matches `migration.run.v1` |
| Claude API spend on 10x agentic runs | Medium | `claude-sonnet-4-6` for all agents; coordinator records per-run token usage in `runs.stats`; budget alarm threshold documented before M4 |

## Open Questions

1. ~~Confirm D3: Supabase vs Cosmos DB~~ — **Resolved 2026-06-06: Cloudflare D1 + R2** (D3 revised). Store adapters stay isolated in `a2a-common` regardless, so a future flip remains cheap.
2. Eval `ground-truth` source mode (Part 4) — v2 of `eval.run`, worth slotting into M4 if M3 lands early?
3. ~~Should the coordinator itself be an A2A *server* too?~~ — **Resolved 2026-06-06: yes, from day one** — `coordinate.run` server face (this part); it's thin wiring from `a2a-common`.
4. ~~Public URL strategy for content-gen synthetic sources~~ — **Resolved 2026-06-06: R2 public bucket** (r2.dev or custom domain).
5. adaptTo() exact dates/format — anchor M5/M6 precisely once confirmed.
6. **Auth for `agents/ui`**: Cloudflare Access vs Auth.js vs simple shared-secret login — decide by M4.
7. ~~Container → Cloudflare D1 access pattern~~ — **Resolved 2026-06-07 by POC** (`references/cloudflare/d1-container/`, live on the account): **Worker-proxy** (container → fronting Worker `/d1/query` with shared secret → D1 binding). Containers still get no native bindings; measured ~100ms/query steady-state (colo-dominated — D1 itself sub-1ms; budget 200–300ms spikes on distant placements; batch + avoid N+1 across the hop). D1 REST API rejected (needs an API token + control-plane latency); libsql is not a distinct option (no wire endpoint). The M2 Cloudflare spike is now fully answered: SSE (2026-06-07 AM) + container→D1 (PM).
8. **Conversational store queries for the demo**: Cloudflare's official MCP servers (verify D1 query support) vs a ~50-line custom MCP server over the store — decide during M6 demo prep.
