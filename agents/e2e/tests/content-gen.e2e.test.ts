import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Message, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

function dataMessage(data: Record<string, unknown>): Message {
  return { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] };
}

async function runSkill(url: string, data: Record<string, unknown>) {
  const client = await new ClientFactory().createFromUrl(url);
  let finalState = "";
  let artifactName = "";
  let artifact: Record<string, never> | undefined;
  for await (const event of client.sendMessageStream({ message: dataMessage(data) })) {
    if (event.kind === "status-update" && (event as TaskStatusUpdateEvent).final) finalState = event.status.state;
    if (event.kind === "artifact-update") {
      const a = (event as TaskArtifactUpdateEvent).artifact;
      artifactName = a.name ?? "";
      if (a.parts[0]?.kind === "data") artifact = a.parts[0].data as never;
    }
  }
  return { finalState, artifactName, artifact };
}

// Content generator (PRD part-4): two skills, one server. Template tier now;
// the Agent SDK backend swaps in behind the same artifact shapes at M3.
describe("content-gen: brief + synthesize-source", () => {
  let agent: AgentHandle;

  beforeAll(async () => {
    agent = await startAgent("content-gen", 14121);
  });

  afterAll(async () => {
    await stopAgent(agent);
  });

  it("serves both skills on the card", async () => {
    const card = await (await fetch(`${agent.url}/.well-known/agent-card.json`)).json();
    const ids = card.skills.map((s: { id: string }) => s.id);
    expect(ids).toContain("content.brief");
    expect(ids).toContain("content.synthesize-source");
  });

  it("content.brief produces a structured brief with EDS block targets", async () => {
    const { finalState, artifactName, artifact } = await runSkill(agent.url, {
      skill: "content.brief",
      topic: "alpine touring bindings buying guide",
      pageType: "article",
      constraints: { imageCount: 3 },
    });
    expect(finalState).toBe("completed");
    expect(artifactName).toBe("content-brief");
    const brief = (artifact as { brief: Record<string, never> }).brief as {
      title: string;
      outline: Array<{ heading: string; targetBlock: string }>;
      copyBlocks: unknown[];
      imageDirections: unknown[];
      generator: string;
    };
    expect(brief.title).toBe("Alpine Touring Bindings Buying Guide");
    expect(brief.outline.length).toBeGreaterThanOrEqual(4);
    expect(brief.outline.every((s) => s.targetBlock)).toBe(true); // EDS block per section
    expect(brief.imageDirections.length).toBe(3);
    expect(brief.generator).toBe("template");
  });

  it("content.synthesize-source publishes fetchable legacy HTML with groundTruth", async () => {
    const { finalState, artifactName, artifact } = await runSkill(agent.url, {
      skill: "content.synthesize-source",
      topic: "vintage road bike restoration",
      legacyStyle: "messy",
    });
    expect(finalState).toBe("completed");
    expect(artifactName).toBe("synthetic-source");
    const data = artifact as unknown as {
      sourceUrl: string;
      legacyStyle: string;
      groundTruth: { title: string; headings: string[]; imageAlts: string[]; bodyText: string };
    };
    expect(data.legacyStyle).toBe("messy");
    expect(data.groundTruth.headings.length).toBeGreaterThanOrEqual(4);

    // the synthetic source is REALLY served — this is what migration backends will fetch
    const page = await fetch(data.sourceUrl);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<title>Vintage Road Bike Restoration</title>");
    expect(html).toContain("style="); // messy = inline styles
    for (const h of data.groundTruth.headings) expect(html).toContain(h); // groundTruth is truthful
  });

  it("skill inference: legacyStyle implies synthesize-source", async () => {
    const { finalState, artifactName } = await runSkill(agent.url, {
      topic: "garden composting basics",
      legacyStyle: "dated",
    });
    expect(finalState).toBe("completed");
    expect(artifactName).toBe("synthetic-source");
  });
});

// First two-agent composition: generated source feeds a migration. The closed
// loop's first two stages, running locally with zero external dependencies.
describe("chain: synthesize-source → migration (dryrun)", () => {
  let contentGen: AgentHandle;
  let migration: AgentHandle;

  beforeAll(async () => {
    [contentGen, migration] = await Promise.all([
      startAgent("content-gen", 14122),
      startAgent("migration-agent", 14123),
    ]);
  });

  afterAll(async () => {
    await Promise.all([stopAgent(contentGen), stopAgent(migration)]);
  });

  it("migrates a freshly synthesized source end-to-end", async () => {
    const synth = await runSkill(contentGen.url, {
      skill: "content.synthesize-source",
      topic: "sourdough starter troubleshooting",
      legacyStyle: "dated",
    });
    expect(synth.finalState).toBe("completed");
    const sourceUrl = (synth.artifact as unknown as { sourceUrl: string }).sourceUrl;

    const migrated = await runSkill(migration.url, {
      sourceType: "webpage",
      sourceLocation: sourceUrl, // ← the generated page, fetched over real HTTP
      site: "demo-site",
      owner: "jackzhaojin",
      pageSlug: "sourdough-starter-troubleshooting",
      backend: "dryrun",
    });
    expect(migrated.finalState).toBe("completed");
    const report = migrated.artifact as unknown as { previewUrl: string; status: string };
    expect(report.previewUrl).toContain("sourdough-starter-troubleshooting");
    expect(["PASS", "NEEDS-REFINEMENT"]).toContain(report.status);
  });
});
