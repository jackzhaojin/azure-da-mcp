#!/usr/bin/env npx tsx
/**
 * opencode + Kimi K2.6 as an **A2A migration backend** — light PoC.
 *
 * This is the bridge between two things that already exist:
 *   • the validated headless K2.6 path (`run-via-serve.ts`: `opencode serve` + REST), and
 *   • the real A2A migration agent (`agents/migration-agent/`), which dispatches a
 *     `migration.run` task to a swappable `MigrationBackend` and re-emits the result as
 *     A2A status/artifact events.
 *
 * It deliberately depends on NOTHING but Node built-ins + tsx, so it runs from
 * `references/kimi/` with no monorepo wiring. But every shape below is a faithful
 * mirror of the real types, so the `opencodeKimiBackend` here lifts almost verbatim
 * into `agents/migration-agent/src/backends/opencode.ts`, and `runExecutor` mirrors
 * `migrationExecutor.execute` in `agents/migration-agent/src/executor.ts`.
 *
 *   MOONSHOT_API_KEY=... npx tsx references/kimi/opencode/a2a-backend-poc.ts
 *
 * What it proves: a `migration.run.v1` payload → K2.6 (via opencode serve) → a
 * contract-shaped `MigrationResult` artifact, surfaced through the exact A2A event
 * sequence the real agent emits. The authoring itself is simulated here (the real
 * backend gives K2.6 the `functions/` da.live MCP + `da-live-author-playwright`
 * skill); this PoC proves the executor ↔ backend ↔ K2.6 wiring end-to-end.
 */

import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import * as os from "os";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// A2A shapes — local mirror of `@a2a-js/sdk` (so the PoC is dependency-free).
// In the real agent these are imported, not redefined.
// ─────────────────────────────────────────────────────────────────────────────
type Part = { kind: "text"; text: string } | { kind: "data"; data: Record<string, unknown> };
interface Message { kind: "message"; messageId: string; role: "user" | "agent"; parts: Part[]; taskId?: string; contextId?: string }
type TaskState = "submitted" | "working" | "completed" | "failed" | "canceled";
interface TaskStatus { state: TaskState; timestamp: string; message?: Message }
interface TaskEvent { kind: "task"; id: string; contextId: string; status: TaskStatus; history: Message[] }
interface StatusUpdateEvent { kind: "status-update"; taskId: string; contextId: string; status: TaskStatus; final: boolean }
interface ArtifactUpdateEvent { kind: "artifact-update"; taskId: string; contextId: string; artifact: { artifactId: string; name: string; parts: Part[] } }
type A2AEvent = TaskEvent | StatusUpdateEvent | ArtifactUpdateEvent;

/** Mirror of `@a2a-js/sdk/server` ExecutionEventBus (only what the executor uses). */
interface ExecutionEventBus { publish(event: A2AEvent): void; finished(): void }
/** Mirror of `@a2a-js/sdk/server` RequestContext (only what the executor uses). */
interface RequestContext { taskId: string; contextId: string; userMessage: Message }

