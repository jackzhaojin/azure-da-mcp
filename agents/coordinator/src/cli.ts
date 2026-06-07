import { ClientFactory } from "@a2a-js/sdk/client";
import type { Message } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";

/**
 * Coordinator walking skeleton — A2A *client* face only (CLI-first, PRD part-6).
 * `hello`: discovers both stub agents via their Agent Cards, streams one task
 * through each, then re-fetches via tasks/get to prove store-backed persistence.
 *
 * The server face (:4004, coordinate.run) and the agentic planner land at M2/M3.
 */

const AGENTS = [
  { label: "eval", url: "http://localhost:4001" },
  { label: "content-gen", url: "http://localhost:4002" },
];

function userMessage(text: string): Message {
  return {
    kind: "message",
    messageId: randomUUID(),
    role: "user",
    parts: [{ kind: "text", text }],
  };
}

function short(obj: unknown, max = 140): string {
  const s = JSON.stringify(obj);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function hello() {
  const factory = new ClientFactory();

  for (const agent of AGENTS) {
    console.log(`\n━━━ ${agent.label} @ ${agent.url} ━━━`);

    const client = await factory.createFromUrl(agent.url);
    const card = await client.getAgentCard();
    console.log(`card: ${card.name} v${card.version} — skills: ${card.skills.map((s) => s.id).join(", ")}`);

    let taskId: string | undefined;
    const t0 = Date.now();
    const stream = client.sendMessageStream({
      message: userMessage(`hello from coordinator → run ${card.skills[0]?.id ?? "default"} (skeleton)`),
    });

    for await (const event of stream) {
      const dt = `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
      switch (event.kind) {
        case "task":
          taskId = event.id;
          console.log(`${dt} task        ${event.id} → ${event.status.state}`);
          break;
        case "status-update": {
          const note =
            event.status.message?.parts?.find((p) => p.kind === "text")?.text ?? "";
          console.log(`${dt} status      ${event.status.state}${note ? ` — ${note}` : ""}${event.final ? " (final)" : ""}`);
          break;
        }
        case "artifact-update":
          console.log(`${dt} artifact    ${event.artifact.name}: ${short(event.artifact.parts[0])}`);
          break;
        case "message":
          console.log(`${dt} message     ${short(event.parts)}`);
          break;
      }
    }

    if (taskId) {
      const fetched = await client.getTask({ id: taskId });
      console.log(
        `tasks/get   → ${fetched.status.state}, ${fetched.artifacts?.length ?? 0} artifact(s) (persisted in ${agent.label}'s SQLite store)`
      );
      console.log(`            taskId ${taskId} — restart the server and 'tasks/get' it again to prove restart survival`);
    }
  }
  console.log("\n✔ mesh walking skeleton: cards discovered, tasks streamed, store-backed retrieval verified");
}

const cmd = process.argv[2];
if (cmd === "hello") {
  hello().catch((err) => {
    console.error("hello failed:", err?.message ?? err);
    process.exit(1);
  });
} else {
  console.log("usage: coordinator hello   (more commands land at M2: run <request.json>, batch …)");
  process.exit(1);
}
