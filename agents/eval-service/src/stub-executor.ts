import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import type { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { createLogger } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";

const log = createLogger("da-eval-agent");
const DIMENSIONS = ["structure", "accessibility", "content", "visual"] as const;

/**
 * Stub executor (EVAL_ENGINE=stub): the walking-skeleton fake. Kept because the
 * fast e2e suite uses it to pin the A2A event choreography without browsers or
 * API keys. Same event shapes as the real executor.
 */
export const stubExecutor: AgentExecutor = {
  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = ctx;
    log.info("eval.run received (stub)", { a2a_task_id: taskId, context_id: contextId });

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

    bus.publish({
      kind: "status-update",
      taskId,
      contextId,
      status: { state: "completed", timestamp: new Date().toISOString() },
      final: true,
    } satisfies TaskStatusUpdateEvent);
    bus.finished();
    log.info("eval.run completed (stub)", { a2a_task_id: taskId, overall });
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
