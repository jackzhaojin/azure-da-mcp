import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import type { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { startAgentServer, createLogger } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";

const log = createLogger("da-eval-agent");
const DIMENSIONS = ["structure", "accessibility", "content", "visual"] as const;

/**
 * Walking-skeleton executor: fakes the 4-dimension evaluation with realistic
 * A2A event traffic (working updates per dimension, artifact, completed).
 * The real engine (copied from content-authoring-eval, D5) replaces the
 * fake loop at M1 — the event choreography stays identical.
 */
const evalExecutor: AgentExecutor = {
  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = ctx;
    log.info("eval.run received", { a2a_task_id: taskId, context_id: contextId });

    const initial: Task = {
      kind: "task",
      id: taskId,
      contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [userMessage],
    };
    bus.publish(initial);

    const scores: Record<string, number> = {};
    for (const dim of DIMENSIONS) {
      const working: TaskStatusUpdateEvent = {
        kind: "status-update",
        taskId,
        contextId,
        status: {
          state: "working",
          timestamp: new Date().toISOString(),
          message: {
            kind: "message",
            messageId: randomUUID(),
            role: "agent",
            parts: [{ kind: "text", text: `evaluating dimension: ${dim}` }],
            taskId,
            contextId,
          },
        },
        final: false,
      };
      bus.publish(working);
      await new Promise((r) => setTimeout(r, 750)); // pretend to work
      scores[dim] = 70 + Math.floor(Math.random() * 30);
      log.info("dimension done", { a2a_task_id: taskId, dimension: dim, score: scores[dim] });
    }

    const overall = Math.round(
      Object.values(scores).reduce((a, b) => a + b, 0) / DIMENSIONS.length
    );

    const artifact: TaskArtifactUpdateEvent = {
      kind: "artifact-update",
      taskId,
      contextId,
      artifact: {
        artifactId: randomUUID(),
        name: "eval-report",
        parts: [{ kind: "data", data: { overall, dimensions: scores, stub: true } }],
      },
    };
    bus.publish(artifact);

    const done: TaskStatusUpdateEvent = {
      kind: "status-update",
      taskId,
      contextId,
      status: { state: "completed", timestamp: new Date().toISOString() },
      final: true,
    };
    bus.publish(done);
    bus.finished();
    log.info("eval.run completed", { a2a_task_id: taskId, overall });
  },

  async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
    bus.publish({
      kind: "status-update",
      taskId,
      contextId: "",
      status: { state: "canceled", timestamp: new Date().toISOString() },
      final: true,
    } satisfies TaskStatusUpdateEvent);
    bus.finished();
  },
};

startAgentServer({
  name: "da-eval-agent",
  description:
    "Evaluates EDS page migrations across structure, accessibility, content, visual dimensions (skeleton stub)",
  port: Number(process.env.PORT ?? 4001),
  dbPath: process.env.STORE_DB_PATH ?? "./data/store.db",
  skills: [
    {
      id: "eval.run",
      name: "Evaluate page",
      description:
        "Run a 4-dimension migration-quality evaluation against a published EDS page (stub: returns fake scores)",
      tags: ["eval", "eds"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
  executor: evalExecutor,
});
