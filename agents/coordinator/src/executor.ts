import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, Message } from "@a2a-js/sdk";
import type { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import type Database from "better-sqlite3";
import { meshClientFactory, createLogger } from "@agents/a2a-common";
import PQueue from "p-queue";
import { randomUUID } from "node:crypto";

const log = createLogger("da-coordinator");
const EVAL_AGENT_URL = process.env.EVAL_AGENT_URL ?? "http://localhost:4001";
const FANOUT_CONCURRENCY = Number(process.env.COORD_FANOUT_CONCURRENCY ?? 2);
const PASS_THRESHOLD = 75; // matches the engine's passedDimensions rule (PRD part-2)

/** coordinate.run payload — contract: agents/contracts/coordinate.run.v1.json */
export interface CoordinateRunPayload {
  goal: "evaluate";
  targets: string[];
  fanOut?: number;
  sourceType?: "pdf" | "webpage" | "none";
  sourceLocation?: string;
  labels?: Record<string, string>;
}

interface BranchResult {
  branch: number;
  target: string;
  evalTaskId?: string;
  state: string;
  overallScore?: number;
  dimensionScores?: Record<string, number>;
  error?: string;
}

function extractPayload(message: Message): CoordinateRunPayload {
  for (const part of message.parts) {
    if (part.kind === "data") return part.data as unknown as CoordinateRunPayload;
    if (part.kind === "text") {
      try {
        return JSON.parse(part.text) as CoordinateRunPayload;
      } catch {
        /* keep looking */
      }
    }
  }
  throw new Error("coordinate.run payload not found: send a data part matching coordinate.run.v1");
}

function validate(p: CoordinateRunPayload): void {
  if (p.goal !== "evaluate") throw new Error("coordinate.run.v1 (M2): only goal='evaluate' is supported");
  if (!Array.isArray(p.targets) || p.targets.length === 0) throw new Error("coordinate.run.v1: 'targets' must be a non-empty URL array");
  for (const t of p.targets) {
    if (typeof t !== "string" || !/^https?:\/\//.test(t)) throw new Error(`coordinate.run.v1: invalid target '${t}'`);
  }
  if (p.fanOut !== undefined && (!Number.isInteger(p.fanOut) || p.fanOut < 1)) {
    throw new Error("coordinate.run.v1: 'fanOut' must be a positive integer");
  }
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Variance stats — the adaptTo() headline metric (PRD part-6). */
export function computeStats(branches: BranchResult[]) {
  const completed = branches.filter((b) => b.state === "completed" && typeof b.overallScore === "number");
  const overallScores = completed.map((b) => b.overallScore!);
  const perDimension: Record<string, { mean: number; stddev: number; min: number; max: number; n: number }> = {};
  for (const b of completed) {
    for (const [dim, score] of Object.entries(b.dimensionScores ?? {})) {
      (perDimension[dim] ??= { mean: 0, stddev: 0, min: 0, max: 0, n: 0 });
    }
  }
  for (const dim of Object.keys(perDimension)) {
    const scores = completed.map((b) => b.dimensionScores?.[dim]).filter((s): s is number => typeof s === "number");
    perDimension[dim] = {
      mean: round2(mean(scores)),
      stddev: round2(stddev(scores)),
      min: Math.min(...scores),
      max: Math.max(...scores),
      n: scores.length,
    };
  }
  return {
    branches: branches.length,
    completed: completed.length,
    failed: branches.length - completed.length,
    overall: {
      mean: round2(mean(overallScores)),
      stddev: round2(stddev(overallScores)),
      min: overallScores.length ? Math.min(...overallScores) : 0,
      max: overallScores.length ? Math.max(...overallScores) : 0,
    },
    passRate: round2(completed.length ? overallScores.filter((s) => s >= PASS_THRESHOLD).length / overallScores.length : 0),
    perDimension,
  };
}

/** Run one eval.run child task and harvest its terminal state + artifact. */
async function runBranch(
  branch: number,
  target: string,
  contextId: string,
  payload: CoordinateRunPayload,
  runId: string
): Promise<BranchResult> {
  try {
    const client = await meshClientFactory().createFromUrl(EVAL_AGENT_URL);
    let evalTaskId: string | undefined;
    let state = "unknown";
    let artifactData: { overallScore?: number; dimensionScores?: Record<string, number> } | undefined;

    const stream = client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        contextId, // thread the pipeline: children share the coordinate task's contextId
        parts: [
          {
            kind: "data",
            data: {
              targetUrl: target,
              sourceType: payload.sourceType ?? "none",
              ...(payload.sourceLocation ? { sourceLocation: payload.sourceLocation } : {}),
              runId,
            },
          },
        ],
      },
    });

    for await (const event of stream) {
      if (event.kind === "task") evalTaskId = event.id;
      if (event.kind === "status-update") state = event.status.state;
      if (event.kind === "artifact-update") {
        const part = event.artifact.parts[0];
        if (part?.kind === "data") artifactData = part.data as typeof artifactData;
      }
    }
    return {
      branch,
      target,
      evalTaskId,
      state,
      overallScore: artifactData?.overallScore as number | undefined,
      dimensionScores: artifactData?.dimensionScores,
    };
  } catch (err) {
    return { branch, target, state: "failed", error: String(err) };
  }
}

