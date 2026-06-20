import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Message, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// The agentic content backend, FOR REAL: with a Claude token the content-gen
// agent writes a genuinely substantive brief + legacy source (not the template
// lorem). Creds-gated — auto-skips at $0 without a token, like the eval live tier.
const AI_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
const aiEnv = process.env.CLAUDE_CODE_OAUTH_TOKEN
  ? { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN }
  : { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "" };

function dataMessage(data: Record<string, unknown>): Message {
  return { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] };
}

async function runSkill(url: string, data: Record<string, unknown>) {
  const client = await new ClientFactory().createFromUrl(url);
  let finalState = "";
  let artifact: Record<string, never> | undefined;
  for await (const event of client.sendMessageStream({ message: dataMessage(data) })) {
    if (event.kind === "status-update" && (event as TaskStatusUpdateEvent).final) finalState = event.status.state;
    if (event.kind === "artifact-update") {
      const a = (event as TaskArtifactUpdateEvent).artifact;
      if (a.parts[0]?.kind === "data") artifact = a.parts[0].data as never;
    }
  }
  return { finalState, artifact };
}

describe.skipIf(!AI_TOKEN)("content-gen: agentic backend (real Claude)", () => {
  let agent: AgentHandle;

  beforeAll(async () => {
    agent = await startAgent("content-gen", 14181, { env: aiEnv });
  });
  afterAll(async () => {
    await stopAgent(agent);
  });

  it("content.brief writes a real, substantive brief (generator: agent-sdk)", async () => {
    const { finalState, artifact } = await runSkill(agent.url, {
      skill: "content.brief",
      topic: "cross-border e-commerce fulfillment for small merchants",
      pageType: "article",
    });
    expect(finalState).toBe("completed");
    const brief = (artifact as { brief: Record<string, never> }).brief as {
      title: string;
      dek?: string;
      outline: Array<{ heading: string; targetBlock: string }>;
      copyBlocks: Array<{ block: string; text: string }>;
      generator: string;
    };
    expect(brief.generator).toBe("agent-sdk");
    expect(brief.outline.length).toBeGreaterThanOrEqual(4);
    // Real prose: each section carries multiple sentences, not a lorem stub.
    for (const c of brief.copyBlocks) {
      expect(c.text.length).toBeGreaterThan(120);
      expect(c.text).not.toContain("placeholder copy");
    }
    // The headline is a real angle, not just the topic title-cased.
    expect(brief.title.toLowerCase()).not.toBe("cross-border e-commerce fulfillment for small merchants");
  }, 200_000);

  it("content.synthesize-source produces a fetchable, substantive legacy page", async () => {
    const { finalState, artifact } = await runSkill(agent.url, {
      skill: "content.synthesize-source",
      topic: "last-mile delivery route optimization",
      legacyStyle: "dated",
    });
    expect(finalState).toBe("completed");
    const data = artifact as unknown as { sourceUrl: string; groundTruth: { headings: string[]; bodyText: string } };
    expect(data.groundTruth.bodyText.length).toBeGreaterThan(600); // a real article, not a stub
    const html = await (await fetch(data.sourceUrl)).text();
    expect(html).toContain("<table"); // dated legacy chrome preserved
    for (const h of data.groundTruth.headings) expect(html).toContain(h); // groundTruth stays truthful
  }, 200_000);
});
