import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from "@a2a-js/sdk";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

const NO_AI_ENV = {
  EVAL_ENGINE: "real",
  CLAUDE_CODE_OAUTH_TOKEN: "",
  ANTHROPIC_API_KEY: "",
  EVAL_MAX_ATTEMPTS: "1",
};

// M2 exit criterion over the REAL engine: coordinate.run batch → eval children run
// actual Chromium work → variance stats aggregate genuine scores → eval_reports rows.
describe("coordinator batch over the real eval engine", () => {
  let evalAgent: AgentHandle;
  let coordinator: AgentHandle;

  beforeAll(async () => {
    evalAgent = await startAgent("eval-service", 14091, { env: NO_AI_ENV });
    coordinator = await startAgent("coordinator", 14092, { env: { EVAL_AGENT_URL: evalAgent.url } });
  });

  afterAll(async () => {
    await Promise.all([stopAgent(evalAgent), stopAgent(coordinator)]);
  });

  it("2-branch batch: real scores, variance stats, eval_reports rows, one contextId", async () => {
    const client = await new ClientFactory().createFromUrl(coordinator.url);
    let contextId = "";
    let finalState = "";
    let stats:
      | {
          runId: string;
          branches: number;
          completed: number;
          overall: { mean: number; stddev: number };
          perDimension: Record<string, { n: number; mean: number }>;
          branchResults: Array<{ evalTaskId?: string; state: string; overallScore?: number }>;
        }
      | undefined;

    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "data", data: { goal: "evaluate", targets: ["https://example.com"], fanOut: 2 } }],
      },
    })) {
      if (event.kind === "task") contextId = event.contextId;
      if (event.kind === "status-update" && (event as TaskStatusUpdateEvent).final) {
        finalState = event.status.state;
      }
      if (event.kind === "artifact-update") {
        const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
        if (part?.kind === "data") stats = part.data as never;
      }
    }

    expect(finalState).toBe("completed");
    expect(stats!.branches).toBe(2);
    expect(stats!.completed).toBe(2);

    // real deterministic scores: identical page evaluated twice → stddev should be small,
    // and structure/accessibility means must be genuine (> 0)
    expect(stats!.perDimension.structure.mean).toBeGreaterThan(0);
    expect(stats!.perDimension.accessibility.mean).toBeGreaterThan(0);
    expect(stats!.overall.mean).toBeGreaterThan(0);
    expect(stats!.overall.stddev).toBeGreaterThanOrEqual(0);

    // both children wrote real eval_reports rows, threaded under ONE contextId
    const evalDb = new Database(evalAgent.dbPath, { readonly: true });
    const rows = evalDb
      .prepare(
        `select count(*) as n from eval_reports er
         join tasks t on t.id = er.task_id
         where t.context_id = ?`
      )
      .get(contextId) as { n: number };
    evalDb.close();
    expect(rows.n).toBe(2);
  }, 240_000);
});
