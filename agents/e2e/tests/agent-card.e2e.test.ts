import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// A2A discovery surface: Agent Cards at the well-known origin-scoped path (RFC 8615),
// served by the real servers. PRD part-3: one card per agent, skills enumerate task types.
describe("agent cards + health", () => {
  let evalAgent: AgentHandle;
  let contentGen: AgentHandle;

  beforeAll(async () => {
    [evalAgent, contentGen] = await Promise.all([
      startAgent("eval-service", 14001, { env: { EVAL_ENGINE: "stub" } }),
      startAgent("content-gen", 14002),
    ]);
  });

  afterAll(async () => {
    await Promise.all([stopAgent(evalAgent), stopAgent(contentGen)]);
  });

  it("eval agent serves a valid card with eval.run", async () => {
    const res = await fetch(`${evalAgent.url}/.well-known/agent-card.json`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.protocolVersion).toBe("0.3.0");
    expect(card.name).toBe("da-eval-agent");
    expect(card.url).toBe(`http://localhost:14001/a2a`);
    expect(card.capabilities.streaming).toBe(true);
    expect(card.skills.map((s: { id: string }) => s.id)).toContain("eval.run");
  });

  it("content-gen agent serves a valid card with content.brief", async () => {
    const res = await fetch(`${contentGen.url}/.well-known/agent-card.json`);
    expect(res.status).toBe(200);
    const card = await res.json();
    expect(card.name).toBe("da-content-gen-agent");
    expect(card.skills.map((s: { id: string }) => s.id)).toContain("content.brief");
  });

  it("both agents report healthy", async () => {
    for (const agent of [evalAgent, contentGen]) {
      const health = await (await fetch(`${agent.url}/health`)).json();
      expect(health.ok).toBe(true);
    }
  });
});
