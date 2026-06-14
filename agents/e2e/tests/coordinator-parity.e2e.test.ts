import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// v1.0 UI parity surface (2026-06-14): the two NEW coordinator store endpoints
// behind the dashboard's bulk + direct-eval lanes.
//   - POST /store/eval-direct → addresses the eval agent DIRECTLY (not coordinate.run),
//     records an `eval-direct` run that renders through the same branch grid.
//   - GET  /store/runs?batchId= → groups the N runs one bulk submission fired.
// Stub eval engine — fast, deterministic; pins the wiring, not the scoring.

interface RunView {
  id: string;
  kind: string;
  status: string;
  batchId?: string | null;
  config: { goal?: string; dimensions?: string[]; targets?: string[] };
  stats: { route?: string; branchResults?: Array<{ overallScore?: number; dimensionScores?: Record<string, number>; evalTaskId?: string }> } | null;
}

async function pollRun(base: string, id: string, timeoutMs = 30_000): Promise<RunView> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await fetch(`${base}/store/runs/${id}`);
    if (res.status === 200) {
      const { run } = (await res.json()) as { run: RunView };
      if (run.status !== "running") return run;
    }
    if (Date.now() > deadline) throw new Error(`run ${id} did not reach a terminal state in ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

describe("coordinator: v1.0 parity store endpoints", () => {
  let evalAgent: AgentHandle;
  let coordinator: AgentHandle;

  beforeAll(async () => {
    evalAgent = await startAgent("eval-service", 14091, { env: { EVAL_ENGINE: "stub" } });
    coordinator = await startAgent("coordinator", 14092, {
      env: { EVAL_AGENT_URL: evalAgent.url, COORDINATOR_UI: "off" },
    });
  });

  afterAll(async () => {
    await Promise.all([stopAgent(evalAgent), stopAgent(coordinator)]);
  });

  it("POST /store/eval-direct addresses the eval agent directly and records an eval-direct run", async () => {
    const res = await fetch(`${coordinator.url}/store/eval-direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl: "https://example.com", sourceType: "none", dimensions: ["structure", "accessibility"] }),
    });
    expect(res.status).toBe(202);
    const { runId } = (await res.json()) as { runId: string };
    expect(runId).toBeTruthy();

    const run = await pollRun(coordinator.url, runId);
    expect(run.kind).toBe("eval-direct");
    expect(run.status).toBe("completed");
    expect(run.stats?.route).toBe("evaluate");
    // the dimensions subset is captured on the run config (engine honors it live)
    expect(run.config.dimensions).toEqual(["structure", "accessibility"]);
    // renders through the same branch grid + evidence panel as orchestrated runs
    const branch = run.stats?.branchResults?.[0];
    expect(branch?.overallScore).toBeGreaterThanOrEqual(0);
    expect(branch?.evalTaskId).toBeTruthy();
    expect(branch?.dimensionScores).toBeTruthy();
  }, 40_000);

  it("rejects an invalid eval-direct payload (no targetUrl)", async () => {
    const res = await fetch(`${coordinator.url}/store/eval-direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceType: "none" }),
    });
    expect(res.status).toBe(400);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain("targetUrl");
  });

  it("GET /store/runs?batchId= groups the runs a bulk submission fired", async () => {
    const batchId = randomUUID();
    const client = await new ClientFactory().createFromUrl(coordinator.url);
    // fire two evaluate items sharing one batchId (what BulkRunCard does per item)
    for (const target of ["https://example.com/a", "https://example.com/b"]) {
      for await (const event of client.sendMessageStream({
        message: {
          kind: "message",
          messageId: randomUUID(),
          role: "user",
          parts: [{ kind: "data", data: { goal: "evaluate", targets: [target], fanOut: 1, batchId } }],
        },
      })) {
        if (event.kind === "status-update" && event.status.state === "completed" && event.final) break;
      }
    }

    const res = await fetch(`${coordinator.url}/store/runs?batchId=${encodeURIComponent(batchId)}`);
    expect(res.status).toBe(200);
    const { runs } = (await res.json()) as { runs: RunView[] };
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      expect(r.batchId).toBe(batchId);
      expect(r.config.goal).toBe("evaluate");
    }
    // an unknown batchId returns an empty set, not everything
    const empty = await fetch(`${coordinator.url}/store/runs?batchId=${randomUUID()}`);
    const { runs: none } = (await empty.json()) as { runs: RunView[] };
    expect(none).toHaveLength(0);
  }, 40_000);
});
