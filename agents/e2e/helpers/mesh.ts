import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

export interface AgentHandle {
  proc: ChildProcess;
  port: number;
  url: string;
  dbPath: string;
  service: string;
  output: () => string;
}

/**
 * Spawns a real agent server as a child process on an isolated port with a
 * throwaway SQLite file, and waits for /health. No mocks — the tests exercise
 * the same processes `npm run dev:*` starts.
 */
export async function startAgent(
  service: "eval-service" | "content-gen",
  port: number,
  dbPath?: string
): Promise<AgentHandle> {
  const db = dbPath ?? join(mkdtempSync(join(tmpdir(), "a2a-e2e-")), "store.db");
  const proc = spawn(TSX, ["src/index.ts"], {
    cwd: join(ROOT, service),
    env: { ...process.env, PORT: String(port), STORE_DB_PATH: db },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  proc.stdout?.on("data", (d) => (out += d));
  proc.stderr?.on("data", (d) => (out += d));

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) break;
    try {
      const res = await fetch(`http://localhost:${port}/health`);
      if (res.ok) {
        return {
          proc,
          port,
          url: `http://localhost:${port}`,
          dbPath: db,
          service,
          output: () => out,
        };
      }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error(`${service} failed to become healthy on :${port}\n--- child output ---\n${out}`);
}

export async function stopAgent(h: AgentHandle): Promise<void> {
  if (h.proc.exitCode === null) {
    const exited = new Promise((r) => h.proc.once("exit", r));
    h.proc.kill();
    await exited;
  }
}
