# Part 5 — Migration Agent (A2A facade over three backends)

The migration capability already exists twice: as the Make.com full prompt (`make-dot-com/v1-content-migration/agent-init-prompt-full.md`) and as the Claude-Code-side `da-live-author-playwright` skill. Neither is addressable by other agents. This part wraps them — plus a third runtime, the **opencode CLI driving the Kimi K2.6 model** — behind one A2A interface, proving the "decoupled capabilities" thesis: same contract, swappable runtimes.

**Three backends, one Agent Card:**

| Backend | Role | Runtime |
|---|---|---|
| `makecom` | **primary (default)** | Make.com scenario running the existing migration prompt |
| `sdk` | backup | Claude Agent SDK `query()` + `da-live-author-playwright` skill |
| `opencode` | backup | opencode CLI configured with the **Kimi K2.6** model |

All three drive da.live through the same custom `functions/` MCP server and emit the same artifact; the caller picks one per task.

## Decision Context (D1)

The migration agent keeps using the **custom `functions/` MCP server** for da.live operations:
- `preview_publish_dalive_content` exists only there (Adobe's da-mcp has no `admin.hlx.page` integration)
- Make.com's AI-Agent module needs the `args.bearerToken` "Hack 2" (`McpStreamableFunction.js:135-141`), which only our server implements
- The 3-tier auth (header → arg-bearer → S2S mint via `AdobeImsClient.js`) stays untouched

**Watch item**: if Adobe ships preview/publish in da-mcp ([adobe-rnd/da-mcp](https://github.com/adobe-rnd/da-mcp), early access), revisit a hybrid where the SDK backend uses Adobe for CRUD. Not before.

## Task Contract (`migration.run.v1`)

```jsonc
// input
{
  "sourceType": "pdf" | "webpage",
  "sourceLocation": "https://...",            // incl. content-gen synthetic source URLs
  "site": "string", "owner": "jackzhaojin",
  "folderPostfix": "string",                  // run isolation — maps to existing {{5.folderPostfix}}
  "pageSlug": "string",
  "blockLibraryUrl": "https://...",           // optional
  "backend": "makecom" | "sdk" | "opencode",  // default "makecom"
  "maxRefinementIterations": 3                // matches existing prompt's validation loop
}

// artifact — mirrors the existing Make.com final-report contract
{
  "pageUrl": "https://da.live/edit#/{owner}/{site}/migration-batch-{date}-{postfix}/{slug}",
  "previewUrl": "https://main--{site}--{owner}.aem.page/...",
  "status": "PASS | NEEDS-REFINEMENT | FAIL",
  "confidence": 92,
  "blocksUsed": ["hero", "cards", "columns"],
  "refinementIterations": 2,
  "gaps": ["..."]
}
```

The input fields are deliberately 1:1 with the Make.com runtime vars (`{{5.sourceType}}`, `{{5.sourceLocation}}`, `{{5.folderPostfix}}`, `{{5.siteName}}`) so the makecom backend is a pure pass-through.

## Implementation layout

```
agents/migration-agent/
  src/
    a2a/                 # standard wiring (Agent Card, task store, push notifications)
    backends/
      makecom.ts         # webhook trigger + callback receiver (primary)
      sdk.ts             # Claude Agent SDK query() with MCP servers + bundled skill
      opencode.ts        # opencode CLI subprocess, configured with the Kimi K2.6 model
    prompts/             # the full migration prompt, ported from make-dot-com (versioned)
```

## Backend A — `makecom` (primary, default)

The default runtime: the existing, battle-tested Make.com scenario. Flow:

1. Facade receives A2A task → POSTs to a Make.com **custom webhook** (scenario trigger) with the contract payload + a per-task callback URL
2. Make.com scenario runs the existing AI-Agent module (unchanged prompt, unchanged MCP integration via the `args.bearerToken` hack)
3. Final scenario module: HTTP POST of the final report to the facade's callback URL (`/callbacks/makecom/{taskId}`, bearer-gated — reachable from Make.com via the `cloudflared` tunnel during local dev, Part 3)
4. Facade completes the A2A task with the report artifact; push notifications fire

Required Make.com change: **one added HTTP module** at the end of the scenario (the callback), plus accepting the callback URL as an input var. The 300s timeout stops mattering because the facade, not Make.com, owns task state.

## Backend B — `sdk` (backup)

A pure in-repo alternative — useful when Make.com is unavailable/rate-limited, or for a fully local run.

- `query()` with: the custom MCP server (`/api/mcp-streamable`, bearer = DA IMS token or S2S), Playwright MCP for source viewing + post-publish validation ("agentic eyes"), and the migration prompt (ported from `agent-init-prompt-full.md`, phases 1–4 intact: context loading → transformation → validation loop (≤3 iterations) → completion + memory append)
- Skills bundling per `agent-claude-sdk/agent-sdk-skills-poc/FINDINGS.md`: `settingSources: ['user','project']` + `'Skill'` in `allowedTools` + correct `cwd` — lets the SDK backend reuse `da-live-author-playwright` directly instead of re-encoding it in the prompt
- **Browser permits**: Playwright MCP spawns go through the same global semaphore pattern as eval-service. Since migration and eval are separate processes, each service gets its own permit budget via env (`BROWSER_PERMITS_MIGRATION=1` initially); a shared cross-service broker is deferred until measurements demand it

## Backend C — `opencode` · Kimi K2.6 (backup)

A second non-Make.com path that swaps the *model vendor* while keeping the same migration prompt and MCP tools — the cleanest demonstration of "decoupled capabilities, swappable runtimes".

- Runs the [opencode](https://github.com/sst/opencode) CLI as a subprocess, configured with the **Kimi K2.6** model (Moonshot), pointed at the same custom `functions/` MCP server (CRUD + preview/publish) and the ported migration prompt
- Gives a non-Anthropic cost/quality datapoint — and, paired with the eval agent's variance reporting, a head-to-head: *"Claude vs Kimi K2.6 on the same 10 migrations"* is a genuinely novel adaptTo() result
- Shares the Playwright "agentic eyes" validation loop and browser-permit handling with the `sdk` backend

The agent memory page (`agent-memory.html` on da.live) read/append behavior is preserved across **all three** backends — cross-run learning stays in da.live, deliberately NOT moved into the store (it's content, and every backend shares it).

## Multithreading / "agentic eyes" at Nx

- Run isolation already exists via `folderPostfix` (distinct da.live folders per run) — the coordinator generates unique postfixes per fan-out branch
- `makecom` backend parallelism = Make.com's own scenario concurrency (configurable there); the facade just tracks N in-flight tasks
- `sdk` and `opencode` backend parallelism = worker pool (start `MIGRATION_CONCURRENCY=1`, browser-bound) — Playwright MCP per run gives each an isolated browser context by construction
- Validation screenshots from the agentic-eyes loop become R2 artifacts on the task — today they're lost inside the Make.com run log

## Definition of Done

- Same `migration.run` payload executed against all three backends (`makecom`, `sdk`, `opencode`) produces a published page + contract-conformant artifact
- 3 concurrent `sdk`-backend migrations on the dev machine complete without browser contention failures
- Make.com scenario survives a >300s migration via the callback pattern
- `opencode`/Kimi K2.6 backend completes one migration end-to-end against the same MCP server and prompt
