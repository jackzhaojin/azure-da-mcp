# 05 — Migration Backend C: opencode / Kimi K2.6 (works end-to-end)

**Date**: 2026-06-08
**Status**: ✅ **Built and verified end-to-end** — Kimi K2.6, driven headlessly through the `opencode` CLI, migrated a real webpage into da.live (authored → preview-published → Playwright-validated → **PASS**) against `jackzhaojin/da-live-postal-2025-07`.
**Code**: `agents/migration-agent/src/backends/opencode.ts` (+ `opencode-config.ts`, `opencode-prompt.ts`) · **Test**: `agents/e2e/tests-live/opencode-migration.live.test.ts` · **PoC lineage**: PR #5, `references/kimi/`.

This is the payoff of the migration agent's **facade** design (part-5, [`01-as-built-architecture.md`](./01-as-built-architecture.md)): one `migration.run` Agent Card, swappable runtimes behind it. `dryrun` and `makecom` were the first two; **this is the third — and the first that swaps the model *vendor* entirely** (a non-Anthropic model authoring real EDS pages through the exact same contract, MCP server, and skill). That makes *"Claude vs Kimi K2.6 on the same N migrations"* a no-contract-change experiment.

---

## What it is

A `MigrationBackend` named `opencode` that drives **Kimi K2.6** ("Kimi for Coding", `kimi-code/kimi-for-coding`) as an autonomous coding agent via the `opencode` CLI's **headless server** (`opencode serve` + REST). It gives K2.6 three things and lets it run the migration itself:

1. **The da.live MCP** (CRUD + preview-publish) — the deployed `functions/` server, which self-authenticates to da.live via its S2S technical account, so the backend needs **no da.live credential** (just the URL).
2. **The Playwright MCP** (local `@playwright/mcp`) — "agentic eyes": view the source page, validate the published preview.
3. **The `da-live-author-playwright` skill** — reused verbatim from `.claude/skills/` (skill-as-a-service), not re-encoded into a prompt.

One A2A `migration.run` task = one opencode session. The result is parsed back into the standard `MigrationResult` artifact, identical to what `makecom`/`dryrun` emit.

---

## Architecture

```
A2A migration.run (backend:"opencode")
  → migrationExecutor → opencodeBackend.run()
      ├─ getServer(): lazy, long-lived `opencode serve` (one per agent process, reused across tasks)
      │     spawned with OPENCODE_CONFIG → a generated config that ADDS, on top of the user's
      │     global ~/.config/opencode/opencode.jsonc (which holds the kimi-code provider + key):
      │       • mcp.dalive    (remote, DALIVE_MCP_URL, timeout 120s, optional bearer header)
      │       • mcp.playwright (local: npx @playwright/mcp --headless --isolated --output-dir .playwright-mcp/…)
      │       • skills.paths  = [<repo>/.claude/skills]   (so da-live-author-playwright is discovered)
      │       • permission    = "allow"                    (headless never blocks on approvals)
      │       • model         = kimi-code/kimi-for-coding
      ├─ POST /session                         → sessionId
      ├─ tapSession(): GET /event (SSE)        → surfaces tool + skill firing as A2A progress notes
      ├─ POST /session/:id/message {prompt}    → blocks for the whole agentic turn (≤ 20 min)
      └─ parseMigrationReport(final text)      → MigrationResult { status, confidence, blocksUsed, gaps, urls }
```

Key design choices, all forced by what was learned in the PoC + this build:

- **`opencode serve` + REST, not `opencode run`** — `run` emits no body for this reasoning model (v1.16.2).
- **Config via an `OPENCODE_CONFIG` *file*** (merged over the global config), not inline `OPENCODE_CONFIG_CONTENT` (shell-quoting hell). Verify it loaded with `GET /config` (`mcp` keys non-empty) and `GET /mcp` (`{dalive:{status:"connected"}}`).
- **`permission:"allow"`** — opencode otherwise emits permission events on `/event` that nobody answers in a headless run.
- **MCP `timeout` raised to 120s** — the 5s default is too short for preview-publish + the first-call S2S token mint.
- **The skill's "confirmation gate" is declared pre-satisfied** in the prompt — every field it would ask a human for is in the payload, so the headless agent proceeds instead of stalling.
- **Observability off the SSE `/event` stream** — each tool reaching `running` becomes a progress note (`K2.6 → dalive_save_dalive_content`, `K2.6 → skill da-live-author-playwright`), tool errors become recorded gaps. MCP tool names are `<server>_<tool>`.

