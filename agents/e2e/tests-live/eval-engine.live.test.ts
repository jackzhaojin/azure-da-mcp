import { describe, it, expect, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Message, Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// Tier-2 evidence: the REAL engine end-to-end — cheerio fetch, Playwright+axe scan,
// full-page screenshot — behind the real A2A surface. CLAUDE_CODE_OAUTH_TOKEN and
// ANTHROPIC_API_KEY are stripped, so every agentic pass fails fast and falls back
// to deterministic scoring (the engine's designed degradation path): real browsers,
// no API spend.
const NO_AI_ENV = {
  EVAL_ENGINE: "real",
  CLAUDE_CODE_OAUTH_TOKEN: "",
  ANTHROPIC_API_KEY: "",
  EVAL_MAX_ATTEMPTS: "1", // engine-level fallback already covers per-dimension errors
};

function evalMessage(targetUrl: string): Message {
  return {
    kind: "message",
    messageId: randomUUID(),
    role: "user",
    parts: [{ kind: "data", data: { targetUrl, sourceType: "none" } }],
  };
}

describe("real eval engine (deterministic tier)", () => {
  let agent: AgentHandle;

  afterAll(async () => {
    if (agent) await stopAgent(agent);
  });

  it("evaluates a live page: streams progress, scores dimensions, writes eval_reports", async () => {
    agent = await startAgent("eval-service", 14031, { env: NO_AI_ENV });
    const client = await new ClientFactory().createFromUrl(agent.url);

    const events: Array<Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent | Message> = [];
    for await (const event of client.sendMessageStream({
      message: evalMessage("https://example.com"),
    })) {
      events.push(event as never);
    }

    // submitted task first, completed final last
    const first = events[0] as Task;
    expect(first.kind).toBe("task");
    expect(first.status.state).toBe("submitted");
    const last = events[events.length - 1] as TaskStatusUpdateEvent;
    expect(last.status.state).toBe("completed");
    expect(last.final).toBe(true);

    // dimension progress flowed through the queue (agent-start/complete mapping)
    const texts = events
      .filter((e): e is TaskStatusUpdateEvent => e.kind === "status-update")
      .map((e) => e.status.message?.parts.find((p) => p.kind === "text")?.text ?? "");
    for (const dim of ["structure", "accessibility", "visual"]) {
      expect(texts.some((t) => t.includes(`dimension ${dim}: complete`))).toBe(true);
    }

    // artifact: real scores from deterministic analysis
    const artifact = events.find((e) => e.kind === "artifact-update") as TaskArtifactUpdateEvent;
    expect(artifact).toBeTruthy();
    const data = (artifact.artifact.parts[0] as { kind: "data"; data: Record<string, never> }).data as {
      overallScore: number;
      dimensionScores: Record<string, number>;
      report: {
        metadata: { version: string };
        summary: { grade: string };
        results: { visual?: { metadata: { screenshot?: { path: string; url?: string } } } };
      };
    };
    expect(typeof data.overallScore).toBe("number");
    expect(data.dimensionScores.structure).toBeGreaterThan(0); // example.com has valid HTML structure
    expect(data.dimensionScores.accessibility).toBeGreaterThan(0); // axe ran for real
    expect(typeof data.dimensionScores.visual).toBe("number"); // screenshot captured
    expect(data.report.summary.grade).toBeTruthy();

    // the captured screenshot was stored and the report carries a durable, fetchable URL
    // (local artifact backend here → served at /artifacts; same contract on R2)
    const shot = data.report.results.visual?.metadata.screenshot;
    expect(shot?.url).toBeTruthy();
    // local is instant; public r2.dev can lag a beat right after a fresh PUT → retry briefly
    let img!: Response;
    for (let i = 0; i < 8; i++) {
      img = await fetch(shot!.url!, { cache: "no-store" });
      if (img.ok) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toContain("image/png");
    // and an artifacts-table row points at the same object key
    const adb = new Database(agent.dbPath, { readonly: true });
    const arow = adb.prepare("select type, storage_path from artifacts order by rowid desc limit 1").get() as
      | { type: string; storage_path: string }
      | undefined;
    adb.close();
    expect(arow).toMatchObject({ type: "screenshot", storage_path: shot!.path });

    // eval_reports row (Part-2 schema) — the durable result agents/ui will read
    const db = new Database(agent.dbPath, { readonly: true });
    const row = db
      .prepare("select target_url, overall_score, dimension_scores from eval_reports order by created_at desc limit 1")
      .get() as { target_url: string; overall_score: number; dimension_scores: string };
    db.close();
    expect(row.target_url).toBe("https://example.com");
    expect(row.overall_score).toBe(data.overallScore);
    expect(JSON.parse(row.dimension_scores).accessibility).toBe(data.dimensionScores.accessibility);

    // browser semaphore engaged and never exceeded its cap
    const health = (await (await fetch(`${agent.url}/health`)).json()) as {
      engine: string;
      browser: { maxObserved: number; permits: number };
    };
    expect(health.engine).toBe("real");
    expect(health.browser.maxObserved).toBeGreaterThan(0);
    expect(health.browser.maxObserved).toBeLessThanOrEqual(health.browser.permits);
  });

  it("restart mid-queue: the task is re-enqueued from the store and completes (Part-2 DoD)", async () => {
    const dbPath = agent.dbPath;
    const client = await new ClientFactory().createFromUrl(agent.url);

    // submit non-blocking, then kill the server while the eval is in flight
    const submitted = (await client.sendMessage({
      message: evalMessage("https://example.com/"),
      configuration: { blocking: false },
    })) as Task;
    const taskId = submitted.id;
    // non-blocking submit returns submitted — or working, if the queue picked it up first
    expect(["submitted", "working"]).toContain(submitted.status.state);

    await new Promise((r) => setTimeout(r, 2_000)); // let it reach the queue/working
    await stopAgent(agent);

    // new process, same store: boot rebuild must re-enqueue and finish the task
    agent = await startAgent("eval-service", 14031, { dbPath, env: NO_AI_ENV });
    const client2 = await new ClientFactory().createFromUrl(agent.url);

    const deadline = Date.now() + 180_000;
    let state = "";
    while (Date.now() < deadline) {
      const task = await client2.getTask({ id: taskId });
      state = task.status.state;
      if (state === "completed" || state === "failed") break;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    expect(state).toBe("completed");

    const recovered = await client2.getTask({ id: taskId });
    const data = (recovered.artifacts![0].parts[0] as { kind: "data"; data: { overallScore: number } }).data;
    expect(typeof data.overallScore).toBe("number");
  }, 240_000);

  it("5 concurrent evals complete without exceeding 3 live browsers (Part-2 DoD)", async () => {
    const client = await new ClientFactory().createFromUrl(agent.url);

    const tasks = await Promise.all(
      Array.from({ length: 5 }, async () => {
        const t = (await client.sendMessage({
          message: evalMessage("https://example.com"),
          configuration: { blocking: false },
        })) as Task;
        return t.id;
      })
    );
    expect(tasks).toHaveLength(5);

    // poll all five to a terminal state
    const deadline = Date.now() + 200_000;
    const states = new Map<string, string>();
    while (Date.now() < deadline) {
      for (const id of tasks) {
        const t = await client.getTask({ id });
        states.set(id, t.status.state);
      }
      if ([...states.values()].every((s) => s === "completed" || s === "failed")) break;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    expect([...states.values()].filter((s) => s === "completed")).toHaveLength(5);

    // the whole burst never exceeded the browser permit cap
    const health = (await (await fetch(`${agent.url}/health`)).json()) as {
      queue: { concurrency: number };
      browser: { maxObserved: number; permits: number; inUse: number };
    };
    expect(health.browser.maxObserved).toBeLessThanOrEqual(health.browser.permits); // ≤ 3
    expect(health.browser.inUse).toBe(0); // all permits returned
  }, 240_000);
});
