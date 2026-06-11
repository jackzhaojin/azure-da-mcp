import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

interface RunStats {
  runId: string;
  branches: number;
  completed: number;
  failed: number;
  overall: { mean: number; stddev: number; min: number; max: number };
  passRate: number;
  perDimension: Record<string, { mean: number; stddev: number; min: number; max: number; n: number }>;
  branchResults: Array<{ branch: number; target: string; evalTaskId?: string; state: string; overallScore?: number }>;
}

// The M2 exit criterion: an eval-only batch submitted via coordinate.run.
// Coordinator (A2A client AND server) fans out target×fanOut eval.run children,
// threads ONE contextId through the pipeline, aggregates variance stats, and
// records the run in its own store.
describe("coordinator: eval-only batch via coordinate.run", () => {
  let evalAgent: AgentHandle;
  let coordinator: AgentHandle;

  beforeAll(async () => {
    evalAgent = await startAgent("eval-service", 14081, { env: { EVAL_ENGINE: "stub" } });
    coordinator = await startAgent("coordinator", 14082, {
      env: { EVAL_AGENT_URL: evalAgent.url },
    });
  });

  afterAll(async () => {
    await Promise.all([stopAgent(evalAgent), stopAgent(coordinator)]);
  });

  it("runs 3 targets × fanOut 2 = 6 branches and aggregates variance stats", async () => {
    const targets = [
      "https://example.com/page-a",
      "https://example.com/page-b",
      "https://example.com/page-c",
    ];
    const client = await new ClientFactory().createFromUrl(coordinator.url);

    let coordTaskId = "";
    let coordContextId = "";
    let finalState = "";
    let stats: RunStats | undefined;
    const progressNotes: string[] = [];

    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "data", data: { goal: "evaluate", targets, fanOut: 2 } }],
      },
    })) {
      if (event.kind === "task") {
        coordTaskId = (event as Task).id;
        coordContextId = (event as Task).contextId;
      } else if (event.kind === "status-update") {
        const e = event as TaskStatusUpdateEvent;
        const note = e.status.message?.parts.find((p) => p.kind === "text")?.text;
        if (note) progressNotes.push(note);
        if (e.final) finalState = e.status.state;
      } else if (event.kind === "artifact-update") {
        const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
        if (part?.kind === "data") stats = part.data as unknown as RunStats;
      }
    }

    // lifecycle + per-branch progress streamed. The coordinator forwards child
    // working-notes too (observability + SSE keepalive), so count terminal
    // stage notes specifically — exactly one per branch.
    expect(finalState).toBe("completed");
    expect(progressNotes.some((n) => n.includes("6 branches"))).toBe(true);
    expect(progressNotes.filter((n) => /^branch \d+ · evaluate: (completed|failed)/.test(n)).length).toBe(6);

    // variance stats — the adaptTo() headline metric
    expect(stats).toBeTruthy();
    expect(stats!.branches).toBe(6);
    expect(stats!.completed).toBe(6);
    expect(stats!.failed).toBe(0);
    expect(stats!.passRate).toBeGreaterThanOrEqual(0);
    for (const dim of ["structure", "accessibility", "content", "visual"]) {
      const d = stats!.perDimension[dim];
      expect(d.n).toBe(6);
      expect(d.stddev).toBeGreaterThanOrEqual(0);
      expect(d.min).toBeLessThanOrEqual(d.max);
      expect(d.mean).toBeGreaterThanOrEqual(d.min);
      expect(d.mean).toBeLessThanOrEqual(d.max);
    }

    // runs row in the coordinator's OWN store
    const coordDb = new Database(coordinator.dbPath, { readonly: true });
    const run = coordDb
      .prepare("select kind, status, stats, completed_at from runs where id = ?")
      .get(stats!.runId) as { kind: string; status: string; stats: string; completed_at: string };
    coordDb.close();
    expect(run.kind).toBe("eval-batch");
    expect(run.status).toBe("completed");
    expect(run.completed_at).toBeTruthy();
    expect((JSON.parse(run.stats) as RunStats).branches).toBe(6);

    // contextId threading: all 6 children share the coordinate task's contextId
    const evalDb = new Database(evalAgent.dbPath, { readonly: true });
    const children = evalDb
      .prepare("select count(*) as n from tasks where agent = 'da-eval-agent' and context_id = ?")
      .get(coordContextId) as { n: number };
    evalDb.close();
    expect(children.n).toBe(6);
    expect(coordTaskId).toBeTruthy();
  }, 60_000);

  it("serves domain reads at GET /store/runs and /store/runs/:id (the dashboard's data path)", async () => {
    // spawned agents get a sanitized env (helpers/mesh.ts), so this coordinator
    // always runs in open mode; the token-gated path has its own suite below
    const listRes = await fetch(`${coordinator.url}/store/runs`);
    expect(listRes.status).toBe(200);
    const { runs } = (await listRes.json()) as { runs: Array<{ id: string; kind: string; status: string; stats: RunStats | null }> };
    const batch = runs.find((r) => r.kind === "eval-batch" && r.status === "completed");
    expect(batch).toBeTruthy();
    expect(batch!.stats!.branches).toBe(6);
    // list view stays light — no branchResults
    expect((batch!.stats as unknown as Record<string, unknown>).branchResults).toBeUndefined();

    const detailRes = await fetch(`${coordinator.url}/store/runs/${batch!.id}`);
    expect(detailRes.status).toBe(200);
    const { run } = (await detailRes.json()) as {
      run: { id: string; a2aTaskId: string | null; stats: RunStats; contextId: string };
    };
    expect(run.stats.branchResults).toHaveLength(6);
    expect(run.a2aTaskId).toBeTruthy(); // joinable to tasks/get / tasks/resubscribe
    expect(run.contextId).toBeTruthy();

    const missing = await fetch(`${coordinator.url}/store/runs/not-a-run`);
    expect(missing.status).toBe(404);
  });

  it("fails cleanly on an invalid payload (unsupported goal)", async () => {
    const client = await new ClientFactory().createFromUrl(coordinator.url);
    let finalState = "";
    let note = "";
    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "data", data: { goal: "world-domination", targets: ["https://example.com"] } }],
      },
    })) {
      if (event.kind === "status-update" && event.final) {
        finalState = event.status.state;
        note = event.status.message?.parts.find((p) => p.kind === "text")?.text ?? "";
      }
    }
    expect(finalState).toBe("failed");
    expect(note).toContain("unknown goal"); // route engine lists the valid routes
  });
});

// /store/runs is edge-token gated when one is configured (mirrors /hooks).
// Explicit gated spawn — never dependent on what the invoking shell exports.
describe("coordinator: /store reads honor the edge token gate", () => {
  const EDGE = "edge-secret-store";
  let coordinator: AgentHandle;

  beforeAll(async () => {
    coordinator = await startAgent("coordinator", 14083, {
      env: { A2A_EDGE_TOKEN: EDGE, COORDINATOR_UI: "off" },
    });
  });

  afterAll(async () => {
    await stopAgent(coordinator);
  });

  it("401 without a bearer, 200 with it", async () => {
    const denied = await fetch(`${coordinator.url}/store/runs`);
    expect(denied.status).toBe(401);

    const ok = await fetch(`${coordinator.url}/store/runs`, {
      headers: { Authorization: `Bearer ${EDGE}` },
    });
    expect(ok.status).toBe(200);
    const { runs } = (await ok.json()) as { runs: unknown[] };
    expect(Array.isArray(runs)).toBe(true);
  });
});