// ─────────────────────────────────────────────────────────────────────────────
// Backend seam — mirror of agents/migration-agent/src/backends/types.ts
// ─────────────────────────────────────────────────────────────────────────────
interface MigrationRunPayload {
  sourceType: "pdf" | "webpage";
  sourceLocation: string;
  site: string;
  owner: string;
  pageSlug: string;
  folderPostfix?: string;
  backend?: "makecom" | "sdk" | "opencode" | "dryrun";
  runId?: string;
  labels?: Record<string, string>;
}
interface MigrationResult {
  pageUrl: string;
  previewUrl: string;
  status: "PASS" | "NEEDS-REFINEMENT" | "FAIL";
  confidence: number;
  blocksUsed: string[];
  refinementIterations: number;
  gaps: string[];
  backend: string;
}
interface BackendContext { taskId: string; onProgress: (note: string) => void }
interface MigrationBackend {
  readonly name: string;
  assertConfigured(): void;
  run(payload: MigrationRunPayload, ctx: BackendContext): Promise<MigrationResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// opencode serve plumbing (proven in run-via-serve.ts)
// ─────────────────────────────────────────────────────────────────────────────
const HOST = "127.0.0.1";
const PORT = Number(process.env.OPENCODE_PORT ?? 47821);
const BASE = `http://${HOST}:${PORT}`;
const MODEL = { providerID: "kimi-code", modelID: "kimi-for-coding" }; // "Kimi for Coding (K2.6)"

function opencodeBin(): string {
  return process.env.OPENCODE_BIN ?? path.join(os.homedir(), ".opencode", "bin", "opencode");
}

function spawnServer(): Promise<ChildProcess> {
  const proc = spawn(opencodeBin(), ["serve", "--port", String(PORT), "--hostname", HOST], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    const onData = (b: Buffer) => {
      if (!settled && /listening on/i.test(b.toString().replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, ""))) {
        settled = true;
        resolve(proc);
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("exit", (c) => !settled && reject(new Error(`opencode serve exited early (${c})`)));
    setTimeout(() => !settled && reject(new Error("timed out waiting for opencode serve")), 30_000);
  });
}

async function askK2_6(prompt: string): Promise<string> {
  const session = await (await fetch(`${BASE}/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "a2a-backend-poc" }),
  })).json();
  const message = await (await fetch(`${BASE}/session/${session.id}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...MODEL, parts: [{ type: "text", text: prompt }] }),
  })).json();
  return (message.parts ?? [])
    .filter((p: { type: string; text?: string }) => p.type === "text" && typeof p.text === "string")
    .map((p: { text: string }) => p.text)
    .join("")
    .trim();
}

/** Pull the first JSON object out of an LLM reply (may be fenced / prose-wrapped). */
function parseJsonObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`no JSON object in model reply:\n${text.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1));
}

// ─────────────────────────────────────────────────────────────────────────────
// THE BACKEND — lifts into agents/migration-agent/src/backends/opencode.ts
// (real version: long-lived shared `opencode serve`, MCP da.live tools + skill,
//  iterative author→validate loop. PoC: one K2.6 turn that plans the migration.)
// ─────────────────────────────────────────────────────────────────────────────
const opencodeKimiBackend: MigrationBackend = {
  name: "opencode",

  assertConfigured() {
    if (!process.env.MOONSHOT_API_KEY) {
      throw new Error("opencode backend needs MOONSHOT_API_KEY (Kimi-For-Coding key) — `source ~/.zshrc`");
    }
  },

  async run(payload, { onProgress }): Promise<MigrationResult> {
    const folder = `migration-batch-opencode${payload.folderPostfix ? `-${payload.folderPostfix}` : ""}`;
    const base = `${payload.owner}/${payload.site}/${folder}/${payload.pageSlug}`;

    onProgress(`opencode/K2.6: analyzing ${payload.sourceType} ${payload.sourceLocation}`);
    const reply = await askK2_6(
      "You are an EDS (Adobe Edge Delivery Services) migration planner. Given this migration.run task, " +
        "decide which EDS blocks the page needs and your confidence (0-100). " +
        "Reply with ONLY a JSON object: " +
        `{"blocksUsed": string[], "confidence": number, "gaps": string[]}.\n\n` +
        `Task: ${JSON.stringify({ sourceType: payload.sourceType, sourceLocation: payload.sourceLocation, pageSlug: payload.pageSlug })}`
    );
    onProgress("opencode/K2.6: plan received, assembling result");

    const plan = parseJsonObject(reply);
    const confidence = Math.max(0, Math.min(100, Number(plan.confidence) || 0));
    const blocksUsed = Array.isArray(plan.blocksUsed) ? (plan.blocksUsed as string[]) : [];
    const gaps = Array.isArray(plan.gaps) ? (plan.gaps as string[]) : [];

    return {
      pageUrl: `https://da.live/edit#/${base}`,
      previewUrl: payload.sourceLocation, // PoC: real backend returns the authored aem.page preview
      status: confidence >= 85 ? "PASS" : confidence >= 60 ? "NEEDS-REFINEMENT" : "FAIL",
      confidence,
      blocksUsed,
      refinementIterations: 1,
      gaps,
      backend: "opencode",
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// THE EXECUTOR — mirror of migrationExecutor.execute (agents/migration-agent)
// ─────────────────────────────────────────────────────────────────────────────
function extractPayload(message: Message): MigrationRunPayload {
  for (const part of message.parts) {
    if (part.kind === "data") return part.data as unknown as MigrationRunPayload;
    if (part.kind === "text") {
      try { return JSON.parse(part.text) as MigrationRunPayload; } catch { /* keep looking */ }
    }
  }
  throw new Error("migration.run payload not found: send a data part matching migration.run.v1");
}

