import type { Task } from "@a2a-js/sdk";
import { startAgentServer, createLogger, SqliteTaskStore, openDb } from "@agents/a2a-common";
import { createCoordinateExecutor } from "./executor.ts";

const log = createLogger("da-coordinator");
const DB_PATH = process.env.STORE_DB_PATH ?? "./data/store.db";

const db = openDb(DB_PATH);

startAgentServer({
  name: "da-coordinator",
  description:
    "Intelligent content coordinator — composes eval/migration/content-gen agents. M2: eval-only batch (coordinate.run). A2A client AND server.",
  port: Number(process.env.PORT ?? 4004),
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
});

// Restart policy (sleep-tolerance rule): a coordinate.run interrupted mid-fan-out is
// marked failed cleanly — re-fanning-out blindly could double-run children. The eval
// agent's own rebuild handles its in-flight children; the caller re-submits the batch.
const taskStore = new SqliteTaskStore(db, "da-coordinator");
const interrupted = db
  .prepare("select a2a_task_id, payload from tasks where agent = 'da-coordinator' and state in ('submitted','working')")
  .all() as { a2a_task_id: string; payload: string }[];
for (const row of interrupted) {
  const task = JSON.parse(row.payload) as Task;
  task.status = { state: "failed", timestamp: new Date().toISOString() };
  void taskStore.save(task);
  log.warn("marked interrupted coordinate.run as failed (resubmit the batch)", { a2a_task_id: task.id });
}
db.prepare("update runs set status = 'failed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where status = 'running'").run();
