# 01 — Env-Proofing the e2e Fast Tier

**Files**: `agents/e2e/helpers/mesh.ts`, `agents/e2e/tests/coordinator-batch.e2e.test.ts`, `agents/e2e/CLAUDE.md`
**Result**: the fast tier passes **49/49 with or without `agents/.env` sourced**. Previously: 28/46 failed when sourced.

---

## Why — the first five minutes of the sprint

The sprint opened with the obvious move: get a baseline by running the CI tier (`npm run test:e2e`). Because the rest of the session would need creds, the shell had `set -a; source .env; set +a` applied first — the exact incantation `agents/CLAUDE.md` tells every developer to run.

**Result: 9 of 13 test files failed, 28 of 46 tests.** The same suite on a clean shell: 46/46 green.

This wasn't previously unknown — `agents/e2e/CLAUDE.md` literally documented it:

> *"Run it BARE (no `.env` sourced) — sourcing `.env` leaks the edge token / R2 creds / tunnel callback base into spawned agents and breaks the open-mode shim + makecom tests **by design, not by bug**."*

The sprint's position: a CI gate whose verdict depends on what happens to be exported in the invoking shell is a footgun, not a design. "By design" here meant "we understood why it happens," not "this is good." Concretely:

- A developer who follows the project's own setup instructions gets a sea of red and has to *know the lore* to realize nothing is broken.
- Worse than false failures: **false passes and silent corruption.** `.env` exports `EVAL_AGENT_URL` / `CONTENT_GEN_URL` / `MIGRATION_AGENT_URL` pointing at the live `:400x` dev mesh — a spawned test coordinator inheriting those could fan out work to the *real* agents instead of its throwaway test instances. `D1_PROXY_URL`/`D1_PROXY_SECRET` would silently point a test agent's store at **cloud D1**. `R2_*` creds made fast-tier (stub!) runs upload artifacts to the real R2 bucket — the closed-loop test was literally asserting against `pub-ae7a7d0d….r2.dev` URLs instead of local `/artifacts/` paths.
- A flake-hunting rule the suite itself holds dear (`retry: 0` — "a flake IS a finding") is meaningless if the suite's behavior is a function of ambient shell state.

## What — the failure anatomy

The spawner in `helpers/mesh.ts` did this:

```ts
const proc = spawn(TSX, ["src/index.ts"], {
  cwd: join(ROOT, service),
  env: { ...process.env, PORT: String(port), STORE_DB_PATH: db, ...(opts.env ?? {}) },
  //      ^^^^^^^^^^^^^^ everything in the developer's shell leaks into the agent
});
```

With `.env` sourced, every spawned agent inherited `A2A_MESH_TOKEN` and started **gating its `/a2a` endpoint with bearer auth** — while the test clients (deliberately exercising open mode) sent no token. The smoking gun was in the assertion failures: a test expecting the A2A `TaskNotFound` JSON-RPC error (`error.code === -32001`) instead received a body where `body.error` was truthy but `body.error.code` was `undefined` — i.e. the HTTP-layer 401 `{"error":"unauthorized"}`, not a JSON-RPC error at all. Diagnosis confirmed by re-running with `env -u A2A_MESH_TOKEN -u A2A_EDGE_TOKEN`: 46/46.

Three failures survived even that, which is what surfaced the *full* blast radius:

1. `closed-loop`: asserted generated sources live at local `/artifacts/sources/…` — but inherited `R2_*` creds made content-gen publish to real R2 (`https://pub-….r2.dev/sources/…`).
2. `content-gen`: same root cause, different assertion.
3. `coordinator-batch`: an **env-conditional test** — it read `process.env.A2A_EDGE_TOKEN` *in the test process* to decide whether to assert a 401. Test logic that branches on ambient env is the same disease in a different organ.

## How — sanitize at the spawn boundary, re-supply explicitly

The fix is a denylist applied inside `startAgent`, so every spawned agent is deterministic regardless of the invoking shell, and any test that *wants* one of these vars passes it explicitly via `opts.env` (which is applied **after** sanitization and therefore always wins):

