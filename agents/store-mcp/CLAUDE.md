# CLAUDE.md — agents/store-mcp

**Purpose**: Read-only MCP server exposing the A2A platform's SQLite stores to conversational clients (e.g. Claude Desktop) — the adaptTo() "ask Claude about run results in natural language" moment. · **Tech**: TypeScript, Node 20, `@modelcontextprotocol/sdk` (`McpServer` + `StdioServerTransport`), `better-sqlite3`, `zod`. · **Transport**: stdio (NOT an HTTP server, no port). · **Status**: v2.0 A2A platform (PRD part-6 open question #8).

Platform docs: [`ai-docs/2026-06-08-a2a-platform-v2.0/`](../../ai-docs/2026-06-08-a2a-platform-v2.0/) (v2.0), [`ai-docs/2026-06-05-a2a-agent-platform/`](../../ai-docs/2026-06-05-a2a-agent-platform/) (PRD). v1.1.0 `content-authoring-eval/` is the frozen legacy backup — **D5: never touch it.**

## When to work here
- Adding/changing the read-only store tools surfaced to conversational MCP clients.
- Wiring this server into Claude Desktop (or any MCP client) over stdio.
- Adjusting which stores/columns are queryable.

## Key files
- `src/index.ts` — the whole server. Registers 4 tools, opens lazy read-only `better-sqlite3` handles over two store files, connects `StdioServerTransport`.
- `package.json` — `npm start` (tsx, stdio); no `dev` server.

## Tools
- `list_runs` — recent coordinator runs (id, kind, status, timestamps, parsed config + stats).
- `get_run` — one run by id; returns a friendly `found: false` result (no crash) for unknown ids.
- `list_eval_reports` — recent eval-service reports (target_url, overall_score, parsed dimension_scores).
- `query_store` — single-`SELECT` escape hatch over `coordinator | eval`.

## Gotchas / non-obvious (MOST IMPORTANT)
- **`query_store` enforces a SINGLE read-only `SELECT`**: must start with `select`, must contain no `;` after trimming one trailing semicolon — so `select 1; delete …` is rejected, and so is any non-SELECT. The `better-sqlite3` connection is opened `readonly` as the backstop (writes throw regardless). Rows capped at 200 with a `truncated` flag. Do not loosen this — it's the safety contract for letting a chat client run SQL.
- **stdio only** — there is no HTTP port. Clients spawn it as a subprocess and speak MCP over stdin/stdout. Don't add Express here; it's deliberately not part of the A2A mesh.
- **Two separate SQLite files, not one DB**: coordinator store (`runs`) and eval-service store (`eval_reports`) are distinct. Override with `COORDINATOR_DB` / `EVAL_DB`; defaults resolve to `../coordinator/data/store.db` and `../eval-service/data/store.db` relative to this package.
- **Handles are lazy and a missing file must NOT crash the server** — `fileMustExist: true` surfaces a clear per-tool error instead of silently creating an empty DB. Boot succeeds even if a store hasn't been created yet.
- **JSON columns are parsed defensively** (`config`, `stats`, `dimension_scores`): invalid/null tolerated, raw string returned on parse failure.
- Schema/tables come from `a2a-common/migrations/` (SQLite dialect = same SQL as Cloudflare D1) — this server is a pure reader and does not run migrations.

## Run / test
```bash
cd agents && set -a && source .env && set +a
cd store-mcp && npm start          # stdio server; usually launched by an MCP client, not by hand
```
Fast test: `agents/tests/store-mcp` — spawns the real server over stdio via the MCP SDK `Client`: `tools/list` returns the 4 tools; `list_runs` / `list_eval_reports` parse JSON columns from seeded SQLite; `query_store` runs a SELECT but rejects `DELETE` and stacked `select 1; delete …`; `get_run` on an unknown id returns not-found. Run from `agents/`: `npm run test:e2e`. **Real tests, no mocks.**

## Conventions
- Read-only by design — never add write tools or open a non-`readonly` handle.
- Stores are the same local SQLite the agents write (= Cloudflare D1 SQL at M5).
- Env from `agents/.env` via `set -a && source .env && set +a` (for `COORDINATOR_DB` / `EVAL_DB` overrides).
