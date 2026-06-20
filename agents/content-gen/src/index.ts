import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, Message } from "@a2a-js/sdk";
import type { AgentExecutor, RequestContext, ExecutionEventBus } from "@a2a-js/sdk/server";
import { startAgentServer, createLogger, createArtifactStore } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";
import { synthesizeSource, type Brief } from "./generator.ts";
import { buildBrief, pickTopic, hasAgentAuth } from "./agentic.ts";

const log = createLogger("da-content-gen-agent");
const PORT = Number(process.env.PORT ?? 4002);
// Artifact storage: real Cloudflare R2 when its env is set, else a local
// filesystem stand-in served via staticRoutes. Same URL contract either way —
// synthetic sources are publicly fetchable by Make.com, migration backends, eval.
const LOCAL_PUBLIC_BASE = process.env.CONTENT_PUBLIC_BASE ?? `http://localhost:${PORT}/artifacts`;
const artifactStore = createArtifactStore({ localDir: "./output", localPublicBase: LOCAL_PUBLIC_BASE });

interface ContentPayload {
  skill?: "content.brief" | "content.synthesize-source" | "content.ideate";
  topic?: string;
  pageType?: string;
  siteBrief?: string;
  constraints?: { wordCount?: number; imageCount?: number };
  brief?: Brief;
  briefTaskId?: string;
  legacyStyle?: "clean" | "dated" | "messy";
  // content.ideate
  lane?: string;
  seed?: string;
  runId?: string;
}

function extractPayload(message: Message): ContentPayload {
  for (const part of message.parts) {
    if (part.kind === "data") return part.data as unknown as ContentPayload;
    if (part.kind === "text") {
      try {
        return JSON.parse(part.text) as ContentPayload;
      } catch {
        /* fall through — treat bare text as a topic */
        return { topic: part.text };
      }
    }
  }
  throw new Error("content payload not found");
}

/** Skill discrimination: explicit `skill` field, else inferred from payload shape. */
function resolveSkill(p: ContentPayload): "content.brief" | "content.synthesize-source" | "content.ideate" {
  if (p.skill) return p.skill;
  if (p.brief || p.briefTaskId || p.legacyStyle) return "content.synthesize-source";
  return "content.brief";
}