```ts
const SANITIZED_ENV_VARS = [
  // auth: spawned agents default to open mode; mesh-auth/edge-shim tests set tokens explicitly
  "A2A_MESH_TOKEN", "A2A_EDGE_TOKEN",
  // dashboard SSO: a test coordinator must never redirect to Google
  "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "AUTH_SECRET", "AUTH_ALLOWED_EMAILS",
  // cloud store proxy: a test agent must NEVER write to cloud D1
  "D1_PROXY_URL", "D1_PROXY_SECRET",
  // engine + tuning: fast tests set EVAL_ENGINE=stub explicitly; live relies on the default
  "EVAL_ENGINE", "EVAL_CONCURRENCY", "EVAL_MAX_ATTEMPTS", "BROWSER_PERMITS",
  // peer URLs: tests wire agents to each other explicitly (EVAL_AGENT_URL: evalAgent.url)
  "EVAL_AGENT_URL", "CONTENT_GEN_URL", "MIGRATION_AGENT_URL", "COORDINATOR_URL",
  // Make.com ingress + public-base rewrites
  "MAKECOM_WEBHOOK_URL", "MAKECOM_TIMEOUT_MS", "MIGRATION_CALLBACK_BASE",
  "MIGRATION_DEFAULT_BACKEND", "A2A_PUBLIC_BASE", "EVAL_PUBLIC_BASE", "CONTENT_PUBLIC_BASE",
  // artifact storage: spawned agents always use the local ./output backend
  "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE",
  "R2_ACCOUNT_ID", "R2_S3_ENDPOINT",
] as const;
```

Design decisions worth recording:

- **Denylist, not allowlist.** An allowlist (`PATH`, `HOME`, `NVM_BIN`, …) is theoretically cleaner but practically brittle — agents legitimately read a long tail of system env (`PLAYWRIGHT_BROWSERS_PATH`, `NODE_ENV`, `HOME` for the opencode backend…). The denylist targets exactly the vars that **change protocol behavior**, enumerated by grepping every `process.env.X` read across `a2a-common`, `coordinator`, `eval-service`, `content-gen`, and `migration-agent` and intersecting with what `.env` actually exports.
- **AI keys are deliberately NOT stripped** (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`, `MOONSHOT_API_KEY`). The live tier's `NO_AI_ENV` pattern blanks them *explicitly* per test (`CLAUDE_CODE_OAUTH_TOKEN: ""`) to pin the $0 deterministic path, and manual full-agentic runs rely on inheritance. Stripping them would have silently changed what `test:live` exercises.
- **`R2_*` is safe to strip** because the one test that exercises real R2 (`tests-live/r2.live.test.ts`) calls `createArtifactStore()` **in the test process itself**, not via a spawned agent — verified before adding R2 to the list. The eval live test's screenshot assertion was already written to handle either backend ("local is instant; public r2.dev can lag a beat").

### Killing the env-conditional test (and replacing it with a real one)

The `coordinator-batch` store-reads test lost its `if (edge) expect(401)` branch — conditional assertions that may or may not run depending on the shell are not tests. In exchange, the 401 path got a **dedicated, explicit suite** in the same file: a coordinator spawned with `A2A_EDGE_TOKEN: "edge-secret-store"` (and `COORDINATOR_UI: "off"` for a lean boot) asserting `GET /store/runs` → 401 bare, 200 with the bearer. Net effect: the gate behavior is now *always* tested, instead of *sometimes* tested — that's the +1 in 46→47.

### Documentation

The `e2e/CLAUDE.md` gotcha was rewritten from "Run it BARE" to: safe either way, here's the sanitization mechanism, here's where the list lives — so the next reader learns the design instead of the lore.

## Verification

| Scenario | Before | After |
|----------|--------|-------|
| `npm run test:e2e`, clean shell | 46/46 | 47/47 → 49/49 (after the sprint's other suites landed) |
| `npm run test:e2e`, `.env` sourced | **18/46** (28 failed) | 49/49 |
| `npm run test:live`, `.env` sourced | green | green (R2 + ui-smoke + eval-engine unaffected, by design) |

The matrix was run after each iteration of the denylist (first pass fixed 28 → 3 remaining failures; adding `R2_*` fixed 2; replacing the env-conditional test fixed the last 1).
