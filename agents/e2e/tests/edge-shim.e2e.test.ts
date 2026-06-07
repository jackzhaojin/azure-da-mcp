import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Task } from "@a2a-js/sdk";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";
import { startReceiver, type Receiver } from "../helpers/receiver.ts";

// The edge webhook shim (PRD part-3): external callers (Make.com, curl, cron)
// send ONE flat POST and get the result back as a plain webhook — full A2A stays
// internal. This drives the exact two-scenario Make.com pattern.
describe("edge webhook shim (POST /hooks/{agent}/{skill})", () => {
  let agent: AgentHandle;
  let receiver: Receiver;

  beforeAll(async () => {
    [agent, receiver] = await Promise.all([
      startAgent("eval-service", 14071, { env: { EVAL_ENGINE: "stub" } }),
      startReceiver(14072),
    ]);
  });

  afterAll(async () => {
    await Promise.all([stopAgent(agent), receiver.close()]);
  });

  it("flat POST → 202 {taskId} → result arrives at callbackUrl (the Make.com round-trip)", async () => {
    const res = await fetch(`${agent.url}/hooks/eval/eval.run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetUrl: "https://example.com",
        sourceType: "none",
        callbackUrl: `${receiver.url}/makecom-hook-b`,
      }),
    });
    expect(res.status).toBe(202);
    const { taskId, contextId } = (await res.json()) as { taskId: string; contextId: string };
    expect(taskId).toBeTruthy();
    expect(contextId).toBeTruthy();

    // scenario B: the webhook fires with the full completed task
    const post = await receiver.waitFor(
      (p) => p.path === "/makecom-hook-b" && (p.body as Task)?.id === taskId && (p.body as Task)?.status?.state === "completed"
    );
    const task = post.body as Task;
    expect(task.artifacts?.length).toBe(1);

    // and the task is also poll-able via tasks/get (fallback when webhooks flake)
    const client = await new ClientFactory().createFromUrl(agent.url);
    const fetched = await client.getTask({ id: taskId });
    expect(fetched.status.state).toBe("completed");
  });

  it("works without a callbackUrl (poll-only callers)", async () => {
    const res = await fetch(`${agent.url}/hooks/eval/eval.run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUrl: "https://example.com", sourceType: "none" }),
    });
    expect(res.status).toBe(202);
    expect(((await res.json()) as { taskId: string }).taskId).toBeTruthy();
  });

  it("404s unknown agents and skills", async () => {
    const wrongAgent = await fetch(`${agent.url}/hooks/migration/migration.run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(wrongAgent.status).toBe(404);
    const wrongSkill = await fetch(`${agent.url}/hooks/eval/eval.fly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(wrongSkill.status).toBe(404);
  });

  it("gates the shim with the edge token when configured", async () => {
    const gated = await startAgent("eval-service", 14073, {
      env: { EVAL_ENGINE: "stub", A2A_EDGE_TOKEN: "edge-secret" },
    });
    try {
      const body = JSON.stringify({ targetUrl: "https://example.com", sourceType: "none" });
      const noAuth = await fetch(`${gated.url}/hooks/eval/eval.run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      expect(noAuth.status).toBe(401);
      const withAuth = await fetch(`${gated.url}/hooks/eval/eval.run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer edge-secret" },
        body,
      });
      expect(withAuth.status).toBe(202);
    } finally {
      await stopAgent(gated);
    }
  });
});
