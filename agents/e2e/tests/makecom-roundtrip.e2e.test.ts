import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

/**
 * Fake Make.com: a real HTTP server playing the scenario's role — receives the
 * webhook trigger, "runs the migration", then POSTs the final report to the
 * callbackUrl after `delayMs`. Locally exercises the EXACT wire protocol the
 * real Make.com scenario will use through the tunnel.
 */
function startFakeMakecom(port: number, opts: { delayMs: number; respond?: boolean } = { delayMs: 300 }) {
  const triggers: Array<Record<string, unknown>> = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}") as { callbackUrl?: string; pageSlug?: string; siteName?: string; owner?: string };
      triggers.push(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"accepted":true}'); // Make.com webhooks ack immediately

      if (opts.respond !== false && body.callbackUrl) {
        setTimeout(() => {
          void fetch(body.callbackUrl!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageUrl: `https://da.live/edit#/${body.owner}/${body.siteName}/migration-batch-mc/${body.pageSlug}`,
              previewUrl: `https://main--${body.siteName}--${body.owner}.aem.page/migration-batch-mc/${body.pageSlug}`,
              status: "PASS",
              confidence: 92,
              blocksUsed: ["hero", "cards"],
              refinementIterations: 2,
              gaps: [],
            }),
          });
        }, opts.delayMs);
      }
    });
  });
  return new Promise<{ url: string; triggers: typeof triggers; close: () => Promise<void> }>((resolve) => {
    server.listen(port, () =>
      resolve({
        url: `http://localhost:${port}`,
        triggers,
        close: () => new Promise((r) => server.close(() => r())),
      })
    );
  });
}

async function runMigration(agentUrl: string, data: Record<string, unknown>) {
  const client = await new ClientFactory().createFromUrl(agentUrl);
  let taskId = "";
  let finalState = "";
  let finalNote = "";
  let artifact: Record<string, unknown> | undefined;
  for await (const event of client.sendMessageStream({
    message: { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] },
  })) {
    if (event.kind === "task") taskId = (event as Task).id;
    if (event.kind === "status-update" && (event as TaskStatusUpdateEvent).final) {
      finalState = event.status.state;
      finalNote = event.status.message?.parts.find((p) => p.kind === "text")?.text ?? "";
    }
    if (event.kind === "artifact-update") {
      const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
      if (part?.kind === "data") artifact = part.data as Record<string, unknown>;
    }
  }
  return { taskId, finalState, finalNote, artifact };
}

const PAYLOAD = {
  sourceType: "webpage",
  sourceLocation: "https://example.com/legacy",
  site: "demo-site",
  owner: "jackzhaojin",
  pageSlug: "mc-roundtrip",
  backend: "makecom",
};

// The Make.com backend round-trip (PRD part-5) — webhook out, callback in —
// against a fake Make.com speaking the exact wire protocol. When Jack wires the
// real scenario + tunnel, only MAKECOM_WEBHOOK_URL/MIGRATION_CALLBACK_BASE change.
describe("makecom backend: webhook → scenario → callback", () => {
  let fake: Awaited<ReturnType<typeof startFakeMakecom>>;
  let agent: AgentHandle;

  beforeAll(async () => {
    fake = await startFakeMakecom(14151, { delayMs: 400 });
    agent = await startAgent("migration-agent", 14152, {
      env: {
        MAKECOM_WEBHOOK_URL: fake.url,
        MIGRATION_CALLBACK_BASE: "http://localhost:14152",
      },
    });
  });

  afterAll(async () => {
    await Promise.all([stopAgent(agent), fake.close()]);
  });

  it("completes a migration via the async callback round-trip", async () => {
    const { finalState, artifact } = await runMigration(agent.url, PAYLOAD);
    expect(finalState).toBe("completed");

    // the trigger carried the 1:1 runtime vars + callbackUrl
    expect(fake.triggers.length).toBe(1);
    expect(fake.triggers[0].siteName).toBe("demo-site");
    expect(fake.triggers[0].sourceLocation).toBe(PAYLOAD.sourceLocation);
    expect(String(fake.triggers[0].callbackUrl)).toContain("/callbacks/makecom/");

    // the artifact is Make.com's final report, backend-tagged
    expect(artifact!.status).toBe("PASS");
    expect(artifact!.confidence).toBe(92);
    expect(artifact!.backend).toBe("makecom");
    expect(artifact!.previewUrl).toContain("aem.page/migration-batch-mc/mc-roundtrip");
  }, 30_000);

  it("times out cleanly when the scenario never calls back", async () => {
    const silent = await startFakeMakecom(14153, { delayMs: 0, respond: false });
    const timeoutAgent = await startAgent("migration-agent", 14154, {
      env: {
        MAKECOM_WEBHOOK_URL: silent.url,
        MIGRATION_CALLBACK_BASE: "http://localhost:14154",
        MAKECOM_TIMEOUT_MS: "1500",
      },
    });
    try {
      const { finalState, finalNote } = await runMigration(timeoutAgent.url, PAYLOAD);
      expect(finalState).toBe("failed");
      expect(finalNote).toContain("timeout");
    } finally {
      await stopAgent(timeoutAgent);
      await silent.close();
    }
  }, 30_000);

  it("a callback arriving AFTER a restart still completes the task from the store", async () => {
    // scenario takes 4s; we kill the agent at ~1s and restart — the callback
    // lands on the NEW process, which completes the task straight from SQLite.
    // This is the Make.com-outlives-our-process resilience story.
    const slow = await startFakeMakecom(14155, { delayMs: 4000 });
    let restartAgent = await startAgent("migration-agent", 14156, {
      env: {
        MAKECOM_WEBHOOK_URL: slow.url,
        MIGRATION_CALLBACK_BASE: "http://localhost:14156",
      },
    });
    const dbPath = restartAgent.dbPath;
    try {
      // non-blocking submit, then kill mid-wait
      const client = await new ClientFactory().createFromUrl(restartAgent.url);
      const submitted = (await client.sendMessage({
        message: {
          kind: "message",
          messageId: randomUUID(),
          role: "user",
          parts: [{ kind: "data", data: { ...PAYLOAD, pageSlug: "mc-restart" } }],
        },
        configuration: { blocking: false },
      })) as Task;
      const taskId = submitted.id;

      await new Promise((r) => setTimeout(r, 1000)); // webhook fired, waiter parked
      expect(slow.triggers.length).toBe(1);
      await stopAgent(restartAgent);
      restartAgent = await startAgent("migration-agent", 14156, {
        dbPath,
        env: { MAKECOM_WEBHOOK_URL: slow.url, MIGRATION_CALLBACK_BASE: "http://localhost:14156" },
      });

      // the 4s callback arrives on the new process → store-path completion
      const deadline = Date.now() + 20_000;
      let state = "";
      const client2 = await new ClientFactory().createFromUrl(restartAgent.url);
      while (Date.now() < deadline) {
        const task = await client2.getTask({ id: taskId });
        state = task.status.state;
        if (state === "completed" || state === "failed") break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(state).toBe("completed");
      const recovered = await client2.getTask({ id: taskId });
      const data = (recovered.artifacts![0].parts[0] as { kind: "data"; data: { status: string; backend: string } }).data;
      expect(data.status).toBe("PASS");
      expect(data.backend).toBe("makecom");
    } finally {
      await stopAgent(restartAgent);
      await slow.close();
    }
  }, 40_000);
});
