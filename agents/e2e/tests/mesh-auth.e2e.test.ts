import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Task } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";
// meshClientFactory is what the coordinator and agents/ui will use
import { meshClientFactory } from "../../a2a-common/src/client.ts";

// Mesh auth (PRD part-3): shared-secret bearer on the A2A surface. Card and
// health stay public (discovery needs no secrets); /a2a requires the token.
describe("mesh bearer auth (A2A_MESH_TOKEN)", () => {
  const TOKEN = "test-mesh-token-123";
  let agent: AgentHandle;

  beforeAll(async () => {
    agent = await startAgent("eval-service", 14061, {
      env: { EVAL_ENGINE: "stub", A2A_MESH_TOKEN: TOKEN },
    });
  });

  afterAll(async () => {
    await stopAgent(agent);
  });

  it("agent card and health remain public", async () => {
    const card = await fetch(`${agent.url}/.well-known/agent-card.json`);
    expect(card.status).toBe(200);
    expect((await card.json()).securitySchemes?.bearer?.scheme).toBe("bearer"); // advertised
    const health = await fetch(`${agent.url}/health`);
    expect(health.status).toBe(200);
  });

  it("rejects /a2a without (or with a wrong) bearer token", async () => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tasks/get", params: { id: randomUUID() } });
    const noAuth = await fetch(`${agent.url}/a2a`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    expect(noAuth.status).toBe(401);
    const badAuth = await fetch(`${agent.url}/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
      body,
    });
    expect(badAuth.status).toBe(401);
  });

  it("meshClientFactory(token) completes a full task lifecycle through the gate", async () => {
    const client = await meshClientFactory(TOKEN).createFromUrl(agent.url);
    let taskId = "";
    let finalState = "";
    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "data", data: { targetUrl: "https://example.com", sourceType: "none" } }],
      },
    })) {
      if (event.kind === "task") taskId = (event as Task).id;
      if (event.kind === "status-update" && event.final) finalState = event.status.state;
    }
    expect(finalState).toBe("completed");

    const fetched = await client.getTask({ id: taskId });
    expect(fetched.status.state).toBe("completed");
  });
});