/**
 * coordinate.run executor (M2: eval-only batch). Writes the runs row, fans out
 * target × fanOut eval.run children (concurrency-capped), aggregates variance
 * stats, completes with a run-stats artifact. Coordinator is an A2A client AND
 * server (PRD part-6).
 */
export function createCoordinateExecutor(db: Database.Database): AgentExecutor {
  return {
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

      let payload: CoordinateRunPayload;
      bus.publish({
        kind: "task",
        id: taskId,
        contextId,
        status: { state: "submitted", timestamp: new Date().toISOString() },
        history: [userMessage],
      } satisfies Task);
      try {
        payload = extractPayload(userMessage);
        validate(payload);
      } catch (err) {
        bus.publish(status("failed", String(err), true));
        bus.finished();
        return;
      }

      const fanOut = payload.fanOut ?? 1;
      const runId = randomUUID();
      db.prepare("insert into runs (id, kind, config, status) values (?, 'eval-batch', ?, 'running')").run(
        runId,
        JSON.stringify(payload)
      );
      log.info("coordinate.run started", {
        a2a_task_id: taskId,
        context_id: contextId,
        run_id: runId,
        targets: payload.targets.length,
        fanOut,
      });

      const branches: Array<{ branch: number; target: string }> = [];
      let n = 0;
      for (const target of payload.targets) for (let i = 0; i < fanOut; i++) branches.push({ branch: ++n, target });

      bus.publish(status("working", `run ${runId}: ${branches.length} branches (${payload.targets.length} targets × ${fanOut})`));

      try {
        const queue = new PQueue({ concurrency: FANOUT_CONCURRENCY });
        const results = await Promise.all(
          branches.map((b) =>
            queue.add(async () => {
              const result = await runBranch(b.branch, b.target, contextId, payload, runId);
              bus.publish(
                status(
                  "working",
                  `branch ${result.branch}/${branches.length}: ${result.state}` +
                    (result.overallScore !== undefined ? ` (score ${result.overallScore})` : "") +
                    ` — ${result.target}`
                )
              );
              return result;
            }) as Promise<BranchResult>
          )
        );

        const stats = computeStats(results);
        const runStatus = stats.failed === 0 ? "completed" : "completed_with_failures";
        db.prepare(
          "update runs set status = ?, stats = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?"
        ).run(runStatus, JSON.stringify(stats), runId);

        bus.publish({
          kind: "artifact-update",
          taskId,
          contextId,
          artifact: {
            artifactId: randomUUID(),
            name: "run-stats",
            parts: [
              {
                kind: "data",
                data: { runId, ...stats, branchResults: results } as unknown as Record<string, unknown>,
              },
            ],
          },
        } satisfies TaskArtifactUpdateEvent);
        bus.publish(status("completed", undefined, true));
        log.info("coordinate.run completed", { a2a_task_id: taskId, run_id: runId, ...stats.overall, failed: stats.failed });
      } catch (err) {
        db.prepare("update runs set status = 'failed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?").run(runId);
        bus.publish(status("failed", String(err), true));
        log.error("coordinate.run failed", { a2a_task_id: taskId, run_id: runId, error: String(err) });
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
}
