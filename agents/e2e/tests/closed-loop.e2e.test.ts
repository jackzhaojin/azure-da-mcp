import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

interface PipelineStats {
  runId: string;
  route: string;
  branches: number;
  completed: number;
  failed: number;
  overall: { mean: number; stddev: number };
  passRate: number;
  migrationConfidence?: { mean: number };
  perDimension: Record<string, { n: number }>;
  branchResults: Array<{
    branch: number;
    state: string;
    sourceUrl?: string;
    target?: string;
    evalTaskId?: string;
    confidence?: number;
    overallScore?: number;
    stages: Array<{ stage: string; agent: string; state: string; taskId?: string }>;
  }>;
}

async function coordinate(url: string, data: Record<string, unknown>) {
  const client = await new ClientFactory().createFromUrl(url);
  let contextId = "";
  let finalState = "";
  let finalNote = "";
  let stats: PipelineStats | undefined;
  for await (const event of client.sendMessageStream({
    message: { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] },
  })) {
    if (event.kind === "task") contextId = event.contextId;
    if (event.kind === "status-update" && (event as TaskStatusUpdateEvent).final) {
      finalState = event.status.state;
      finalNote = event.status.message?.parts.find((p) => p.kind === "text")?.text ?? "";
    }
    if (event.kind === "artifact-update") {
      const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
      if (part?.kind === "data") stats = part.data as unknown as PipelineStats;
    }
  }
  return { contextId, finalState, finalNote, stats };
}

function contextTaskCount(dbPath: string, contextId: string): number {
  const db = new Database(dbPath, { readonly: true });
  try {
    return (db.prepare("select count(*) as n from tasks where context_id = ?").get(contextId) as { n: number }).n;
  } finally {
    db.close();
  }
}

function runRow(dbPath: string, contextId: string): { config: string; status: string } | undefined {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db.prepare("select config, status from runs where context_id = ?").get(contextId) as
      | { config: string; status: string }
      | undefined;
  } finally {
    db.close();
  }
}

