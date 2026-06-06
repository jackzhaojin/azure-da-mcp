# Part 5 — Migration Agent (A2A facade over two backends)

The migration capability already exists twice: as the Make.com full prompt (`make-dot-com/v1-content-migration/agent-init-prompt-full.md`) and as the Claude-Code-side `da-live-author-playwright` skill. Neither is addressable by other agents. This part wraps both behind one A2A interface — proving the "decoupled capabilities" thesis: same contract, swappable runtimes.

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
  "backend": "makecom" | "sdk",               // default "sdk"
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

## Backend A — `sdk` (canonical going forward)

```
agents/migration-agent/
  src/
    a2a/                 # standard wiring
    backends/
      sdk.ts             # Claude Agent SDK query() with MCP servers + bundled skill
      makecom.ts         # webhook trigger + callback receiver
    prompts/             # the full migration prompt, ported from make-dot-com (versioned)
```

- `query()` with: the custom MCP server (`/api/mcp-streamable`, bearer = DA IMS token or S2S), Playwright MCP for source viewing + post-publish validation ("agentic eyes"), and the migration prompt (ported from `agent-init-prompt-full.md`, phases 1–4 intact: context loading → transformation → validation loop (≤3 iterations) → completion + memory append)
- Skills bundling per `agent-claude-sdk/agent-sdk-skills-poc/FINDINGS.md`: `settingSources: ['user','project']` + `'Skill'` in `allowedTools` + correct `cwd` — lets the SDK backend reuse `da-live-author-playwright` directly instead of re-encoding it in the prompt (evaluate both; pick whichever validates cleaner, keep the other as fallback)
- **Browser permits**: Playwright MCP spawns go through the same global semaphore pattern as eval-service. Since migration and eval are separate processes, each service gets its own permit budget via env (`BROWSER_PERMITS_MIGRATION=1` initially); a shared cross-service broker is deferred until measurements demand it
- Agent memory page (`agent-memory.html` on da.live) read/append behavior preserved — cross-run learning stays in da.live, deliberately NOT moved to Supabase (it's content, and the Make.com backend shares it)

## Backend B — `makecom` (kept, becomes async-correct)

Flow:
1. Facade receives A2A task → POSTs to a Make.com **custom webhook** (scenario trigger) with the contract payload + a per-task callback URL
2. Make.com scenario runs the existing AI-Agent module (unchanged prompt, unchanged MCP integration)
3. Final scenario module: HTTP POST of the final report to the facade's callback URL (`/callbacks/makecom/{taskId}`, bearer-gated)
4. Facade completes the A2A task with the report artifact; push notifications fire

Required Make.com change: **one added HTTP module** at the end of the scenario (the callback), plus accepting the callback URL as an input var. The 300s timeout stops mattering because the facade, not Make.com, owns task state.

Because the `makecom` backend sits behind the Agent Card, the scenario is free to **fan out across multiple models/agents internally** (e.g. routing some steps to the Kimi K2.6 Chinese model) without changing `migration.run.v1` — see the platform-wide note in [Part 3](./part-3-a2a-protocol-layer.md#platform-wide-note-makecom-as-a-multi-model-backend). The same applies to the content-gen `makecom` backend (Part 4).

## Multithreading / "agentic eyes" at Nx

- Run isolation already exists via `folderPostfix` (distinct da.live folders per run) — the orchestrator generates unique postfixes per fan-out branch
- `sdk` backend parallelism = worker pool (start `MIGRATION_CONCURRENCY=1`, browser-bound) — Playwright MCP per `query()` gives each run an isolated browser context by construction
- `makecom` backend parallelism = Make.com's own scenario concurrency (configurable there); the facade just tracks N in-flight tasks
- Validation screenshots from the agentic-eyes loop become Supabase Storage artifacts on the task — today they're lost inside the Make.com run log

## Definition of Done

- Same `migration.run` payload executed against both backends produces a published page + contract-conformant artifact
- 3 concurrent `sdk`-backend migrations on the VM complete without browser contention failures
- Make.com scenario survives a >300s migration via the callback pattern
