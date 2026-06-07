import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Message, Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

function migrationMessage(data: Record<string, unknown>): Message {
  return { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] };
}

async function runToTerminal(url: string, data: Record<string, unknown>) {
  const client = await new ClientFactory().createFromUrl(url);
  let finalState = "";
  let finalNote = "";
  let artifact: Record<string, unknown> | undefined;
  const notes: string[] = [];
  for await (const event of client.sendMessageStream({ message: migrationMessage(data) })) {
    if (event.kind === "status-update") {
      const e = event as TaskStatusUpdateEvent;
      const note = e.status.message?.parts.find((p) => p.kind === "text")?.text ?? "";
      if (note) notes.push(note);
      if (e.final) {
        finalState = e.status.state;
        finalNote = note;
      }
    }
    if (event.kind === "artifact-update") {
      const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
      if (part?.kind === "data") artifact = part.data as Record<string, unknown>;
    }
  }
  return { finalState, finalNote, artifact, notes };
}

// Migration facade (PRD part-5): one card, one contract, swappable backends.
describe("migration agent (facade + backend seam)", () => {
  let agent: AgentHandle;
  const VALID = {
    sourceType: "webpage",
    sourceLocation: "https://example.com/legacy-page",
    site: "demo-site",
    owner: "jackzhaojin",
    pageSlug: "legacy-page",
    folderPostfix: "e2e",
  };

  beforeAll(async () => {
    agent = await startAgent("migration-agent", 14111);
  });

  afterAll(async () => {
    await stopAgent(agent);
  });

  it("serves the card with migration.run", async () => {
    const card = await (await fetch(`${agent.url}/.well-known/agent-card.json`)).json();
    expect(card.name).toBe("da-migration-agent");
    expect(card.skills.map((s: { id: string }) => s.id)).toContain("migration.run");
  });

  it("dryrun backend completes with the full migration-report contract", async () => {
    const { finalState, artifact, notes } = await runToTerminal(agent.url, { ...VALID, backend: "dryrun" });
    expect(finalState).toBe("completed");
    expect(notes.some((n) => n.includes("backend: dryrun"))).toBe(true);

    // the artifact mirrors the Make.com final-report contract exactly
    expect(artifact!.pageUrl).toContain("da.live/edit#/jackzhaojin/demo-site/");
    expect(artifact!.previewUrl).toBe(VALID.sourceLocation); // dryrun = perfect simulated migration
    expect(["PASS", "NEEDS-REFINEMENT", "FAIL"]).toContain(artifact!.status);
    expect(artifact!.confidence).toBeGreaterThanOrEqual(80);
    expect(Array.isArray(artifact!.blocksUsed)).toBe(true);
    expect(artifact!.backend).toBe("dryrun");
  });

  it("dryrun is deterministic per slug (variance experiments stay interpretable)", async () => {
    const a = await runToTerminal(agent.url, { ...VALID, backend: "dryrun" });
    const b = await runToTerminal(agent.url, { ...VALID, backend: "dryrun" });
    expect(a.artifact!.confidence).toBe(b.artifact!.confidence);
  });

  it("makecom backend fails cleanly with a setup hint (tunnel not configured)", async () => {
    const { finalState, finalNote } = await runToTerminal(agent.url, { ...VALID, backend: "makecom" });
    expect(finalState).toBe("failed");
    expect(finalNote).toContain("MAKECOM_WEBHOOK_URL");
  });

  it("rejects unknown backends and invalid payloads", async () => {
    const unknown = await runToTerminal(agent.url, { ...VALID, backend: "quantum" });
    expect(unknown.finalState).toBe("failed");
    expect(unknown.finalNote).toContain("unknown backend");

    const invalid = await runToTerminal(agent.url, { sourceType: "webpage", site: "x" });
    expect(invalid.finalState).toBe("failed");
    expect(invalid.finalNote).toContain("sourceLocation");
  });
});
