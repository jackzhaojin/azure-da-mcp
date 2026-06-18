import { describe, it, expect } from "vitest";
import { meshClientFactory } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";

/**
 * Cloud tier — the agent-led daily loop's NEW capability: a full-loop with NO
 * topic. The coordinator must ask content-gen (content.ideate) to pick one, then
 * run the pipeline, and the run must land as a SHARED system run (user_email
 * NULL) with the ideated topic written back into its config. This is exactly
 * what the GitHub Actions daily-content-loop submits (here on the cheap dryrun
 * backend so it costs no Kimi turn). The opencode acceptance lives in
 * cloud-kimi.cloud.test.ts.
 */

const COORDINATOR = process.env.CLOUD_COORDINATOR_URL ?? "https://content-factory.jackzhaojin.com";
const MESH_TOKEN = process.env.A2A_MESH_TOKEN;
const EDGE_TOKEN = process.env.A2A_EDGE_TOKEN || MESH_TOKEN;

describe.skipIf(!MESH_TOKEN)("cloud daily loop: agent-led ideation (no topic supplied)", () => {
  it("full-loop with NO topic ideates one, completes, and is a shared system run", async () => {
    const client = await meshClientFactory().createFromUrl(COORDINATOR);
    let contextId = "";
    let finalState = "";
    const notes: string[] = [];
    let stats: { completed?: number; branchResults?: Array<{ sourceUrl?: string }> } = {};

    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [
          {
            kind: "data",
            // NO topic — the agent-led front door. dryrun keeps it cheap.
            data: { goal: "full-loop", fanOut: 1, backend: "dryrun", labels: { source: "daily-loop-test" } },
          },
        ],
      },
    })) {
      if (event.kind === "task") contextId = event.contextId;
      if (event.kind === "status-update") {
        if (event.final) finalState = event.status.state;
        const note = event.status.message?.parts.find((p) => p.kind === "text")?.text;
        if (note) notes.push(note);
      }
      if (event.kind === "artifact-update") {
        const part = event.artifact.parts[0];
        if (part?.kind === "data") stats = part.data as typeof stats;
      }
    }

    const trail = notes.slice(-12).join("\n");
    expect(finalState, `final state. trail:\n${trail}`).toBe("completed");
    expect(stats.completed).toBe(1);
    // the coordinator announced the agent-led ideation
    expect(notes.some((n) => /ideat/i.test(n)), `expected an ideation note. trail:\n${trail}`).toBe(true);

    // durable in D1: completed, NULL owner (shared), with the ideated topic in config
    const res = await fetch(`${COORDINATOR}/store/runs?contextId=${encodeURIComponent(contextId)}`, {
      headers: { Authorization: `Bearer ${EDGE_TOKEN}` },
    });
    const { run } = (await res.json()) as {
      run: { status: string; userEmail: string | null; config: { topic?: string } } | null;
    };
    expect(run?.status).toBe("completed");
    expect(run?.userEmail).toBeNull(); // system run — visible to every dashboard user
    expect(typeof run?.config?.topic).toBe("string");
    expect((run?.config?.topic ?? "").length).toBeGreaterThan(8); // a real ideated topic
  });
});
