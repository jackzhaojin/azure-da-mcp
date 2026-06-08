import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import { startAgentServer, createLogger, createArtifactStore, SqliteTaskStore, openDb } from "@agents/a2a-common";
import { mkdirSync } from "node:fs";
import { stubExecutor } from "./stub-executor";
import { createEvalExecutor, runEvalJob, type EvalRunPayload } from "./executor";
import { evalQueue, queueStats } from "./jobs/queue";
import { browserSemaphoreStats } from "./browser/semaphore";

const log = createLogger("da-eval-agent");
const PORT = Number(process.env.PORT ?? 4001);
const DB_PATH = process.env.STORE_DB_PATH ?? "./data/store.db";
const ENGINE = process.env.EVAL_ENGINE ?? "real"; // "real" | "stub"

// the engine's accessibility scan writes to <cwd>/.tmp via shell redirect — must pre-exist
mkdirSync("./.tmp", { recursive: true });
mkdirSync("./output/screenshots", { recursive: true });

const db = openDb(DB_PATH);
// Eval screenshots → R2 (public r2.dev) when configured, else the local ./output
// stand-in served via staticRoutes below. Same URL contract either way.
const artifactStore = createArtifactStore({
  localDir: "./output",
  localPublicBase: process.env.EVAL_PUBLIC_BASE ?? `http://localhost:${PORT}/artifacts`,
});
const executor = ENGINE === "stub" ? stubExecutor : createEvalExecutor(db, artifactStore);

startAgentServer({
  name: "da-eval-agent",
  description:
    "Evaluates EDS page migrations across structure, accessibility, content, visual dimensions" +
    (ENGINE === "stub" ? " (stub mode)" : ""),
  port: PORT,
  dbPath: DB_PATH,
  // local stand-in for the R2 public bucket (serves eval screenshots); unused when R2 is configured
  staticRoutes: [{ route: "/artifacts", dir: "./output" }],
  skills: [
    {
      id: "eval.run",
      name: "Evaluate page",
      description:
        "Run a 4-dimension migration-quality evaluation against a published EDS page. Payload contract: eval.run.v1",
      tags: ["eval", "eds"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
  executor,
  healthExtras: () => ({
    engine: ENGINE,
    queue: queueStats(),
    browser: browserSemaphoreStats(),
  }),
});

/**
 * Restart rebuild (sleep-tolerance rule, PRD part-1/part-2 DoD): any task that was
 * submitted/working when the previous process died is re-enqueued from the store.
 * No A2A subscribers exist for these (their SSE died with the old process), so
 * events are applied straight to the stored Task — clients poll tasks/get.
 */
if (ENGINE === "real") {
  const taskStore = new SqliteTaskStore(db, "da-eval-agent");
  const pending = db
    .prepare("select a2a_task_id, payload from tasks where agent = ? and state in ('submitted','working')")
    .all("da-eval-agent") as { a2a_task_id: string; payload: string }[];

  for (const row of pending) {
    const task = JSON.parse(row.payload) as Task;
    const payload = task.metadata?.payload as EvalRunPayload | undefined;
    if (!payload) {
      log.warn("rebuild: task has no payload metadata — marking failed", { a2a_task_id: task.id });
      task.status = { state: "failed", timestamp: new Date().toISOString() };
      void taskStore.save(task);
      continue;
    }
    log.info("rebuild: re-enqueueing task from store", { a2a_task_id: task.id, targetUrl: payload.targetUrl });

    const applyAndSave = (event: TaskStatusUpdateEvent | TaskArtifactUpdateEvent) => {
      if (event.kind === "status-update") {
        task.status = event.status;
      } else {
        task.artifacts = [...(task.artifacts ?? []), event.artifact];
      }
      void taskStore.save(task);
    };

    void evalQueue.add(() =>
      runEvalJob({ db, store: artifactStore, taskId: task.id, contextId: task.contextId, payload, publish: applyAndSave })
    );
  }
  if (pending.length) log.info("rebuild complete", { reenqueued: pending.length });
}