async function runExecutor(ctx: RequestContext, bus: ExecutionEventBus, backend: MigrationBackend): Promise<void> {
  const { taskId, contextId, userMessage } = ctx;
  const status = (state: TaskState, text?: string, final = false): StatusUpdateEvent => ({
    kind: "status-update",
    taskId,
    contextId,
    status: {
      state,
      timestamp: new Date().toISOString(),
      ...(text ? { message: { kind: "message", messageId: randomUUID(), role: "agent", parts: [{ kind: "text", text }], taskId, contextId } } : {}),
    },
    final,
  });

  bus.publish({ kind: "task", id: taskId, contextId, status: { state: "submitted", timestamp: new Date().toISOString() }, history: [userMessage] });

  try {
    const payload = extractPayload(userMessage);
    backend.assertConfigured();
    bus.publish(status("working", `migration started (backend: ${backend.name})`));

    const result = await backend.run(payload, { taskId, onProgress: (note) => bus.publish(status("working", note)) });

    bus.publish({
      kind: "artifact-update",
      taskId,
      contextId,
      artifact: { artifactId: randomUUID(), name: "migration-report", parts: [{ kind: "data", data: result as unknown as Record<string, unknown> }] },
    });
    bus.publish(status("completed", undefined, true));
  } catch (err) {
    bus.publish(status("failed", String(err), true));
  } finally {
    bus.finished();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PoC harness: a console event bus + a synthetic migration.run task.
// In production the SDK supplies the bus and builds RequestContext from /a2a.
// ─────────────────────────────────────────────────────────────────────────────
function consoleBus(): ExecutionEventBus & { done: Promise<void> } {
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  return {
    done,
    publish(event) {
      if (event.kind === "task") console.log(`  ↳ [task]   state=${event.status.state}`);
      else if (event.kind === "status-update") console.log(`  ↳ [status] state=${event.status.state}${event.status.message ? `  "${(event.status.message.parts[0] as { text: string }).text}"` : ""}${event.final ? "  (final)" : ""}`);
      else console.log(`  ↳ [artifact] ${event.artifact.name}: ${JSON.stringify((event.artifact.parts[0] as { data: unknown }).data)}`);
    },
    finished() { resolve(); },
  };
}

async function main() {
  console.log("=== opencode + Kimi K2.6 as an A2A migration backend (light PoC) ===\n");

  const task: MigrationRunPayload = {
    sourceType: "webpage",
    sourceLocation: "https://example.com/about",
    site: "demo-site",
    owner: "jackzhaojin",
    pageSlug: "about",
    backend: "opencode",
    folderPostfix: "poc",
  };

  // pre-flight config check before paying for a server spawn
  opencodeKimiBackend.assertConfigured();

  console.log("[*] spawning opencode serve ...");
  const proc = await spawnServer();
  console.log("[*] server up\n");

  const ctx: RequestContext = {
    taskId: randomUUID(),
    contextId: randomUUID(),
    userMessage: { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data: task as unknown as Record<string, unknown> }] },
  };

  console.log(`[A2A] message/send  taskId=${ctx.taskId.slice(0, 8)} contextId=${ctx.contextId.slice(0, 8)}`);
  console.log(`[A2A] migration.run payload: ${JSON.stringify(task)}\n`);

  const bus = consoleBus();
  try {
    await runExecutor(ctx, bus, opencodeKimiBackend);
    await bus.done;
  } finally {
    proc.kill("SIGTERM");
  }
  console.log("\n[*] done — this event sequence is exactly what agents/migration-agent emits over A2A.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
