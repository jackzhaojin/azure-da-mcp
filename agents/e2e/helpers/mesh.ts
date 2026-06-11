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
 * Env vars that change agent behavior and routinely leak in from a developer
 * shell that has `agents/.env` sourced (mesh/edge auth, SSO, peer-agent URLs
 * pointing at the live :400x mesh, the D1 cloud proxy, engine selection,
 * Make.com ingress). Spawned test agents must be deterministic regardless of
 * the invoking shell, so these are stripped; a test that wants one supplies
 * it explicitly via `opts.env`. R2_* is stripped too — spawned agents always
 * use the local ./output artifact backend (the live R2 test exercises R2
 * in-process, not via a spawned agent). AI keys are NOT stripped: live tests
 * blank them themselves via NO_AI_ENV, and manual full-agentic runs inherit.
 */
const SANITIZED_ENV_VARS = [
  "A2A_MESH_TOKEN",
  "A2A_EDGE_TOKEN",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_SECRET",
  "AUTH_ALLOWED_EMAILS",
  "D1_PROXY_URL",
  "D1_PROXY_SECRET",
  "EVAL_ENGINE",
  "EVAL_CONCURRENCY",
  "EVAL_MAX_ATTEMPTS",
  "BROWSER_PERMITS",
  "EVAL_AGENT_URL",
  "CONTENT_GEN_URL",
  "MIGRATION_AGENT_URL",
  "COORDINATOR_URL",
  "MAKECOM_WEBHOOK_URL",
  "MAKECOM_TIMEOUT_MS",
  "MIGRATION_CALLBACK_BASE",
  "MIGRATION_DEFAULT_BACKEND",
  "A2A_PUBLIC_BASE",
  "EVAL_PUBLIC_BASE",
  "CONTENT_PUBLIC_BASE",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE",
  "R2_ACCOUNT_ID",
  "R2_S3_ENDPOINT",
] as const;

function sanitizedEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const key of SANITIZED_ENV_VARS) delete env[key];
  return env;
}

/**
 * Spawns a real agent server as a child process on an isolated port with a
 * throwaway SQLite file, and waits for /health. No mocks — the tests exercise
 * the same processes `npm run dev:*` starts.
 */
export async function startAgent(
  service: "eval-service" | "content-gen" | "coordinator" | "migration-agent",
  port: number,
  opts: { dbPath?: string; env?: Record<string, string> } = {}
): Promise<AgentHandle> {
  const db = opts.dbPath ?? join(mkdtempSync(join(tmpdir(), "a2a-e2e-")), "store.db");
  const proc = spawn(TSX, ["src/index.ts"], {
    cwd: join(ROOT, service),
    env: { ...sanitizedEnv(), PORT: String(port), STORE_DB_PATH: db, ...(opts.env ?? {}) },
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
