import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Task } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";
import { startReceiver, type Receiver } from "../helpers/receiver.ts";

// A2A push notifications ARE plain webhooks (PRD part-3) — the Make.com return
// path. A real HTTP receiver registers as the callback and must get the task.
describe("push notifications (webhooks out)", () => {
  let agent: AgentHandle;
  let receiver: Receiver;

  beforeAll(async () => {
    [agent, receiver] = await Promise.all([
      startAgent("eval-service", 14051, { env: { EVAL_ENGINE: "stub" } }),
      startReceiver(14052),
    ]);
  });

  afterAll(async () => {
    await Promise.all([stopAgent(agent), receiver.close()]);
  });

  it("delivers the completed task to the registered callback URL", async () => {
    const client = await new ClientFactory().createFromUrl(agent.url);
    const task = (await client.sendMessage({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "data", data: { targetUrl: "https://example.com", sourceType: "none" } }],
      },
      configuration: {
        blocking: false,
        pushNotificationConfig: { url: `${receiver.url}/callback`, token: "cb-secret-1" },
      },
    })) as Task;

    const post = await receiver.waitFor(
      (p) => p.path === "/callback" && (p.body as Task)?.id === task.id && (p.body as Task)?.status?.state === "completed"
    );

    const delivered = post.body as Task;
    expect(delivered.status.state).toBe("completed");
    expect(delivered.artifacts?.length).toBe(1); // result travels with the webhook
    expect(post.headers["x-a2a-notification-token"]).toBe("cb-secret-1"); // receiver can validate sender
  });

  it("push config registration survives a restart (SQLite-backed store)", async () => {
    // register a config via the explicit API, restart, then read it back
    const client = await new ClientFactory().createFromUrl(agent.url);
    const task = (await client.sendMessage({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [{ kind: "data", data: { targetUrl: "https://example.com", sourceType: "none" } }],
      },
      configuration: {
        blocking: false,
        pushNotificationConfig: { url: `${receiver.url}/survives` },
      },
    })) as Task;
    await receiver.waitFor((p) => p.path === "/survives" && (p.body as Task)?.id === task.id);

    const dbPath = agent.dbPath;
    await stopAgent(agent);
    agent = await startAgent("eval-service", 14051, { dbPath, env: { EVAL_ENGINE: "stub" } });

    const client2 = await new ClientFactory().createFromUrl(agent.url);
    const configs = await client2.getTaskPushNotificationConfig({ id: task.id });
    expect(configs.pushNotificationConfig.url).toBe(`${receiver.url}/survives`);
  });
});
