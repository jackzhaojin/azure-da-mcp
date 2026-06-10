import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, Message, Artifact } from "@a2a-js/sdk";
import type { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { createLogger, recordArtifact, type ArtifactStore, type StoreDb } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { runEvaluation } from "./engine/evaluator";
import type { EvaluationRequest, EvaluationReport } from "@/types/evaluation";
import { evalQueue } from "./jobs/queue";

const log = createLogger("da-eval-agent");
const MAX_ATTEMPTS = Number(process.env.EVAL_MAX_ATTEMPTS ?? 3);
const RETRY_BACKOFF_MS = [2_000, 8_000];

/** eval.run payload — contract: agents/contracts/eval.run.v1.json */
export interface EvalRunPayload {
  targetUrl: string;
  sourceType?: "pdf" | "webpage" | "none";
  sourceLocation?: string;
  dimensions?: string[];
  runId?: string;
  labels?: Record<string, string>;
}

export function extractPayload(message: Message): EvalRunPayload {
  for (const part of message.parts) {
    if (part.kind === "data") return part.data as unknown as EvalRunPayload;
    if (part.kind === "text") {
      try {
        return JSON.parse(part.text) as EvalRunPayload;
      } catch {
        /* not JSON — keep looking */
      }
    }
  }
  throw new Error("eval.run payload not found: send a data part (or JSON text part) matching eval.run.v1");
}

export function validatePayload(p: EvalRunPayload): void {
  if (!p.targetUrl || typeof p.targetUrl !== "string" || !/^https?:\/\//.test(p.targetUrl)) {
    throw new Error("eval.run.v1: 'targetUrl' (http/https URL) is required");
  }
  const sourceType = p.sourceType ?? "none";
  if (sourceType !== "none" && !p.sourceLocation) {
    throw new Error(`eval.run.v1: 'sourceLocation' is required when sourceType='${sourceType}'`);
  }
}

export function toEvaluationRequest(p: EvalRunPayload): EvaluationRequest {
  const sourceType = p.sourceType ?? "none";
  return {
    migratedUrl: p.targetUrl,
    expectedUrl: sourceType === "webpage" ? p.sourceLocation : undefined,
    pdfPath: sourceType === "pdf" ? p.sourceLocation : undefined,
  };
}

export function reportToArtifact(report: EvaluationReport): Artifact {
  const dimensionScores: Record<string, number> = {};
  for (const [dim, res] of Object.entries(report.results)) {
    if (res) dimensionScores[dim] = res.score;
  }
  return {
    artifactId: randomUUID(),
    name: "eval-report",
    parts: [
      {
        kind: "data",
        data: {
          overallScore: report.summary.overallScore,
          grade: report.summary.grade,
          dimensionScores,
          report: report as unknown as Record<string, unknown>,
        },
      },
    ],
  };
}

/** Persist the eval_reports row (Part-2 schema). task_id = our tasks-table row id. */
export async function writeEvalReport(db: StoreDb, a2aTaskId: string, report: EvaluationReport): Promise<void> {
  const row = await db.prepare("select id from tasks where a2a_task_id = ?").get<{ id: string }>(a2aTaskId);
  if (!row) {
    log.warn("eval_reports write skipped — no tasks row yet", { a2a_task_id: a2aTaskId });
    return;
  }
  const dimensionScores: Record<string, number> = {};
  for (const [dim, res] of Object.entries(report.results)) {
    if (res) dimensionScores[dim] = res.score;
  }
  await db.prepare(
    `insert into eval_reports (id, task_id, target_url, overall_score, dimension_scores, report)
     values (?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    row.id,
    report.request.migratedUrl,
    report.summary.overallScore,
    JSON.stringify(dimensionScores),
    JSON.stringify(report)
  );
}

/**
 * Uploads the visual screenshot to the artifact store (R2 or local stand-in) and
 * rewrites the report's `visual.metadata.screenshot` to a durable public URL —
 * mutates `report` in place so the persisted + emitted report carries the link,
 * and records an artifacts-table row. No-op when there's no screenshot on disk
 * (e.g. capture returned a placeholder). Best-effort: never fails the eval.
 */
async function persistScreenshot(
  db: StoreDb,
  store: ArtifactStore,
  a2aTaskId: string,
  report: EvaluationReport
): Promise<void> {
  const shot = report.results.visual?.metadata.screenshot;
  if (!shot?.absolutePath || !existsSync(shot.absolutePath)) return;
  try {
    const key = `screenshots/${basename(shot.absolutePath)}`;
    const url = await store.put({ key, body: readFileSync(shot.absolutePath), contentType: "image/png" });
    // rewrite to the durable URL; drop the machine-specific absolutePath
    report.results.visual!.metadata.screenshot = { path: key, url };
    await recordArtifact(db, { a2aTaskId, type: "screenshot", storagePath: key, metadata: { url } });
    log.info("screenshot stored", { a2a_task_id: a2aTaskId, storage: store.kind, url });
  } catch (err) {
    log.warn("screenshot upload failed — report keeps the local path", {
      a2a_task_id: a2aTaskId,
      error: String(err),
    });
  }
}

/** Run one evaluation with retry; emits A2A events via `publish`, persists the report row. */
export async function runEvalJob(opts: {
  db: StoreDb;
  store: ArtifactStore;
  taskId: string;
  contextId: string;
  payload: EvalRunPayload;
  publish: (event: TaskStatusUpdateEvent | TaskArtifactUpdateEvent) => void;
}): Promise<void> {
  const { db, store, taskId, contextId, payload, publish } = opts;

  const statusEvent = (state: "working" | "completed" | "failed", text?: string, final = false): TaskStatusUpdateEvent => ({
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

  // SSE keepalive: agentic passes can be silent for minutes, and quiet streams
  // get dropped crossing the Worker↔container hops on Cloudflare (M5). A
  // heartbeat keeps the coordinator's stream (and any UI subscriber) alive.
  const heartbeat = setInterval(() => publish(statusEvent("working", "evaluating…")), 45_000);

  let lastError: unknown;
  try {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      publish(statusEvent("working", attempt === 1 ? "evaluation started" : `retry ${attempt}/${MAX_ATTEMPTS}`));

      const report = await runEvaluation(toEvaluationRequest(payload), (event) => {
        // map engine progress → A2A status updates (replaces the old SSE vocabulary, PRD part-2)
        if (event.type === "agent-start" && event.dimension) {
          publish(statusEvent("working", `dimension ${event.dimension}: started`));
        } else if (event.type === "agent-complete" && event.dimension) {
          publish(
            statusEvent("working", `dimension ${event.dimension}: complete (score ${event.result?.score ?? "n/a"})`)
          );
        }
      });

      await persistScreenshot(db, store, taskId, report);
      await writeEvalReport(db, taskId, report);
      publish({ kind: "artifact-update", taskId, contextId, artifact: reportToArtifact(report) });
      publish(statusEvent("completed", undefined, true));
      log.info("eval.run completed", { a2a_task_id: taskId, overall: report.summary.overallScore });
      return;
    } catch (err) {
      lastError = err;
      log.warn("eval attempt failed", { a2a_task_id: taskId, attempt, error: String(err) });
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1] ?? 8_000));
      }
    }
  }
  publish(statusEvent("failed", `evaluation failed after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`, true));
  log.error("eval.run failed", { a2a_task_id: taskId, error: String(lastError) });
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Real executor: validate → Task(submitted) → enqueue → return. The A2A response
 * (message/send) returns immediately with the submitted task; message/stream
 * subscribers keep receiving events as the queued job runs (submit-and-detach,
 * PRD part-2 execution model).
 */
export function createEvalExecutor(db: StoreDb, store: ArtifactStore): AgentExecutor {
  return {
    async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
      const { taskId, contextId, userMessage } = ctx;

      let payload: EvalRunPayload;
      try {
        payload = extractPayload(userMessage);
        validatePayload(payload);
      } catch (err) {
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
          status: {
            state: "failed",
            timestamp: new Date().toISOString(),
            message: {
              kind: "message",
              messageId: randomUUID(),
              role: "agent",
              parts: [{ kind: "text", text: String(err) }],
              taskId,
              contextId,
            },
          },
          final: true,
        } satisfies TaskStatusUpdateEvent);
        bus.finished();
        return;
      }

      log.info("eval.run accepted", { a2a_task_id: taskId, context_id: contextId, targetUrl: payload.targetUrl });
      bus.publish({
        kind: "task",
        id: taskId,
        contextId,
        status: { state: "submitted", timestamp: new Date().toISOString() },
        history: [userMessage],
        metadata: { payload: payload as unknown as Record<string, unknown> },
      } satisfies Task);

      // Queue-wait keepalive: a task parked behind the eval queue emits nothing,
      // and quiet streams get dropped crossing the Worker↔container hops (M5).
      // runEvalJob has its own in-flight heartbeat; this covers the wait.
      const queueHeartbeat = setInterval(() => {
        bus.publish({
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
              parts: [{ kind: "text", text: "waiting in eval queue…" }],
              taskId,
              contextId,
            },
          },
          final: false,
        } satisfies TaskStatusUpdateEvent);
      }, 45_000);

      void evalQueue.add(async () => {
        clearInterval(queueHeartbeat);
        try {
          await runEvalJob({ db, store, taskId, contextId, payload, publish: (e) => bus.publish(e) });
        } finally {
          bus.finished();
        }
      });
    },

    async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
      // v1: best-effort — queued jobs aren't individually removable; mark canceled.
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
}
