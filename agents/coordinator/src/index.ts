import type { Task } from "@a2a-js/sdk";
import { startAgentServer, createLogger, SqliteTaskStore, openDb } from "@agents/a2a-common";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCoordinateExecutor } from "./executor.ts";
import { mountRunsRoutes } from "./runs-routes.ts";

const log = createLogger("da-coordinator");
const DB_PATH = process.env.STORE_DB_PATH ?? "./data/store.db";
const PORT = Number(process.env.PORT ?? 4004);

const db = await openDb(DB_PATH);

const { app } = await startAgentServer({
  name: "da-coordinator",
  description:
    "Intelligent content coordinator — composes eval/migration/content-gen agents. M2: eval-only batch (coordinate.run). A2A client AND server.",
  port: PORT,
  dbPath: DB_PATH,
  shimAgentId: "coordinator",
  skills: [
    {
      id: "coordinate.run",
      name: "Coordinate a run",
      description:
        "Run a coordinated pipeline. M2 scope: goal='evaluate' fan-out over a URL list with variance stats. Payload contract: coordinate.run.v1",
      tags: ["coordinator", "batch", "variance"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
  executor: createCoordinateExecutor(db),
  // Domain reads (GET /runs, /runs/:id) live on the A2A side — the store's only
  // owner. The Next.js dashboard consumes them over loopback; it has no db access.
  extraRoutes: mountRunsRoutes,
});

// Restart policy (sleep-tolerance rule): a coordinate.run interrupted mid-fan-out is
// marked failed cleanly — re-fanning-out blindly could double-run children. The eval
// agent's own rebuild handles its in-flight children; the caller re-submits the batch.
const taskStore = new SqliteTaskStore(db, "da-coordinator");
const interrupted = await db
  .prepare("select a2a_task_id, payload from tasks where agent = 'da-coordinator' and state in ('submitted','working')")
  .all<{ a2a_task_id: string; payload: string }>();
for (const row of interrupted) {
  const task = JSON.parse(row.payload) as Task;
  task.status = { state: "failed", timestamp: new Date().toISOString() };
  void taskStore.save(task);
  log.warn("marked interrupted coordinate.run as failed (resubmit the batch)", { a2a_task_id: task.id });
}
await db.prepare("update runs set status = 'failed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where status = 'running'").run();

// ── Next.js dashboard, same process + port ─────────────────────────────────
// The A2A wire surface above is served by the exact same Express middleware as
// every other agent (zero drift); Next mounts as the catch-all AFTER /health,
// so agent-card / /a2a / /hooks / /health always win. COORDINATOR_UI=off skips
// the UI entirely (lean mode for tests/CI).
if (process.env.COORDINATOR_UI !== "off") {
  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const dev = process.env.NODE_ENV !== "production";
  void (async () => {
    try {
      // next ships CJS — under NodeNext its default-import type isn't callable,
      // but at runtime `default` IS the factory function. Type it minimally.
      type NextFactory = (opts: { dev: boolean; dir: string; hostname: string; port: number }) => {
        prepare(): Promise<void>;
        getRequestHandler(): (req: unknown, res: unknown) => unknown;
      };
      const { default: next } = await import("next");
      // hostname/port matter: without them Next builds request.url against its
      // default :3000 and Auth.js derives the OAuth redirect_uri from it.
      const nextApp = (next as unknown as NextFactory)({ dev, dir: appDir, hostname: "localhost", port: PORT });
      const handle = nextApp.getRequestHandler();
      await nextApp.prepare();
      app.use((req, res) => void handle(req, res));
      log.info("coordinator ui mounted", { url: `http://localhost:${PORT}/`, mode: dev ? "dev" : "production" });
    } catch (err) {
      log.warn("coordinator ui failed to start (A2A surface unaffected)", { error: String(err) });
    }
  })();
}
