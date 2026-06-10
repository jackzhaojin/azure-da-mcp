import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import type { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { meshClientFactory, createLogger, type StoreDb } from "@agents/a2a-common";
import PQueue from "p-queue";
import { randomUUID } from "node:crypto";

const log = createLogger("da-coordinator");
const EVAL_AGENT_URL = process.env.EVAL_AGENT_URL ?? "http://localhost:4001";
const CONTENT_GEN_URL = process.env.CONTENT_GEN_URL ?? "http://localhost:4002";
const MIGRATION_AGENT_URL = process.env.MIGRATION_AGENT_URL ?? "http://localhost:4003";
const FANOUT_CONCURRENCY = Number(process.env.COORD_FANOUT_CONCURRENCY ?? 2);
const PASS_THRESHOLD = 75; // matches the engine's passedDimensions rule (PRD part-2)

export type Stage = "generate" | "migrate" | "evaluate";

/** coordinate.run payload — contract: agents/contracts/coordinate.run.v1.json */
export interface CoordinateRunPayload {
  goal: "evaluate" | "migrate" | "generate+migrate" | "full-loop" | "auto";
  // evaluate route
  targets?: string[];
  alreadyMigratedUrl?: string;
  // generative routes
  topic?: string;
  legacyStyle?: "clean" | "dated" | "messy";
  // migrate route
  sourceLocation?: string;
  sourceType?: "pdf" | "webpage" | "none";
  site?: string;
  owner?: string;
  pageSlug?: string;
  backend?: string;
  fanOut?: number;
  labels?: Record<string, string>;
  /** SSO identity of the human who triggered the run (dashboard) → runs.user_email. */
  requestedBy?: string;
}

interface StageResult {
  stage: Stage;
  agent: string;
  taskId?: string;
  state: string;
  durationMs: number;
  error?: string;
}

interface BranchResult {
  branch: number;
  target?: string; // what was (or would be) evaluated
  sourceUrl?: string;
  evalTaskId?: string;
  state: string; // completed | failed
  overallScore?: number;
  dimensionScores?: Record<string, number>;
  confidence?: number; // migration confidence, when the route migrated
  stages: StageResult[];
  error?: string;
}

/**
 * Deterministic routing (PRD part-6 state table). `goal: auto` infers the route
 * from the request's state — the agentic LLM planner (M3) only replaces this
 * for genuinely ambiguous intents; the table stays as its fallback.
 */
export function resolveRoute(p: CoordinateRunPayload): Stage[] {
  switch (p.goal) {
    case "evaluate":
      return ["evaluate"];
    case "migrate":
      return ["migrate"];
    case "generate+migrate":
      return ["generate", "migrate"]; // stops without eval — no mandatory end
    case "full-loop":
      return ["generate", "migrate", "evaluate"];
    case "auto":
      if (p.alreadyMigratedUrl) return ["evaluate"]; // already migrated → just score it
      if (p.sourceLocation) return ["migrate", "evaluate"]; // source exists → skip generate
      if (p.topic) return ["generate", "migrate", "evaluate"]; // net-new → the full loop
      throw new Error("coordinate.run.v1: goal 'auto' needs alreadyMigratedUrl, sourceLocation, or topic to infer a route");
    default:
      throw new Error(`coordinate.run.v1: unknown goal '${p.goal as string}' — evaluate | migrate | generate+migrate | full-loop | auto`);
  }
}

export function validateForRoute(p: CoordinateRunPayload, route: Stage[]): void {
  const evaluateOnly = route.length === 1 && route[0] === "evaluate";
  if (evaluateOnly) {
    const targets = p.targets ?? (p.alreadyMigratedUrl ? [p.alreadyMigratedUrl] : []);
    if (!targets.length) throw new Error("coordinate.run.v1: evaluate route needs 'targets' (or 'alreadyMigratedUrl')");
    for (const t of targets) if (!/^https?:\/\//.test(t)) throw new Error(`coordinate.run.v1: invalid target '${t}'`);
  }
  if (route.includes("generate") && !p.topic) {
    throw new Error("coordinate.run.v1: generative routes need 'topic'");
  }
  if (route.includes("migrate") && !route.includes("generate") && !p.sourceLocation) {
    throw new Error("coordinate.run.v1: migrate route needs 'sourceLocation' (or a generate stage before it)");
  }
  if (p.fanOut !== undefined && (!Number.isInteger(p.fanOut) || p.fanOut < 1)) {
    throw new Error("coordinate.run.v1: 'fanOut' must be a positive integer");
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "page";
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
function summarize(xs: number[]) {
  return {
    mean: round2(mean(xs)),
    stddev: round2(stddev(xs)),
    min: xs.length ? Math.min(...xs) : 0,
    max: xs.length ? Math.max(...xs) : 0,
  };
}

/** Variance stats — the adaptTo() headline metric (PRD part-6). */
export function computeStats(branches: BranchResult[], route: Stage[]) {
  const completed = branches.filter((b) => b.state === "completed");
  const evalScores = completed.map((b) => b.overallScore).filter((s): s is number => typeof s === "number");
  const confidences = completed.map((b) => b.confidence).filter((c): c is number => typeof c === "number");

  const perDimension: Record<string, ReturnType<typeof summarize> & { n: number }> = {};
  const dims = new Set(completed.flatMap((b) => Object.keys(b.dimensionScores ?? {})));
  for (const dim of dims) {
    const scores = completed.map((b) => b.dimensionScores?.[dim]).filter((s): s is number => typeof s === "number");
    perDimension[dim] = { ...summarize(scores), n: scores.length };
  }

  return {
    route: route.join("→"),
    branches: branches.length,
    completed: completed.length,
    failed: branches.length - completed.length,
    overall: summarize(evalScores.length ? evalScores : confidences), // eval scores when the route evaluated, else migration confidence
    passRate: round2(
      evalScores.length
        ? evalScores.filter((s) => s >= PASS_THRESHOLD).length / evalScores.length
        : confidences.length
          ? confidences.filter((c) => c >= PASS_THRESHOLD).length / confidences.length
          : 0
    ),
    ...(confidences.length ? { migrationConfidence: summarize(confidences) } : {}),
    perDimension,
  };
}

/** Send one task to an agent and harvest its terminal state + first data artifact. */
async function callAgent(
  agentUrl: string,
  data: Record<string, unknown>,
  contextId: string,
  onNote?: (note: string) => void
): Promise<{ taskId?: string; state: string; artifact?: Record<string, never>; error?: string }> {
  try {
    const client = await meshClientFactory().createFromUrl(agentUrl);
    let taskId: string | undefined;
    let state = "unknown";
    let artifact: Record<string, never> | undefined;
    let failNote = "";
    for await (const event of client.sendMessageStream({
      message: { kind: "message", messageId: randomUUID(), role: "user", contextId, parts: [{ kind: "data", data }] },
    })) {
      if (event.kind === "task") taskId = event.id;
      if (event.kind === "status-update") {
        state = event.status.state;
        if (!event.final && state === "working") {
          // Forward child progress (e.g. the migration backend's "K2.6 → <tool>"
          // notes) — observability through the coordinator AND SSE keepalive for
          // our own callers during long quiet stages.
          const note = event.status.message?.parts.find((p) => p.kind === "text")?.text;
          if (note && onNote) onNote(note);
        }
        if (event.final && state === "failed") {
          failNote = event.status.message?.parts.find((p) => p.kind === "text")?.text ?? "";
        }
      }
      if (event.kind === "artifact-update") {
        const part = event.artifact.parts[0];
        if (part?.kind === "data") artifact = part.data as Record<string, never>;
      }
    }
    return { taskId, state, artifact, ...(failNote ? { error: failNote } : {}) };
  } catch (err) {
    return { state: "failed", error: String(err) };
  }
}

/** Run one branch through the route's stages, threading artifacts forward. */
async function runPipelineBranch(opts: {
  branch: number;
  route: Stage[];
  payload: CoordinateRunPayload;
  contextId: string;
  runId: string;
  target?: string; // evaluate-only routes: the page to score
  onStage: (note: string) => void;
}): Promise<BranchResult> {
  const { branch, route, payload, contextId, runId, target, onStage } = opts;
  const result: BranchResult = { branch, state: "completed", stages: [], target };
  let sourceUrl = payload.sourceLocation;
  let targetUrl = target ?? payload.alreadyMigratedUrl;

  for (const stage of route) {
    const t0 = Date.now();
    let call: Awaited<ReturnType<typeof callAgent>>;
    let agent = "";
    const forwardNote = (note: string) => onStage(`branch ${branch} · ${stage}: ${note}`);

    if (stage === "generate") {
      agent = "content-gen";
      call = await callAgent(
        CONTENT_GEN_URL,
        {
          skill: "content.synthesize-source",
          topic: payload.topic,
          legacyStyle: payload.legacyStyle ?? "dated",
          runId,
        },
        contextId,
        forwardNote
      );
      if (call.state === "completed") sourceUrl = (call.artifact as { sourceUrl?: string } | undefined)?.sourceUrl;
    } else if (stage === "migrate") {
      agent = "migration";
      call = await callAgent(
        MIGRATION_AGENT_URL,
        {
          sourceType: payload.sourceType === "pdf" ? "pdf" : "webpage",
          sourceLocation: sourceUrl,
          site: payload.site ?? "demo-site",
          owner: payload.owner ?? "jackzhaojin",
          pageSlug: `${payload.pageSlug ?? slugify(payload.topic ?? sourceUrl ?? "page")}-b${branch}`,
          folderPostfix: runId.slice(0, 8),
          ...(payload.backend ? { backend: payload.backend } : {}),
          runId,
        },
        contextId,
        forwardNote
      );
      if (call.state === "completed") {
        const a = call.artifact as { previewUrl?: string; confidence?: number } | undefined;
        targetUrl = a?.previewUrl;
        result.confidence = a?.confidence;
      }
    } else {
      agent = "eval";
      call = await callAgent(
        EVAL_AGENT_URL,
        {
          targetUrl,
          sourceType: sourceUrl ? "webpage" : (payload.sourceType ?? "none"),
          ...(sourceUrl ? { sourceLocation: sourceUrl } : {}),
          runId,
        },
        contextId,
        forwardNote
      );
      if (call.state === "completed") {
        const a = call.artifact as { overallScore?: number; dimensionScores?: Record<string, number> } | undefined;
        result.overallScore = a?.overallScore;
        result.dimensionScores = a?.dimensionScores;
        result.evalTaskId = call.taskId;
      }
    }

    result.stages.push({ stage, agent, taskId: call.taskId, state: call.state, durationMs: Date.now() - t0, ...(call.error ? { error: call.error } : {}) });
    onStage(`branch ${branch} · ${stage}: ${call.state}${call.error ? ` — ${call.error.slice(0, 120)}` : ""}`);

    if (call.state !== "completed") {
      result.state = "failed";
      result.error = call.error ?? `${stage} stage ${call.state}`;
      break; // failFast within the branch; other branches continue
    }
  }

  result.sourceUrl = sourceUrl;
  result.target = targetUrl ?? result.target;
  return result;
}

/**
 * coordinate.run executor — the intelligent content coordinator (PRD part-6).
 * Routes: evaluate | migrate | generate+migrate | full-loop | auto (deterministic
 * state-table routing; the LLM planner upgrades 'auto' at M3). Any subset, any
 * order, no mandatory start or end. Fans out branches at capped concurrency,
 * threads ONE contextId through every child task, aggregates variance stats.
 */
export function createCoordinateExecutor(db: StoreDb): AgentExecutor {
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

      bus.publish({
        kind: "task",
        id: taskId,
        contextId,
        status: { state: "submitted", timestamp: new Date().toISOString() },
        history: [userMessage],
      } satisfies Task);

      let payload: CoordinateRunPayload;
      let route: Stage[];
      try {
        const part = userMessage.parts.find((p) => p.kind === "data");
        if (!part) throw new Error("coordinate.run payload not found: send a data part matching coordinate.run.v1");
        payload = part.data as unknown as CoordinateRunPayload;
        route = resolveRoute(payload);
        validateForRoute(payload, route);
      } catch (err) {
        bus.publish(status("failed", String(err), true));
        bus.finished();
        return;
      }

      const fanOut = payload.fanOut ?? 1;
      const runId = randomUUID();
      await db.prepare("insert into runs (id, kind, config, status, context_id, user_email) values (?, ?, ?, 'running', ?, ?)").run(
        runId,
        route.length > 1 || route[0] !== "evaluate" ? "pipeline" : "eval-batch",
        JSON.stringify(payload),
        contextId,
        payload.requestedBy ?? null
      );

      // Live progress trail for the UI: every working-note (stage transitions +
      // forwarded child notes like "K2.6 → dalive_create_dalive_content") lands
      // on the run row as it happens. Capped so the row stays small.
      const progress: Array<{ ts: string; note: string }> = [];
      const persistNote = (note: string) => {
        progress.push({ ts: new Date().toISOString(), note });
        if (progress.length > 200) progress.splice(0, progress.length - 200);
        // best-effort fire-and-forget; never fail (or stall) the run over progress
        void db
          .prepare("update runs set progress = ? where id = ?")
          .run(JSON.stringify(progress), runId)
          .catch(() => {});
      };

      // evaluate-only fans out per target; pipeline routes fan out per fanOut
      const evaluateOnly = route.length === 1 && route[0] === "evaluate";
      const targets = evaluateOnly ? (payload.targets ?? [payload.alreadyMigratedUrl!]) : [undefined];
      const branches: Array<{ branch: number; target?: string }> = [];
      let n = 0;
      for (const target of targets) for (let i = 0; i < fanOut; i++) branches.push({ branch: ++n, target });

      log.info("coordinate.run started", { a2a_task_id: taskId, context_id: contextId, run_id: runId, route: route.join("→"), branches: branches.length });
      bus.publish(status("working", `run ${runId}: route ${route.join("→")} × ${branches.length} branches`));

      try {
        const queue = new PQueue({ concurrency: FANOUT_CONCURRENCY });
        const results = await Promise.all(
          branches.map(
            (b) =>
              queue.add(() =>
                runPipelineBranch({
                  branch: b.branch,
                  route,
                  payload,
                  contextId,
                  runId,
                  target: b.target,
                  onStage: (note) => {
                    bus.publish(status("working", note));
                    persistNote(note);
                  },
                })
              ) as Promise<BranchResult>
          )
        );

        const stats = computeStats(results, route);
        const runStatus = stats.failed === 0 ? "completed" : "completed_with_failures";
        // branchResults ride along in the stats JSON so the UI can render the
        // branch/stage grid from the store (the A2A artifact isn't persisted here).
        await db.prepare("update runs set status = ?, stats = ?, completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?").run(
          runStatus,
          JSON.stringify({ ...stats, branchResults: results }),
          runId
        );

        bus.publish({
          kind: "artifact-update",
          taskId,
          contextId,
          artifact: {
            artifactId: randomUUID(),
            name: "run-stats",
            parts: [{ kind: "data", data: { runId, ...stats, branchResults: results } as unknown as Record<string, unknown> }],
          },
        } satisfies TaskArtifactUpdateEvent);
        bus.publish(status("completed", undefined, true));
        log.info("coordinate.run completed", { a2a_task_id: taskId, run_id: runId, route: route.join("→"), ...stats.overall, failed: stats.failed });
      } catch (err) {
        await db.prepare("update runs set status = 'failed', completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?").run(runId);
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
