import { meshClientFactory } from "@agents/a2a-common";
import type { Message, TaskStatusUpdateEvent } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";

/**
 * Coordinator CLI (CLI-first, PRD part-6).
 *   hello                          — mesh smoke test: discover cards, stream a task through each agent
 *   batch <url...> [--fan-out N]   — submit an eval-only batch via coordinate.run (M2), stream progress, print stats
 */

const COORDINATOR_URL = process.env.COORDINATOR_URL ?? "http://localhost:4004";
const AGENTS = [
  { label: "eval", url: process.env.EVAL_AGENT_URL ?? "http://localhost:4001" },
  { label: "content-gen", url: process.env.CONTENT_GEN_URL ?? "http://localhost:4002" },
];

function userMessage(parts: Message["parts"]): Message {
  return { kind: "message", messageId: randomUUID(), role: "user", parts };
}

function short(obj: unknown, max = 140): string {
  const s = JSON.stringify(obj);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

async function hello() {
  const factory = meshClientFactory();
  for (const agent of AGENTS) {
    console.log(`\n━━━ ${agent.label} @ ${agent.url} ━━━`);
    const client = await factory.createFromUrl(agent.url);
    const card = await client.getAgentCard();
    console.log(`card: ${card.name} v${card.version} — skills: ${card.skills.map((s) => s.id).join(", ")}`);

    let taskId: string | undefined;
    const t0 = Date.now();
    const payload =
      agent.label === "eval"
        ? { targetUrl: "https://example.com", sourceType: "none" }
        : { topic: "hello from coordinator (skeleton)" };
    for await (const event of client.sendMessageStream({
      message: userMessage([{ kind: "data", data: payload }]),
    })) {
      const dt = `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
      if (event.kind === "task") {
        taskId = event.id;
        console.log(`${dt} task        ${event.id} → ${event.status.state}`);
      } else if (event.kind === "status-update") {
        const note = event.status.message?.parts?.find((p) => p.kind === "text")?.text ?? "";
        console.log(`${dt} status      ${event.status.state}${note ? ` — ${note}` : ""}${event.final ? " (final)" : ""}`);
      } else if (event.kind === "artifact-update") {
        console.log(`${dt} artifact    ${event.artifact.name}: ${short(event.artifact.parts[0])}`);
      }
    }
    if (taskId) {
      const fetched = await client.getTask({ id: taskId });
      console.log(`tasks/get   → ${fetched.status.state}, ${fetched.artifacts?.length ?? 0} artifact(s)`);
    }
  }
  console.log("\n✔ mesh smoke test complete");
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function batch(args: string[]) {
  const fanOut = Number(flag(args, "--fan-out") ?? 1);
  const targets = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--fan-out");
  if (!targets.length) {
    console.error("usage: coordinator batch <url> [url...] [--fan-out N]");
    process.exit(1);
  }
  await submitAndStream({ goal: "evaluate", targets, fanOut });
}

async function loop(args: string[]) {
  const topic = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")).join(" ");
  if (!topic) {
    console.error("usage: coordinator loop <topic...> [--fan-out N] [--goal full-loop|generate+migrate|auto] [--legacy-style clean|dated|messy] [--backend dryrun|makecom|sdk|opencode] [--site S] [--owner O]");
    process.exit(1);
  }
  const site = flag(args, "--site");
  const owner = flag(args, "--owner");
  await submitAndStream({
    goal: flag(args, "--goal") ?? "full-loop",
    topic,
    fanOut: Number(flag(args, "--fan-out") ?? 1),
    legacyStyle: flag(args, "--legacy-style") ?? "dated",
    backend: flag(args, "--backend") ?? "dryrun",
    ...(site ? { site } : {}),
    ...(owner ? { owner } : {}),
  });
}

async function submitAndStream(data: Record<string, unknown>) {
  console.log(`submitting coordinate.run → ${COORDINATOR_URL}\n${JSON.stringify(data)}`);
  const client = await meshClientFactory().createFromUrl(COORDINATOR_URL);
  const t0 = Date.now();
  let stats: Record<string, unknown> | undefined;

  for await (const event of client.sendMessageStream({
    message: userMessage([{ kind: "data", data }]),
  })) {
    const dt = `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
    if (event.kind === "task") {
      console.log(`${dt} task ${event.id} → ${event.status.state}`);
    } else if (event.kind === "status-update") {
      const e = event as TaskStatusUpdateEvent;
      const note = e.status.message?.parts?.find((p) => p.kind === "text")?.text ?? "";
      console.log(`${dt} ${e.status.state}${note ? ` — ${note}` : ""}${e.final ? " (final)" : ""}`);
    } else if (event.kind === "artifact-update" && event.artifact.name === "run-stats") {
      const part = event.artifact.parts[0];
      if (part?.kind === "data") stats = part.data as Record<string, unknown>;
    }
  }

  if (stats) {
    console.log("\n══ run stats ══");
    console.log(JSON.stringify(stats, null, 2));
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const run = cmd === "hello" ? hello() : cmd === "batch" ? batch(rest) : cmd === "loop" ? loop(rest) : null;
if (!run) {
  console.log("usage: coordinator hello | batch <url...> [--fan-out N] | loop <topic...> [--goal G] [--fan-out N] [--legacy-style S] [--backend B]");
  process.exit(1);
}
run.catch((err) => {
  console.error(`${cmd} failed:`, err?.message ?? err);
  process.exit(1);
});
