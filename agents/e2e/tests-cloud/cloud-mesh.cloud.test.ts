import { describe, it, expect } from "vitest";
import { meshClientFactory } from "@agents/a2a-common";
import { randomUUID } from "node:crypto";

/**
 * Cloud tier 1 — the deployed mesh is up and speaks A2A.
 *
 * Drives the real Cloudflare deployment (Workers + Containers) over the public
 * hostnames. First requests pay container cold starts (~5-30s each). Store
 * assertions go through the coordinator's /store/runs (edge token) — there is
 * no direct D1 access from tests, same as production consumers.
 */

const HOSTS = {
  coordinator: process.env.CLOUD_COORDINATOR_URL ?? "https://content-factory.jackzhaojin.com",
  eval: process.env.CLOUD_EVAL_URL ?? "https://content-factory-eval.jackzhaojin.com",
  gen: process.env.CLOUD_GEN_URL ?? "https://content-factory-gen.jackzhaojin.com",
  migrate: process.env.CLOUD_MIGRATE_URL ?? "https://content-factory-migrate.jackzhaojin.com",
};
const MESH_TOKEN = process.env.A2A_MESH_TOKEN;
const EDGE_TOKEN = process.env.A2A_EDGE_TOKEN || MESH_TOKEN;

describe.skipIf(!MESH_TOKEN)("cloud mesh: deployed agents on content-factory*.jackzhaojin.com", () => {
  it("all four agents are healthy and their cards advertise the public origin", async () => {
    for (const [name, base] of Object.entries(HOSTS)) {
      const health = await fetch(`${base}/health`);
      expect(health.status, `${name} /health`).toBe(200);
      const card = (await (await fetch(`${base}/.well-known/agent-card.json`)).json()) as { url: string; name: string };
      expect(card.url, `${name} card.url`).toBe(`${base}/a2a`);
    }
  }, 300_000);

  it("the A2A surface is mesh-token gated", async () => {
    const res = await fetch(`${HOSTS.coordinator}/a2a`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tasks/get", params: { id: "x" } }),
    });
    expect(res.status).toBe(401);
    const store = await fetch(`${HOSTS.coordinator}/store/runs`);
    expect(store.status).toBe(401);
  });

  it("dryrun full-loop completes in the cloud: D1 run row + R2 artifacts", async () => {
    const client = await meshClientFactory().createFromUrl(HOSTS.coordinator);
    let contextId = "";
    let finalState = "";
    let stats: { completed?: number; overall?: { mean: number }; branchResults?: Array<{ sourceUrl?: string }> } = {};

    for await (const event of client.sendMessageStream({
      message: {
        kind: "message",
        messageId: randomUUID(),
        role: "user",
        parts: [
          {
            kind: "data",
            data: { goal: "full-loop", topic: `cloud smoke ${randomUUID().slice(0, 8)}`, fanOut: 1, backend: "dryrun" },
          },
        ],
      },
    })) {
      if (event.kind === "task") contextId = event.contextId;
      if (event.kind === "status-update" && event.final) finalState = event.status.state;
      if (event.kind === "artifact-update") {
        const part = event.artifact.parts[0];
        if (part?.kind === "data") stats = part.data as typeof stats;
      }
    }

    expect(finalState).toBe("completed");
    expect(stats.completed).toBe(1);
    // content-gen wrote the synthetic source to R2 — the public URL proves it
    expect(stats.branchResults?.[0]?.sourceUrl).toContain("r2.dev");
    // eval really scored it (deterministic tier at minimum)
    expect(stats.overall!.mean).toBeGreaterThan(0);

    // the run row landed in D1, readable through the store surface
    const res = await fetch(`${HOSTS.coordinator}/store/runs?contextId=${encodeURIComponent(contextId)}`, {
      headers: { Authorization: `Bearer ${EDGE_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const { run } = (await res.json()) as {
      run: { status: string; userEmail: string | null; progress: unknown[] } | null;
    };
    expect(run).toBeTruthy();
    expect(run!.status).toBe("completed");
    expect(run!.userEmail).toBeNull(); // mesh-triggered = system run
    expect(run!.progress.length).toBeGreaterThan(0); // live notes persisted to D1
  });
});
