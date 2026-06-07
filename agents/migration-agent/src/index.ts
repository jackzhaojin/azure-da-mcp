import express from "express";
import type { Task } from "@a2a-js/sdk";
import { startAgentServer, createLogger, SqliteTaskStore } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";
import { migrationExecutor } from "./executor.ts";
import { resolveCallback } from "./callbacks.ts";
import type { MigrationResult } from "./backends/types.ts";

const log = createLogger("da-migration-agent");
const DB_PATH = process.env.STORE_DB_PATH ?? "./data/store.db";

startAgentServer({
  name: "da-migration-agent",
  description:
    "Migrates a source (PDF/webpage, incl. synthetic) into a da.live EDS page with self-validation. Facade over swappable backends: makecom (primary — webhook out, callback in), sdk (M3), opencode (M3+), dryrun (simulation).",
  port: Number(process.env.PORT ?? 4003),
  dbPath: DB_PATH,
  shimAgentId: "migration",
  skills: [
    {
      id: "migration.run",
      name: "Migrate page",
      description: "Author a source into da.live and validate the preview. Payload contract: migration.run.v1",
      tags: ["migration", "da.live", "eds"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
  executor: migrationExecutor,
  extraRoutes: ({ app, db, edgeToken }) => {
    const taskStore = new SqliteTaskStore(db, "da-migration-agent");

    // Make.com return path (PRD part-3/part-5): the scenario's final HTTP module
    // POSTs the final-report JSON here. Normal path: resolves the parked backend
    // waiter and the executor completes the task. Post-restart path: the waiter
    // is gone, so the report completes the task straight from the store —
    // a Make.com run longer than our process's life still lands (sleep-tolerance).
    app.post("/callbacks/makecom/:taskId", express.json({ limit: "2mb" }), async (req, res) => {
      if (edgeToken && req.headers.authorization !== `Bearer ${edgeToken}`) {
        return res.status(401).json({ error: "unauthorized: bearer token required" });
      }
      const { taskId } = req.params;
      const report = req.body as MigrationResult;
      if (!report || typeof report !== "object" || !report.status) {
        return res.status(400).json({ error: "final-report JSON body required (status, confidence, previewUrl, …)" });
      }

      if (resolveCallback(taskId, report)) {
        log.info("makecom callback delivered to in-process waiter", { a2a_task_id: taskId });
        return res.json({ ok: true, delivered: "in-process" });
      }

      // late / post-restart: complete the task directly from the store
      const task = (await taskStore.load(taskId)) as Task | undefined;
      if (!task) return res.status(404).json({ error: `unknown task ${taskId}` });
      if (["completed", "failed", "canceled"].includes(task.status.state)) {
        return res.status(409).json({ error: `task ${taskId} already ${task.status.state}` });
      }
      task.artifacts = [
        ...(task.artifacts ?? []),
        {
          artifactId: randomUUID(),
          name: "migration-report",
          parts: [{ kind: "data", data: { ...report, backend: "makecom" } as unknown as Record<string, unknown> }],
        },
      ];
      task.status = { state: "completed", timestamp: new Date().toISOString() };
      await taskStore.save(task);
      log.info("makecom callback completed task from store (post-restart path)", { a2a_task_id: taskId });
      res.json({ ok: true, delivered: "store" });
    });
  },
});