// THE CLOSED LOOP (PRD part-6, M3 exit criteria): the coordinator demonstrates
// ≥3 distinct routes including a non-eval-terminating one, with one contextId
// threading every child task across all four agents.
describe("closed loop: routed pipelines via coordinate.run", () => {
  let evalAgent: AgentHandle;
  let contentGen: AgentHandle;
  let migration: AgentHandle;
  let coordinator: AgentHandle;

  beforeAll(async () => {
    [evalAgent, contentGen, migration] = await Promise.all([
      startAgent("eval-service", 14131, { env: { EVAL_ENGINE: "stub" } }),
      startAgent("content-gen", 14132),
      startAgent("migration-agent", 14133),
    ]);
    coordinator = await startAgent("coordinator", 14134, {
      env: {
        EVAL_AGENT_URL: evalAgent.url,
        CONTENT_GEN_URL: contentGen.url,
        MIGRATION_AGENT_URL: migration.url,
      },
    });
  });

  afterAll(async () => {
    await Promise.all([stopAgent(evalAgent), stopAgent(contentGen), stopAgent(migration), stopAgent(coordinator)]);
  });

  it("full-loop: generate → migrate → evaluate × 2 branches, one contextId across 3 agents", async () => {
    const { contextId, finalState, stats } = await coordinate(coordinator.url, {
      goal: "full-loop",
      topic: "winter tire studless vs studded comparison",
      legacyStyle: "messy",
      backend: "dryrun",
      fanOut: 2,
    });

    expect(finalState).toBe("completed");
    expect(stats!.route).toBe("generate→migrate→evaluate");
    expect(stats!.branches).toBe(2);
    expect(stats!.completed).toBe(2);
    expect(stats!.failed).toBe(0);

    for (const b of stats!.branchResults) {
      expect(b.stages.map((s) => s.stage)).toEqual(["generate", "migrate", "evaluate"]);
      expect(b.stages.every((s) => s.state === "completed")).toBe(true);
      expect(b.sourceUrl).toContain("/artifacts/sources/"); // generated page
      expect(b.target).toBe(b.sourceUrl); // dryrun = perfect simulated migration
      expect(typeof b.confidence).toBe("number");
      expect(typeof b.overallScore).toBe("number");
      expect(b.evalTaskId).toBeTruthy();
    }
    expect(stats!.migrationConfidence).toBeTruthy();
    expect(Object.keys(stats!.perDimension).length).toBeGreaterThanOrEqual(4);

    // ONE contextId threads the whole pipeline: 2 child tasks in each agent's store
    expect(contextTaskCount(contentGen.dbPath, contextId)).toBe(2);
    expect(contextTaskCount(migration.dbPath, contextId)).toBe(2);
    expect(contextTaskCount(evalAgent.dbPath, contextId)).toBe(2);
  }, 90_000);

  it("full-loop with NO topic: coordinator asks content-gen to ideate one (agent-led daily loop)", async () => {
    const { contextId, finalState, stats } = await coordinate(coordinator.url, {
      goal: "full-loop",
      backend: "dryrun",
      // no topic supplied — the coordinator must ideate one via content.ideate
    });

    expect(finalState).toBe("completed");
    expect(stats!.route).toBe("generate→migrate→evaluate");
    expect(stats!.completed).toBe(1);

    const b = stats!.branchResults[0];
    expect(b.stages.map((s) => s.stage)).toEqual(["generate", "migrate", "evaluate"]);
    expect(b.stages.every((s) => s.state === "completed")).toBe(true);
    expect(b.sourceUrl).toContain("/artifacts/sources/"); // generated from the ideated topic

    // the ideated topic was written back into the persisted run config
    const row = runRow(coordinator.dbPath, contextId);
    expect(row?.status).toBe("completed");
    const cfg = JSON.parse(row!.config) as { topic?: string };
    expect(typeof cfg.topic).toBe("string");
    expect((cfg.topic ?? "").length).toBeGreaterThan(8);
  }, 90_000);

  it("generate+migrate: stops WITHOUT eval (no mandatory end)", async () => {
    const { contextId, finalState, stats } = await coordinate(coordinator.url, {
      goal: "generate+migrate",
      topic: "community garden plot rules",
      backend: "dryrun",
    });

    expect(finalState).toBe("completed");
    expect(stats!.route).toBe("generate→migrate");
    expect(stats!.branchResults[0].stages.map((s) => s.stage)).toEqual(["generate", "migrate"]);
    expect(stats!.branchResults[0].evalTaskId).toBeUndefined(); // genuinely no eval ran
    expect(contextTaskCount(evalAgent.dbPath, contextId)).toBe(0);
    // stats fall back to migration confidence when no eval scores exist
    expect(stats!.overall.mean).toBeGreaterThanOrEqual(80); // dryrun confidence range
  }, 60_000);

  it("migrate route: source already exists (no mandatory start)", async () => {
    const { finalState, stats } = await coordinate(coordinator.url, {
      goal: "migrate",
      sourceLocation: "https://example.com/existing-legacy-page",
      pageSlug: "existing-legacy-page",
      backend: "dryrun",
    });
    expect(finalState).toBe("completed");
    expect(stats!.route).toBe("migrate");
    expect(stats!.branchResults[0].stages.map((s) => s.stage)).toEqual(["migrate"]);
  }, 60_000);

  it("auto routing follows the state table deterministically", async () => {
    // already migrated → evaluate only
    const evalOnly = await coordinate(coordinator.url, {
      goal: "auto",
      alreadyMigratedUrl: "https://example.com",
    });
    expect(evalOnly.finalState).toBe("completed");
    expect(evalOnly.stats!.route).toBe("evaluate");

    // source in hand → migrate → evaluate (skip generate)
    const skipGen = await coordinate(coordinator.url, {
      goal: "auto",
      sourceLocation: "https://example.com/some-source",
      backend: "dryrun",
    });
    expect(skipGen.finalState).toBe("completed");
    expect(skipGen.stats!.route).toBe("migrate→evaluate");

    // nothing to infer from → clean failure with a hint
    const nothing = await coordinate(coordinator.url, { goal: "auto" });
    expect(nothing.finalState).toBe("failed");
    expect(nothing.finalNote).toContain("infer");
  }, 90_000);

  it("a failing stage fails its branch but not the run (failure isolation)", async () => {
    const { finalState, stats } = await coordinate(coordinator.url, {
      goal: "migrate",
      sourceLocation: "https://example.com/x",
      backend: "makecom", // unconfigured → stage fails
      fanOut: 2,
    });
    expect(finalState).toBe("completed"); // run completes…
    expect(stats!.failed).toBe(2); // …with both branches recorded failed
    expect(stats!.branchResults.every((b) => b.state === "failed")).toBe(true);
    expect(stats!.branchResults[0].stages[0].state).toBe("failed");
  }, 60_000);
});
