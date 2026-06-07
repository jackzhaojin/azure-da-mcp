import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// PRD part-6 open question #8: a ~50-line custom MCP server over the store — the
// adaptTo() demo where someone asks Claude about run results in natural language.
// No mocks (monorepo rule): we spawn the REAL store-mcp server over stdio with the
// MCP SDK Client, pointing it at temp SQLite files we seed with the migration schema.

const AGENTS_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const TSX = join(AGENTS_ROOT, "node_modules", ".bin", "tsx");
const SERVER = join(AGENTS_ROOT, "store-mcp", "src", "index.ts");

const RUN_ID = "11111111-1111-4111-8111-111111111111";

function seedCoordinator(dbPath: string) {
  const db = new Database(dbPath);
  // runs table per a2a-common/migrations/0001_init.sql
  db.exec(`create table runs (
    id text primary key, kind text not null, config text not null,
    status text not null default 'running', stats text,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    completed_at text);`);
  db.prepare("insert into runs (id, kind, config, status, stats, created_at, completed_at) values (?,?,?,?,?,?,?)").run(
    RUN_ID,
    "eval-batch",
    JSON.stringify({ targets: ["https://example.com"], fanOut: 2 }),
    "completed",
    JSON.stringify({ branches: 2, completed: 2, passRate: 1 }),
    "2026-06-07T10:00:00.000Z",
    "2026-06-07T10:01:00.000Z"
  );
  db.close();
}

function seedEval(dbPath: string) {
  const db = new Database(dbPath);
  // eval_reports + its FK target (tasks) per 0001_init.sql; FK is unenforced here (no pragma).
  db.exec(`create table eval_reports (
    id text primary key, task_id text not null, target_url text not null,
    overall_score real, dimension_scores text, report text not null,
    created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`);
  db.prepare("insert into eval_reports (id, task_id, target_url, overall_score, dimension_scores, report, created_at) values (?,?,?,?,?,?,?)").run(
    "report-1",
    "task-1",
    "https://example.com",
    87.5,
    JSON.stringify({ structure: 90, accessibility: 85, content: 88, visual: 87 }),
    JSON.stringify({ ok: true }),
    "2026-06-07T10:00:30.000Z"
  );
  db.close();
}

/** Extract the parsed JSON text payload from an MCP tool result. */
function payload(result: { content?: Array<{ type: string; text?: string }> }): any {
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  return JSON.parse(text);
}

describe("store-mcp: conversational store queries over MCP (oq #8)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "store-mcp-e2e-"));
    const coordinatorDb = join(dir, "coordinator.db");
    const evalDb = join(dir, "eval.db");
    seedCoordinator(coordinatorDb);
    seedEval(evalDb);

    transport = new StdioClientTransport({
      command: TSX,
      args: [SERVER],
      env: { ...process.env, COORDINATOR_DB: coordinatorDb, EVAL_DB: evalDb } as Record<string, string>,
    });
    client = new Client({ name: "store-mcp-e2e", version: "0.1.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client?.close();
  });

  it("exposes exactly the 4 store tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_run", "list_eval_reports", "list_runs", "query_store"]);
  });

  it("list_runs returns the seeded run with parsed config + stats", async () => {
    const res = await client.callTool({ name: "list_runs", arguments: {} });
    const runs = payload(res as any);
    expect(Array.isArray(runs)).toBe(true);
    const run = runs.find((r: any) => r.id === RUN_ID);
    expect(run).toBeTruthy();
    expect(run.kind).toBe("eval-batch");
    expect(run.status).toBe("completed");
    expect(run.config.fanOut).toBe(2); // JSON-parsed, not a raw string
    expect(run.stats.branches).toBe(2);
  });

  it("list_eval_reports returns the seeded report with parsed dimension_scores", async () => {
    const res = await client.callTool({ name: "list_eval_reports", arguments: {} });
    const reports = payload(res as any);
    expect(reports[0].target_url).toBe("https://example.com");
    expect(reports[0].overall_score).toBe(87.5);
    expect(reports[0].dimension_scores.structure).toBe(90);
  });

  it("query_store runs a read-only SELECT", async () => {
    const res = await client.callTool({
      name: "query_store",
      arguments: { db: "coordinator", sql: "SELECT id, kind FROM runs" },
    });
    const out = payload(res as any);
    expect(out.rowCount).toBe(1);
    expect(out.rows[0].kind).toBe("eval-batch");
  });

  it("query_store rejects a non-SELECT (DELETE)", async () => {
    const res = (await client.callTool({
      name: "query_store",
      arguments: { db: "coordinator", sql: "DELETE from runs" },
    })) as any;
    expect(res.isError).toBe(true);
    const text = res.content?.[0]?.text ?? "";
    expect(text).toMatch(/SELECT/i);
    // the row must still be there — nothing was deleted
    const verify = await client.callTool({ name: "list_runs", arguments: {} });
    expect(payload(verify as any).length).toBe(1);
  });

  it("query_store rejects a stacked statement (select 1; delete from runs)", async () => {
    const res = (await client.callTool({
      name: "query_store",
      arguments: { db: "coordinator", sql: "select 1; delete from runs" },
    })) as any;
    expect(res.isError).toBe(true);
    const verify = await client.callTool({ name: "list_runs", arguments: {} });
    expect(payload(verify as any).length).toBe(1); // still intact
  });

  it("get_run with an unknown id returns a not-found result, not a crash", async () => {
    const res = await client.callTool({ name: "get_run", arguments: { id: "does-not-exist" } });
    const out = payload(res as any);
    expect(out.found).toBe(false);
    expect((res as any).isError).toBeFalsy();
  });
});
