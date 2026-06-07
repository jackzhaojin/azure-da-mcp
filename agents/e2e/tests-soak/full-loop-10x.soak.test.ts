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

// M4 DoD, pulled forward: "fanOut: 10 stable within concurrency budget; 10x run
// completes unattended". Real eval engine (10 real Chromium scans), dryrun
// migration, template generation — the whole mesh under sustained load, $0.
describe("soak: full-loop × 10 branches, unattended", () => {
  let evalAgent: AgentHandle;
  let contentGen: AgentHandle;
  let migration: AgentHandle;
  let coordinator: AgentHandle;

  beforeAll(async () => {
    [evalAgent, contentGen, migration] = await Promise.all([
      startAgent("eval-service", 14201, { env: NO_AI_ENV }),
      startAgent("content-gen", 14202),
      startAgent("migration-agent", 14203),
    ]);
    coordinator = await startAgent("coordinator", 14204, {
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

  it("10/10 branches complete; browsers never exceed 3; stores stay consistent", async () => {
    const client = await new ClientFactory().createFromUrl(coordinator.url);
    const t0 = Date.now();
    let contextId = "";
    let finalState = "";
    let stats:
      | {
          runId: string;
          branches: number;
          completed: number;
          failed: number;
          overall: { mean: number; stddev: number };
          perDimension: Record<string, { n: number; stddev: number }>;
          branchResults: Array<{ branch: number; state: string; stages: Array<{ state: string }> }>;
        }
      | undefined;
    let progressEvents = 0;

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
              topic: "rooftop solar panel maintenance schedule",
              legacyStyle: "dated",
              backend: "dryrun",
              fanOut: 10,
            },
          },
        ],
      },
    })) {
      if (event.kind === "task") contextId = event.contextId;
      if (event.kind === "status-update") {
        progressEvents++;
        if ((event as TaskStatusUpdateEvent).final) finalState = event.status.state;
      }
      if (event.kind === "artifact-update") {
        const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
        if (part?.kind === "data") stats = part.data as never;
      }
    }
    const wallMs = Date.now() - t0;

    // the run itself
    expect(finalState).toBe("completed");
    expect(stats!.branches).toBe(10);
    expect(stats!.completed).toBe(10);
    expect(stats!.failed).toBe(0);
    expect(stats!.branchResults.every((b) => b.stages.length === 3 && b.stages.every((s) => s.state === "completed"))).toBe(true);
    expect(progressEvents).toBeGreaterThanOrEqual(30); // ≥3 stage updates × 10 branches streamed live
    expect(stats!.perDimension.structure.n).toBe(10);

    // resource discipline: the whole 10x run never exceeded the browser cap
    const health = (await (await fetch(`${evalAgent.url}/health`)).json()) as {
      browser: { maxObserved: number; permits: number; inUse: number };
      queue: { running: number; queued: number };
    };
    expect(health.browser.maxObserved).toBeLessThanOrEqual(health.browser.permits);
    expect(health.browser.inUse).toBe(0);
    expect(health.queue.running).toBe(0);
    expect(health.queue.queued).toBe(0); // fully drained

    // store consistency: 10 eval_reports + 10 tasks per agent under ONE contextId
    const evalDb = new Database(evalAgent.dbPath, { readonly: true });
    const reports = (
      evalDb
        .prepare("select count(*) as n from eval_reports er join tasks t on t.id = er.task_id where t.context_id = ?")
        .get(contextId) as { n: number }
    ).n;
    evalDb.close();
    expect(reports).toBe(10);
    for (const handle of [contentGen, migration, evalAgent]) {
      const db = new Database(handle.dbPath, { readonly: true });
      const n = (db.prepare("select count(*) as n from tasks where context_id = ? and state = 'completed'").get(contextId) as { n: number }).n;
      db.close();
      expect(n).toBe(10);
    }

    // variance stats are statistically sane on identical inputs (deterministic engine)
    expect(stats!.overall.stddev).toBeLessThanOrEqual(5);

    console.log(
      `SOAK: 10 branches in ${(wallMs / 1000).toFixed(1)}s wall · score ${stats!.overall.mean} ± ${stats!.overall.stddev} · maxBrowsers ${health.browser.maxObserved}/${health.browser.permits} · ${progressEvents} live events`
    );
  });
});