const contentGenExecutor: AgentExecutor = {
  async execute(ctx: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const { taskId, contextId, userMessage } = ctx;

    const status = (state: "working" | "completed" | "failed", text?: string, final = false): TaskStatusUpdateEvent => ({
      kind: "status-update",
      taskId,
      contextId,
      status: {
        state,
        timestamp: new Date().toISOString(),
        ...(text
          ? {
              message: {
                kind: "message" as const,
                messageId: randomUUID(),
                role: "agent" as const,
                parts: [{ kind: "text" as const, text }],
                taskId,
                contextId,
              },
            }
          : {}),
      },
      final,
    });

    bus.publish({
      kind: "task",
      id: taskId,
      contextId,
      status: { state: "submitted", timestamp: new Date().toISOString() },
      history: [userMessage],
    } satisfies Task);

    try {
      const payload = extractPayload(userMessage);
      const skill = resolveSkill(payload);
      log.info(`${skill} received`, { a2a_task_id: taskId, context_id: contextId });

      if (skill === "content.ideate") {
        // Agent-led topic selection — the mesh picks what to write about today.
        // Agentic editor when creds exist (a fresh, compelling angle), else the
        // deterministic lane picker (reproducible, $0, no-flake for the cron loop).
        bus.publish(status("working", `ideating a topic${payload.lane ? ` (lane: ${payload.lane})` : ""}${hasAgentAuth() ? " (agentic)" : ""}`));
        const { topic: ideated, via } = await pickTopic({ lane: payload.lane, seed: payload.seed });
        bus.publish(status("working", `picked (${via}): ${ideated.topic}`));
        bus.publish({
          kind: "artifact-update",
          taskId,
          contextId,
          artifact: {
            artifactId: randomUUID(),
            name: "ideated-topic",
            parts: [{ kind: "data", data: ideated as unknown as Record<string, unknown> }],
          },
        } satisfies TaskArtifactUpdateEvent);
      } else if (skill === "content.brief") {
        if (!payload.topic) throw new Error("content.brief.v1: 'topic' is required");
        bus.publish(status("working", `generating brief: ${payload.topic} (${hasAgentAuth() ? "agentic" : "template tier"})`));
        const { brief, via, note } = await buildBrief({
          topic: payload.topic,
          pageType: payload.pageType,
          siteBrief: payload.siteBrief,
          constraints: payload.constraints,
        });
        if (note) log.warn(note, { a2a_task_id: taskId });
        bus.publish(status("working", `brief ready (${via}): "${brief.title}" — ${brief.outline.length} sections`));
        bus.publish({
          kind: "artifact-update",
          taskId,
          contextId,
          artifact: {
            artifactId: randomUUID(),
            name: "content-brief",
            parts: [{ kind: "data", data: { brief } as unknown as Record<string, unknown> }],
          },
        } satisfies TaskArtifactUpdateEvent);
      } else {
        // content.synthesize-source — an inline brief wins; otherwise write one
        // from the topic (agentic when creds exist, deterministic template else).
        let brief = payload.brief;
        if (!brief) {
          if (!payload.topic) {
            throw new Error(
              "content.synthesize-source.v1: provide 'brief' (inline) or 'topic' ('briefTaskId' reuse lands later)"
            );
          }
          bus.publish(status("working", `writing source content for "${payload.topic}" (${hasAgentAuth() ? "agentic" : "template tier"})`));
          const built = await buildBrief({ topic: payload.topic, pageType: payload.pageType, siteBrief: payload.siteBrief, constraints: payload.constraints });
          if (built.note) log.warn(built.note, { a2a_task_id: taskId });
          brief = built.brief;
          bus.publish(status("working", `content ready (${built.via}): "${brief.title}" — ${brief.outline.length} sections`));
        }
        const legacyStyle = payload.legacyStyle ?? "dated";
        bus.publish(status("working", `synthesizing ${legacyStyle} legacy source: ${brief.title}`));

        const source = synthesizeSource(brief, legacyStyle);
        const key = `sources/${taskId}.html`;
        const sourceUrl = await artifactStore.put({ key, body: source.html, contentType: "text/html" });

        bus.publish({
          kind: "artifact-update",
          taskId,
          contextId,
          artifact: {
            artifactId: randomUUID(),
            name: "synthetic-source",
            parts: [
              {
                kind: "data",
                data: {
                  sourceUrl,
                  groundTruth: source.groundTruth,
                  legacyStyle,
                  artifacts: [{ type: "source-html", path: key, storage: artifactStore.kind }],
                } as unknown as Record<string, unknown>,
              },
            ],
          },
        } satisfies TaskArtifactUpdateEvent);
      }

      bus.publish(status("completed", undefined, true));
      log.info(`${skill} completed`, { a2a_task_id: taskId });
    } catch (err) {
      bus.publish(status("failed", String(err), true));
      log.error("content task failed", { a2a_task_id: taskId, error: String(err) });
    } finally {
      bus.finished();
    }
  },

  async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
    bus.publish({
      kind: "status-update",
      taskId,
      contextId: "",
      status: { state: "canceled", timestamp: new Date().toISOString() },
      final: true,
    } satisfies TaskStatusUpdateEvent);
    bus.finished();
  },
};

await startAgentServer({
  name: "da-content-gen-agent",
  description:
    "Generates content briefs and synthetic 'legacy' source pages (template tier now; Claude Agent SDK backend at M3). Sources stored at a public URL — Cloudflare R2 when configured, else a local static stand-in.",
  port: PORT,
  dbPath: process.env.STORE_DB_PATH ?? "./data/store.db",
  shimAgentId: "content-gen",
  // local stand-in for the R2 public bucket; unused (but harmless) when R2 is configured
  staticRoutes: [{ route: "/artifacts", dir: "./output" }],
  skills: [
    {
      id: "content.ideate",
      name: "Ideate a topic",
      description:
        "Pick a fresh on-lane topic for the day (deterministic per lane+seed; agent-led initiation). Contract: content.ideate.v1",
      tags: ["content", "ideation", "agent-led"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
    {
      id: "content.brief",
      name: "Generate content brief",
      description: "Produce a structured content brief (outline, copy blocks, target EDS blocks). Contract: content.brief.v1",
      tags: ["content"],
      inputModes: ["application/json", "text/plain"],
      outputModes: ["application/json"],
    },
    {
      id: "content.synthesize-source",
      name: "Synthesize legacy source page",
      description:
        "Generate a standalone synthetic 'legacy' HTML page (clean|dated|messy) at a public URL, with groundTruth for eval. Contract: content.synthesize-source.v1",
      tags: ["content", "synthetic", "closed-loop"],
      inputModes: ["application/json"],
      outputModes: ["application/json"],
    },
  ],
  executor: contentGenExecutor,
});