---

## Sequence — one real migration

```mermaid
sequenceDiagram
    participant MG as Migration Agent :4003
    participant OC as opencode serve + Kimi K2.6
    participant SK as da-live-author-playwright skill
    participant DA as da.live MCP (S2S → da.live)
    participant PW as Playwright MCP

    MG->>OC: POST /session/:id/message (migration prompt, context pre-confirmed)
    OC->>SK: invoke skill (skill tool) → load create-page-from-source playbook
    OC->>PW: browser_navigate + snapshot (read the source page)
    OC->>DA: get block library + neighbor, create folder + page, preview-publish
    OC->>PW: navigate + screenshot the published preview (validate, refine ≤ N)
    OC-->>MG: final report → MigrationResult (status, confidence, urls), tool/skill firing streamed on /event
    Note over MG,PW: one opencode session per A2A task; da.live writes as the S2S technical account; $0 (Kimi-For-Coding subscription)
```

---

## Verified evidence (2026-06-08)

Real run against `jackzhaojin/da-live-postal-2025-07`, source `https://example.com`:

- **Tool sequence actually observed** (off `/event`):
  `skill da-live-author-playwright` → `playwright_browser_navigate` → `dalive_get/list_dalive_content` → `dalive_create_folder_dalive` → `dalive_create_dalive_content` → `dalive_preview_publish_dalive_content` → `playwright_browser_navigate/snapshot/take_screenshot` → done.
- **Result**: `PASS`, confidence 100, skill fired, 10 tools, 4 refinement iterations.
- **Page landed**: `get_dalive_content` reads back real EDS HTML at `/source/jackzhaojin/da-live-postal-2025-07/migration-batch-opencode-smoke/opencode-smoke.html` (`<h1>Example Domain</h1>`, source text preserved); **published preview returns HTTP 200**.
- **e2e test green** (`Tests 1 passed`), **0 orphaned processes** after shutdown, **fast CI tier 45/45 green** (no regressions).
- A transient flaky `dalive_list_dalive_content` error (deployed list endpoint returns an HTML error page intermittently) was **caught, recorded as a gap, and recovered from** (the agent used `get` instead) — the error path works.

This satisfies the part-5 Definition of Done: *"opencode/Kimi K2.6 backend completes one migration end-to-end against the same MCP server and prompt."*

---

## Config & credentials

| Knob | Default | Notes |
|---|---|---|
| `MIGRATION_DEFAULT_BACKEND` | `dryrun` | set to `opencode`, or per-call `payload.backend:"opencode"` |
| `MOONSHOT_API_KEY` | from `~/.zshrc` | the Kimi-For-Coding key; must be in the agent's env ($0/call) |
| `DALIVE_MCP_URL` | deployed Azure server | self-auths via S2S → **no client secret needed**; or point at local `:7071` |
| `DALIVE_BEARER_TOKEN` | unset | optional — attribute writes to a real user instead of the technical account |
| `OPENCODE_BIN` / `OPENCODE_MIGRATION_TIMEOUT_MS` | `~/.opencode/bin/opencode` / 20 min | overrides |

**da.live auth**: nothing client-side. The deployed `functions/` MCP is anonymous-inbound and authors to da.live with its own Adobe IMS S2S credential (server-side, in Azure app settings — or `functions/.env`/`local.settings.json` when run locally). To run the da.live MCP locally with your own S2S creds, set them in `functions/` and point `DALIVE_MCP_URL` at `http://localhost:7071/api/mcp-streamable`.

---

## What this unlocks

- **The head-to-head**: with `opencode` + the closed loop both real, the eval agent's variance reporting can now score *Claude vs Kimi K2.6 on the same migrations* — a genuinely novel adaptTo() datapoint.
- The same pattern (one `opencode serve`, swap `model`) extends to any opencode-supported provider.

## What's still open

- The `sdk` backend (Claude Agent SDK, same skill) — the remaining part-5 runtime.
- Concurrency: today one shared `opencode serve`, sessions are parallel-capable but Playwright is browser-bound; add a permit budget (`MIGRATION_CONCURRENCY`) when measurements demand it.
- Re-test `opencode run` on opencode upgrades (would simplify the spawn model if fixed).
