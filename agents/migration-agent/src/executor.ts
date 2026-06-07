import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, Message } from "@a2a-js/sdk";
import type { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { createLogger } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";
import type { MigrationBackend, MigrationRunPayload } from "./backends/types.ts";
import { dryrunBackend } from "./backends/dryrun.ts";
import { makecomBackend } from "./backends/makecom.ts";
import { sdkBackend } from "./backends/sdk.ts";

const log = createLogger("da-migration-agent");

// PRD default is makecom; until the tunnel exists the scaffold default is dryrun.
const DEFAULT_BACKEND = process.env.MIGRATION_DEFAULT_BACKEND ?? "dryrun";

const BACKENDS: Record<string, MigrationBackend> = {
  dryrun: dryrunBackend,
  makecom: makecomBackend,
  sdk: sdkBackend,
  // opencode (Kimi K2.6) registers here at M3+ — same seam, different model vendor
};

function extractPayload(message: Message): MigrationRunPayload {
  for (const part of message.parts) {
    if (part.kind === "data") return part.data as unknown as MigrationRunPayload;
    if (part.kind === "text") {
      try {
        return JSON.parse(part.text) as MigrationRunPayload;
      } catch {
        /* keep looking */
      }
    }
  }
  throw new Error("migration.run payload not found: send a data part matching migration.run.v1");
}

function validate(p: MigrationRunPayload): void {
  if (p.sourceType !== "pdf" && p.sourceType !== "webpage") throw new Error("migration.run.v1: sourceType must be pdf|webpage");
  if (!p.sourceLocation || !/^https?:\/\//.test(p.sourceLocation)) throw new Error("migration.run.v1: 'sourceLocation' (URL) is required");
  for (const field of ["site", "owner", "pageSlug"] as const) {
    if (!p[field] || typeof p[field] !== "string") throw new Error(`migration.run.v1: '${field}' is required`);
  }
}

/** Facade executor: one card, one contract — backends are swappable runtimes. */
export const migrationExecutor: AgentExecutor = {
  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = ctx;

    const status = (state: "working" | "completed" | "failed", text?: string, final = false): TaskStatusUpdateEvent => ({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state,
        timestamp: new Date().toISOString(),
        ...(text
          ? {
              message: {
                kind: "message" as const,
                messageId: randomUUID(),
                role: "agent" as const,
                parts: [{ kind: "text" as const, text }],
                taskId,
                contextId,
              },
            }
          : {}),
      },
      final,
    });

    bus.publish({
      kind: "task",
      id: taskId,
      contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [userMessage],
    } satisfies Task);

    try {
      const payload = extractPayload(userMessage);
      validate(payload);
      const backendName = payload.backend ?? DEFAULT_BACKEND;
      const backend = BACKENDS[backendName];
      if (!backend) throw new Error(`unknown backend '${backendName}' — available: ${Object.keys(BACKENDS).join(", ")}`);
      backend.assertConfigured();

      log.info("migration.run started", { a2a_task_id: taskId, context_id: contextId, backend: backendName, slug: payload.pageSlug });
      bus.publish(status("working", `migration started (backend: ${backendName})`));

      const result = await backend.run(payload, (note) => bus.publish(status("working", note)));

      bus.publish({
        kind: "artifact-update",
        taskId,
        contextId,
        artifact: {
          artifactId: randomUUID(),
          name: "migration-report",
          parts: [{ kind: "data", data: result as unknown as Record<string, unknown> }],
        },
      } satisfies TaskArtifactUpdateEvent);
      bus.publish(status("completed", undefined, true));
      log.info("migration.run completed", { a2a_task_id: taskId, backend: backendName, status: result.status, confidence: result.confidence });
    } catch (err) {
      bus.publish(status("failed", String(err), true));
      log.error("migration.run failed", { a2a_task_id: taskId, error: String(err) });
    } finally {
      bus.finished();
    }
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
