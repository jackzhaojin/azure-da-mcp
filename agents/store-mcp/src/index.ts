import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import { z } from "zod";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// MCP server over the A2A platform store (PRD part-6 open question #8): the
// adaptTo() demo moment where someone asks Claude about run results in natural
// language. Read-only, stdio transport, two SQLite files (coordinator + eval).
//
// MCP SDK v1.x: McpServer + StdioServerTransport (@modelcontextprotocol/sdk).

const HERE = dirname(fileURLToPath(import.meta.url)); // store-mcp/src
const PKG = resolve(HERE, ".."); // store-mcp/

const COORDINATOR_DB = process.env.COORDINATOR_DB ?? resolve(PKG, "..", "coordinator", "data", "store.db");
const EVAL_DB = process.env.EVAL_DB ?? resolve(PKG, "..", "eval-service", "data", "store.db");

// Lazy, read-only handles. A missing file must NOT crash the server — the tool
// that needs it returns a friendly error instead.
const handles = new Map<string, Database.Database>();
function db(which: "coordinator" | "eval"): Database.Database {
  const path = which === "coordinator" ? COORDINATOR_DB : EVAL_DB;
  let h = handles.get(path);
  if (!h) {
    // fileMustExist surfaces a clear error rather than creating an empty db.
    h = new Database(path, { readonly: true, fileMustExist: true });
    handles.set(path, h);
  }
  return h;
}

/** Wrap a tool body so a missing DB / bad query becomes a friendly isError result. */
function safe(fn: () => unknown) {
  try {
    return ok(fn());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text" as const, text: `Error: ${msg}` }] };
  }
}
function ok(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/** Parse a JSON column, tolerating null/invalid (returns the raw string on failure). */
function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const server = new McpServer({ name: "a2a-store-mcp", version: "0.1.0" });

server.registerTool(
  "list_runs",
  {
    description: "Recent runs from the coordinator store (most recent first): id, kind, status, timestamps, parsed config and stats.",
    inputSchema: { limit: z.number().int().positive().max(200).optional() },
  },
  async ({ limit }) =>
    safe(() => {
      const rows = db("coordinator")
        .prepare("select id, kind, status, config, stats, created_at, completed_at from runs order by created_at desc limit ?")
        .all(limit ?? 20) as Record<string, unknown>[];
      return rows.map((r) => ({ ...r, config: parseJson(r.config), stats: parseJson(r.stats) }));
    })
);

server.registerTool(
  "get_run",
  {
    description: "A single run by id from the coordinator store, including full parsed stats and config. Returns a not-found result if the id is unknown.",
    inputSchema: { id: z.string() },
  },
  async ({ id }) =>
    safe(() => {
      const row = db("coordinator")
        .prepare("select id, kind, status, config, stats, created_at, completed_at from runs where id = ?")
        .get(id) as Record<string, unknown> | undefined;
      if (!row) return { found: false, id, message: `No run found with id ${id}` };
      return { found: true, ...row, config: parseJson(row.config), stats: parseJson(row.stats) };
    })
);

server.registerTool(
  "list_eval_reports",
  {
    description: "Recent eval reports from the eval-service store (most recent first): id, target_url, overall_score, parsed dimension_scores, created_at.",
    inputSchema: { limit: z.number().int().positive().max(200).optional() },
  },
  async ({ limit }) =>
    safe(() => {
      const rows = db("eval")
        .prepare("select id, target_url, overall_score, dimension_scores, created_at from eval_reports order by created_at desc limit ?")
        .all(limit ?? 20) as Record<string, unknown>[];
      return rows.map((r) => ({ ...r, dimension_scores: parseJson(r.dimension_scores) }));
    })
);

server.registerTool(
  "query_store",
  {
    description:
      "Read-only SQL escape hatch over a store. Only a single SELECT statement is allowed; anything else is rejected. Rows are returned as JSON, capped at 200.",
    inputSchema: {
      db: z.enum(["coordinator", "eval"]),
      sql: z.string(),
    },
  },
  async ({ db: which, sql }) =>
    safe(() => {
      const trimmed = sql.trim().replace(/;+\s*$/, ""); // tolerate a single trailing semicolon
      // Reject anything that isn't ONE select: no extra statements, must start with select.
      if (!/^select\b/i.test(trimmed) || trimmed.includes(";")) {
        throw new Error("Only a single read-only SELECT statement is allowed.");
      }
      // better-sqlite3 readonly connection is the backstop: writes throw regardless.
      const stmt = db(which).prepare(trimmed);
      const rows = stmt.all() as Record<string, unknown>[];
      return { rowCount: Math.min(rows.length, 200), truncated: rows.length > 200, rows: rows.slice(0, 200) };
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
