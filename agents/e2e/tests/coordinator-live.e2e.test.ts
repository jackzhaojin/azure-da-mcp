import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Task } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// Hardening sprint (2026-06-11): live run observability + failure visibility.
//   - runs.live: per-branch stage snapshots DURING a run (the dashboard's live
//     branch grid), cleared once final stats land
//   - runs.error: a failed run carries WHY — including the restart policy's
//     "interrupted by a coordinator restart" reason
interface LiveStage {
  stage: string;
  state: string;
}
interface LiveBranch {
  branch: number;
  state: string;
  stages: LiveStage[];
}
interface RunView {
  id: string;
  status: string;
  error: string | null;
  liveBranches: LiveBranch[] | null;
  stats: { branchResults?: unknown[] } | null;
}

function coordinateMessage(data: Record<string, unknown>) {
  return {
    kind: "message" as const,
    messageId: randomUUID(),
    role: "user" as const,
    parts: [{ kind: "data" as const, data }],
  };
}

async function getRun(coordinator: AgentHandle, query: string): Promise<RunView | null> {
  const res = await fetch(`${coordinator.url}/store/runs${query}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { run?: RunView | null; runs?: RunView[] };
  return body.run ?? body.runs?.[0] ?? null;
}

describe("coordinator: live branch snapshots + failure reasons", () => {
  let evalAgent: AgentHandle;
  let coordinator: AgentHandle;

  beforeAll(async () => {
    evalAgent = await startAgent("eval-service", 14201, { env: { EVAL_ENGINE: "stub" } });
    coordinator = await startAgent("coordinator", 14202, {
      env: { EVAL_AGENT_URL: evalAgent.url, COORDINATOR_UI: "off" },
    });
  });

  afterAll(async () => {
    await Promise.all([stopAgent(evalAgent), stopAgent(coordinator)]);
  });

  it("exposes runs.live stage snapshots while running, then clears them for stats.branchResults", async () => {
    const client = await new ClientFactory().createFromUrl(coordinator.url);
    const submitted = (await client.sendMessage({
      message: coordinateMessage({
        goal: "evaluate",
        targets: ["https://example.com/live-a", "https://example.com/live-b"],
        fanOut: 1,
      }),
      configuration: { blocking: false },
    })) as Task;
    const contextId = submitted.contextId;

    // sample the store while the run executes (stub evals take ~750ms each)
    const sawWorkingStage: LiveBranch[][] = [];
    let run: RunView | null = null;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      run = await getRun(coordinator, `?contextId=${encodeURIComponent(contextId)}`);
      if (run?.liveBranches?.some((b) => b.stages.some((s) => s.state === "working"))) {
        sawWorkingStage.push(run.liveBranches);
      }
      if (run && run.status !== "running") break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // live snapshots were visible mid-run with an in-flight evaluate stage
    expect(sawWorkingStage.length).toBeGreaterThan(0);
    const snapshot = sawWorkingStage[0];
    expect(snapshot.some((b) => b.stages.some((s) => s.stage === "evaluate" && s.state === "working"))).toBe(true);

    // after completion: live cleared, durable branchResults in stats
    expect(run!.status).toBe("completed");
    const detail = await getRun(coordinator, `/${run!.id}`);
    expect(detail!.liveBranches).toBeNull();
    expect(detail!.stats?.branchResults).toHaveLength(2);
    expect(detail!.error).toBeNull();
  }, 30_000);

  it("a coordinator restart marks interrupted runs failed WITH a reason (runs.error)", async () => {
    const dbPath = coordinator.dbPath;
    const client = await new ClientFactory().createFromUrl(coordinator.url);
    const submitted = (await client.sendMessage({
      message: coordinateMessage({
        goal: "evaluate",
        targets: [
          "https://example.com/restart-a",
          "https://example.com/restart-b",
          "https://example.com/restart-c",
          "https://example.com/restart-d",
        ],
        fanOut: 1,
      }),
      configuration: { blocking: false },
    })) as Task;
    const contextId = submitted.contextId;

    // wait until the runs row exists and is running, then kill mid-fan-out
    let runId: string | undefined;
    const t0 = Date.now();
    while (!runId && Date.now() - t0 < 10_000) {
      const run = await getRun(coordinator, `?contextId=${encodeURIComponent(contextId)}`);
      if (run?.status === "running") runId = run.id;
      else await new Promise((r) => setTimeout(r, 50));
    }
    expect(runId).toBeTruthy();
    await stopAgent(coordinator);

    // same store, new process: the restart policy must fail the run cleanly with a reason
    coordinator = await startAgent("coordinator", 14202, {
      dbPath,
      env: { EVAL_AGENT_URL: evalAgent.url, COORDINATOR_UI: "off" },
    });
    const run = await getRun(coordinator, `/${runId}`);
    expect(run!.status).toBe("failed");
    expect(run!.error).toContain("interrupted by a coordinator restart");
    expect(run!.liveBranches).toBeNull();
  }, 60_000);
});
