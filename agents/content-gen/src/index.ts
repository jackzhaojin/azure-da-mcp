import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import type { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { startAgentServer, createLogger } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";

const log = createLogger("da-content-gen-agent");

/** Walking-skeleton executor: fakes content.brief. Real Agent SDK backend lands at M3 (PRD part-4). */
const contentGenExecutor: AgentExecutor = {
  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = ctx;
    log.info("content.brief received", { a2a_task_id: taskId, context_id: contextId });

    bus.publish({
      kind: "task",
      id: taskId,
      contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [userMessage],
    } satisfies Task);

    bus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: { state: "working", timestamp: new Date().toISOString() },
      final: false,
    } satisfies TaskStatusUpdateEvent);

    await new Promise((r) => setTimeout(r, 1000)); // pretend to think

    bus.publish({
      kind: "artifact-update",
      taskId,
      contextId,
      artifact: {
        artifactId: randomUUID(),
        name: "content-brief",
        parts: [
          {
            kind: "data",
            data: {
              title: "Stub brief: Alpine touring bindings buying guide",
              audience: "intermediate backcountry skiers",
              sections: ["intro", "binding types", "comparison table", "fit checklist"],
              stub: true,
            },
          },
        ],
      },
    } satisfies TaskArtifactUpdateEvent);

    bus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: { state: "completed", timestamp: new Date().toISOString() },
      final: true,
    } satisfies TaskStatusUpdateEvent);
    bus.finished();
    log.info("content.brief completed", { a2a_task_id: taskId });
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
  name: "da-content-gen-agent",
  description: "Generates content briefs and synthetic legacy source pages (skeleton stub)",
  port: Number(process.env.PORT ?? 4002),
  dbPath: process.env.STORE_DB_PATH ?? "./data/store.db",
  skills: [
    {
      id: "content.brief",
      name: "Generate content brief",
      description: "Produce a structured content brief for a target page (stub: returns a canned brief)",
      tags: ["content"],
      inputModes: ["application/json", "text/plain"],
      outputModes: ["application/json"],
    },
  ],
  executor: contentGenExecutor,
});
