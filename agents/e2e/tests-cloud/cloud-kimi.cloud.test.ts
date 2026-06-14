import { describe, it, expect } from "vitest";
import { meshClientFactory } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";

/**
 * Cloud tier 2 — THE acceptance: the full closed loop on Cloudflare with the
 * REAL backends. content-gen synthesizes a legacy page (R2), the migration
 * container drives Kimi K2.6 (opencode serve) to author a REAL da.live page,
 * and the eval container scores the published preview with the real engine.
 *
 * Opt-in (writes to da.live, spends a K2.6 turn): needs DALIVE_TEST_OWNER +
 * DALIVE_TEST_SITE in addition to the mesh token.
 */

const COORDINATOR = process.env.CLOUD_COORDINATOR_URL ?? "https://content-factory.jackzhaojin.com";
const MESH_TOKEN = process.env.A2A_MESH_TOKEN;
const EDGE_TOKEN = process.env.A2A_EDGE_TOKEN || MESH_TOKEN;
const SITE = process.env.DALIVE_TEST_SITE;
const OWNER = process.env.DALIVE_TEST_OWNER;

describe.skipIf(!MESH_TOKEN || !SITE || !OWNER)("cloud closed loop: Kimi K2.6 + real eval", () => {
  it("full-loop with backend=opencode authors a real da.live page and scores it", async () => {
    const topic = `content factory cloud ${randomUUID().slice(0, 6)}`;
    const client = await meshClientFactory().createFromUrl(COORDINATOR);
    let contextId = "";
    let finalState = "";
    const notes: string[] = [];
    let stats: {
      completed?: number;
      overall?: { mean: number };
      branchResults?: Array<{
        target?: string;
        overallScore?: number;
        dimensionScores?: Record<string, number>;
        confidence?: number;
        stages?: Array<{ stage: string; state: string }>;
      }>;
    } = {};

    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [
          {
            kind: "data",
            data: { goal: "full-loop", topic, fanOut: 1, backend: "opencode", site: SITE, owner: OWNER },
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

    // surfacing the live trail on failure makes cloud debugging possible
    const trail = notes.slice(-15).join("\n");
    expect(finalState, `final state. trail:\n${trail}`).toBe("completed");
    expect(stats.completed, `completed branches. trail:\n${trail}`).toBe(1);

    const branch = stats.branchResults![0];
    // Kimi authored a REAL page: the eval target must be a published preview URL
    expect(branch.target, "preview URL").toMatch(/^https:\/\/.+\.aem\.page\//);
    // all three stages ran
    expect(branch.stages?.map((s) => `${s.stage}:${s.state}`)).toEqual([
      "generate:completed",
      "migrate:completed",
      "evaluate:completed",
    ]);
    // the real engine scored all four dimensions
    expect(Object.keys(branch.dimensionScores ?? {}).sort()).toEqual([
      "accessibility",
      "content",
      "structure",
      "visual",
    ]);
    expect(branch.overallScore).toBeGreaterThan(0);

    // and the run is durable in D1 with the full progress trail
    const res = await fetch(`${COORDINATOR}/store/runs?contextId=${encodeURIComponent(contextId)}`, {
      headers: { Authorization: `Bearer ${EDGE_TOKEN}` },
    });
    const { run } = (await res.json()) as { run: { id: string; status: string } | null };
    expect(run?.status).toBe("completed");
  });
});
