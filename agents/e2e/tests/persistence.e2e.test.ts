import { describe, it, expect, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Task } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// The sleep-tolerance rule (PRD part-1, proven for Containers in
// pocs/cloudflare-long-session-container): a process restart must never lose
// task state. Kill the real server, restart it on the same SQLite file, and
// the completed task must still be served via tasks/get.
describe("restart survival (sleep-tolerance rule)", () => {
  let agent: AgentHandle;

  afterAll(async () => {
    if (agent) await stopAgent(agent);
  });

  it("a completed task survives a full server restart", async () => {
    agent = await startAgent("eval-service", 14021, { env: { EVAL_ENGINE: "stub" } });
    const dbPath = agent.dbPath;

    // run one task to completion
    const client = await new ClientFactory().createFromUrl(agent.url);
    let taskId = "";
    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "text", text: "evaluate then survive a restart (e2e)" }],
      },
    })) {
      if (event.kind === "task") taskId = (event as Task).id;
    }
    expect(taskId).toBeTruthy();

    // hard restart: kill the process, start a NEW one on the same store file
    await stopAgent(agent);
    agent = await startAgent("eval-service", 14021, { dbPath, env: { EVAL_ENGINE: "stub" } });

    // the new process must serve the old task from SQLite
    const client2 = await new ClientFactory().createFromUrl(agent.url);
    const recovered = await client2.getTask({ id: taskId });
    expect(recovered.status.state).toBe("completed");
    expect(recovered.artifacts?.length).toBe(1);
    const data = recovered.artifacts![0].parts[0] as { kind: "data"; data: Record<string, unknown> };
    expect(typeof data.data.overallScore).toBe("number");
  });
});
