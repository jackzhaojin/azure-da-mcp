import { type StoreDb } from "@agents/a2a-common";
import PQueue from "p-queue";
import { randomUUID } from "node:crypto";
import { callAgent, computeStats, type BranchResult } from "./executor.ts";

/**
 * The deterministic lane: address the EVAL AGENT DIRECTLY (not via coordinate.run's
 * generate→migrate→evaluate routing). This is the decoupling demo — any agent in
 * the mesh is independently callable — recorded in the SAME source-of-truth store
 * so it shows up alongside orchestrated runs and renders through the identical
 * RunDetail branch grid + evidence panel. fanOut repeats the same eval for variance.
 */

const EVAL_AGENT_URL = process.env.EVAL_AGENT_URL ?? "http://localhost:4001";
const FANOUT_CONCURRENCY = Number(process.env.COORD_FANOUT_CONCURRENCY ?? 2);

export interface EvalDirectPayload {
  targetUrl: string;
  sourceType?: "pdf" | "webpage" | "none";
  sourceLocation?: string;
  dimensions?: string[];
  fanOut?: number;
  batchId?: string;
  requestedBy?: string;
}

export function validateEvalDirect(p: EvalDirectPayload): void {
  if (!p.targetUrl || typeof p.targetUrl !== "string" || !/^https?:\/\//.test(p.targetUrl)) {
    throw new Error("eval-direct: 'targetUrl' (http/https URL) is required");
  }
  const sourceType = p.sourceType ?? "none";
  if (sourceType !== "none" && !p.sourceLocation) {
    throw new Error(`eval-direct: 'sourceLocation' is required when sourceType='${sourceType}'`);
  }
  if (p.fanOut !== undefined && (!Number.isInteger(p.fanOut) || p.fanOut < 1)) {
    throw new Error("eval-direct: 'fanOut' must be a positive integer");
  }
  if (p.dimensions && (!Array.isArray(p.dimensions) || p.dimensions.length === 0)) {
    throw new Error("eval-direct: 'dimensions' must be a non-empty array when provided");
  }
}

/** Run one direct eval branch against the eval agent. Mirrors the executor's evaluate stage. */
async function runEvalBranch(opts: {
  branch: number;
  payload: EvalDirectPayload;
  contextId: string;
  runId: string;
  onStage: (note: string) => void;
  onUpdate: (snapshot: BranchResult) => void;
}): Promise<BranchResult> {
  const { branch, payload, contextId, runId, onStage, onUpdate } = opts;
  const result: BranchResult = { branch, target: payload.targetUrl, state: "running", stages: [] };
  result.stages.push({ stage: "evaluate", agent: "eval", state: "working", durationMs: 0 });
  onUpdate({ ...result, stages: [...result.stages] });

  const t0 = Date.now();
  const sourceType = payload.sourceType ?? "none";
  const call = await callAgent(
    EVAL_AGENT_URL,
    {
      targetUrl: payload.targetUrl,
      sourceType,
      ...(sourceType !== "none" && payload.sourceLocation ? { sourceLocation: payload.sourceLocation } : {}),
      ...(payload.dimensions?.length ? { dimensions: payload.dimensions } : {}),
      runId,
    },
    contextId,
    (note) => onStage(`branch ${branch} · evaluate: ${note}`)
  );

  if (call.state === "completed") {
    const a = call.artifact as { overallScore?: number; dimensionScores?: Record<string, number> } | undefined;
    result.overallScore = a?.overallScore;
    result.dimensionScores = a?.dimensionScores;
    result.evalTaskId = call.taskId;
  }
  result.stages[0] = {
    stage: "evaluate",
    agent: "eval",
    taskId: call.taskId,
    state: call.state,
    durationMs: Date.now() - t0,
    ...(call.error ? { error: call.error } : {}),
  };
  onStage(`branch ${branch} · evaluate: ${call.state}${call.error ? ` — ${call.error.slice(0, 120)}` : ""}`);
  result.state = call.state === "completed" ? "completed" : "failed";
  if (call.state !== "completed") result.error = call.error ?? `evaluate stage ${call.state}`;
  onUpdate({ ...result, stages: [...result.stages] });
  return result;
}

/**
 * Insert an `eval-direct` run, fan out branches against the eval agent directly,
 * aggregate variance, persist. Returns the runId immediately; the eval itself runs
 * detached (submit-and-detach), exactly like coordinate.run. Progress + live
 * snapshots land on the run row so the dashboard renders it live.
 */
export async function runDirectEval(db: StoreDb, payload: EvalDirectPayload): Promise<string> {
  validateEvalDirect(payload);
  const runId = randomUUID();
  const contextId = randomUUID();
  const fanOut = Math.max(1, payload.fanOut ?? 1);
  // config carries `targets` so the dashboard's existing label logic shows the URL,
  // and `goal: eval-direct` marks the lane.
  const config = {
    goal: "eval-direct",
    targetUrl: payload.targetUrl,
    targets: [payload.targetUrl],
    sourceType: payload.sourceType ?? "none",
    ...(payload.sourceLocation ? { sourceLocation: payload.sourceLocation } : {}),
    ...(payload.dimensions?.length ? { dimensions: payload.dimensions } : {}),
    fanOut,
  };
  await db
    .prepare("insert into runs (id, kind, config, status, context_id, user_email, batch_id) values (?, ?, ?, 'running', ?, ?, ?)")
    .run(runId, "eval-direct", JSON.stringify(config), contextId, payload.requestedBy ?? null, payload.batchId ?? null);

  const progress: Array<{ ts: string; note: string }> = [];
  const persistNote = (note: string) => {
    progress.push({ ts: new Date().toISOString(), note });
    if (progress.length > 200) progress.splice(0, progress.length - 200);
    void db.prepare("update runs set progress = ? where id = ?").run(JSON.stringify(progress), runId).catch(() => {});
  };
  const liveBranches = new Map<number, BranchResult>();
  const persistLive = (snapshot: BranchResult) => {
    liveBranches.set(snapshot.branch, snapshot);
    const ordered = [...liveBranches.values()].sort((a, b) => a.branch - b.branch);
    void db.prepare("update runs set live = ? where id = ?").run(JSON.stringify(ordered), runId).catch(() => {});
  };

  // Detach: run the eval(s) in the background, return the runId now.
  void (async () => {
    persistNote(`eval-direct: ${payload.targetUrl} × ${fanOut} branch(es)${payload.dimensions?.length ? ` · dims ${payload.dimensions.join(",")}` : ""}`);
    try {
      const queue = new PQueue({ concurrency: FANOUT_CONCURRENCY });
      const results = await Promise.all(
        Array.from({ length: fanOut }, (_, i) =>
          queue.add(() =>
            runEvalBranch({
              branch: i + 1,
              payload,
              contextId,
              runId,
              onStage: persistNote,
              onUpdate: persistLive,
            })
          ) as Promise<BranchResult>
        )
      );
      const stats = computeStats(results, ["evaluate"]);
      const runStatus = stats.failed === 0 ? "completed" : "completed_with_failures";
      await db
        .prepare("update runs set status = ?, stats = ?, live = null, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?")
        .run(runStatus, JSON.stringify({ ...stats, branchResults: results }), runId);
    } catch (err) {
      await db
        .prepare("update runs set status = 'failed', error = ?, live = null, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?")
        .run(String(err).slice(0, 2000), runId);
    }
  })();

  return runId;
}
