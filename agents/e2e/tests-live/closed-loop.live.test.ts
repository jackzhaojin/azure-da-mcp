import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

const NO_AI_ENV = {
  EVAL_ENGINE: "real",
  CLAUDE_CODE_OAUTH_TOKEN: "",
  ANTHROPIC_API_KEY: "",
  EVAL_MAX_ATTEMPTS: "1",
};

// THE CLOSED LOOP, FOR REAL: a synthetic legacy page is generated and served,
// "migrated" (dryrun = the page itself), then scored by the REAL eval engine —
// real Chromium, real axe, real screenshot, real content comparison against the
// source. The adaptTo() demo's spine, running locally at $0.
describe("closed loop over the real eval engine", () => {
  let evalAgent: AgentHandle;
  let contentGen: AgentHandle;
  let migration: AgentHandle;
  let coordinator: AgentHandle;

  beforeAll(async () => {
    [evalAgent, contentGen, migration] = await Promise.all([
      startAgent("eval-service", 14141, { env: NO_AI_ENV }),
      startAgent("content-gen", 14142),
      startAgent("migration-agent", 14143),
    ]);
    coordinator = await startAgent("coordinator", 14144, {
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

  it("full-loop × 2: real scores on generated pages, variance stats, eval_reports", async () => {
    const client = await new ClientFactory().createFromUrl(coordinator.url);
    let contextId = "";
    let finalState = "";
    let stats:
      | {
          route: string;
          completed: number;
          overall: { mean: number; stddev: number };
          migrationConfidence?: { mean: number };
          perDimension: Record<string, { mean: number; n: number }>;
          branchResults: Array<{ sourceUrl?: string; overallScore?: number; dimensionScores?: Record<string, number> }>;
        }
      | undefined;

    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [
          {
            kind: "data",
            data: {
              goal: "full-loop",
              topic: "backyard greenhouse insulation basics",
              legacyStyle: "dated", // table-layout legacy markup → structure should score imperfectly
              backend: "dryrun",
              fanOut: 2,
            },
          },
        ],
      },
    })) {
      if (event.kind === "task") contextId = event.contextId;
      if (event.kind === "status-update" && (event as TaskStatusUpdateEvent).final) finalState = event.status.state;
      if (event.kind === "artifact-update") {
        const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
        if (part?.kind === "data") stats = part.data as never;
      }
    }

    expect(finalState).toBe("completed");
    expect(stats!.route).toBe("generate→migrate→evaluate");
    expect(stats!.completed).toBe(2);

    // the real engine scored the generated page: structure parsed real markup,
    // axe scanned a real render, content compared target against the source
    expect(stats!.perDimension.structure.mean).toBeGreaterThan(0);
    expect(stats!.perDimension.structure.n).toBe(2);
    expect(stats!.perDimension.accessibility.mean).toBeGreaterThan(0);
    expect(stats!.perDimension.content.mean).toBeGreaterThan(0); // source available → content dimension ran
    expect(stats!.overall.mean).toBeGreaterThan(0);
    expect(stats!.migrationConfidence!.mean).toBeGreaterThanOrEqual(80);

    // both branches produced eval_reports rows, threaded under one contextId
    const db = new Database(evalAgent.dbPath, { readonly: true });
    const rows = db
      .prepare(
        `select er.target_url, er.overall_score from eval_reports er
         join tasks t on t.id = er.task_id where t.context_id = ?`
      )
      .all(contextId) as Array<{ target_url: string; overall_score: number }>;
    db.close();
    expect(rows.length).toBe(2);
    for (const r of rows) {
      expect(r.target_url).toContain("/artifacts/sources/"); // scored the generated pages
      expect(r.overall_score).toBe(stats!.branchResults.find((b) => b.sourceUrl === r.target_url)?.overallScore);
    }
  }, 240_000);
});
