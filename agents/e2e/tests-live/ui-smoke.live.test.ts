import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const UI_PORT = 13000;
const UI_URL = `http://localhost:${UI_PORT}`;
const PASSWORD = "test-pass-123";

// agents/ui smoke: real `next dev`, real middleware auth, real SQLite read.
// Seeds a coordinator-style store and verifies the dashboard's API surface.
describe("agents/ui (Next.js scaffold)", () => {
  let proc: ChildProcess;
  let runId: string;

  beforeAll(async () => {
    // seed a coordinator store with one completed run
    const dbPath = join(mkdtempSync(join(tmpdir(), "ui-e2e-")), "store.db");
    const db = new Database(dbPath);
    db.exec(`create table runs (
      id text primary key, kind text not null, config text not null,
      status text not null default 'running', stats text,
      created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      completed_at text
    )`);
    runId = randomUUID();
    db.prepare("insert into runs (id, kind, config, status, stats, completed_at) values (?, 'eval-batch', ?, 'completed', ?, ?)").run(
      runId,
      JSON.stringify({ goal: "evaluate", targets: ["https://example.com"], fanOut: 2 }),
      JSON.stringify({
        branches: 2,
        completed: 2,
        failed: 0,
        passRate: 0.5,
        overall: { mean: 66, stddev: 0, min: 66, max: 66 },
        perDimension: { structure: { mean: 65, stddev: 0, min: 65, max: 65, n: 2 } },
      }),
      new Date().toISOString()
    );
    db.close();

    proc = spawn(join(ROOT, "node_modules", ".bin", "next"), ["dev", "-p", String(UI_PORT)], {
      cwd: join(ROOT, "ui"),
      env: { ...process.env, UI_PASSWORD: PASSWORD, COORDINATOR_DB: dbPath },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true, // own process group → clean teardown of next's children
    });
    let out = "";
    proc.stdout?.on("data", (d) => (out += d));
    proc.stderr?.on("data", (d) => (out += d));

    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${UI_URL}/login`);
        if (res.status === 200) return;
      } catch {
        /* booting */
      }
      if (proc.exitCode !== null) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`next dev did not become ready\n${out}`);
  }, 120_000);

  afterAll(() => {
    if (proc?.pid && proc.exitCode === null) {
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        proc.kill();
      }
    }
  });

  it("middleware gates the API: 401 without the auth cookie", async () => {
    const res = await fetch(`${UI_URL}/api/runs`);
    expect(res.status).toBe(401);
  });

  it("middleware redirects pages to /login", async () => {
    const res = await fetch(`${UI_URL}/runs`, { redirect: "manual" });
    expect([302, 307]).toContain(res.status);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("rejects a wrong password", async () => {
    const res = await fetch(`${UI_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("logs in and reads the seeded run (auth → store → JSON)", async () => {
    const login = await fetch(`${UI_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: PASSWORD }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toContain("ui-auth=");

    const res = await fetch(`${UI_URL}/api/runs`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const { runs } = (await res.json()) as {
      runs: Array<{ id: string; status: string; stats: { overall: { mean: number } } }>;
    };
    expect(runs.length).toBe(1);
    expect(runs[0].id).toBe(runId);
    expect(runs[0].status).toBe("completed");
    expect(runs[0].stats.overall.mean).toBe(66); // stats JSON parsed through
  }, 60_000);
});
