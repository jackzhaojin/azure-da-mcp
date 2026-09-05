import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import {
  htmlToMemoryText,
  appendMemoryEntry,
  countMemoryEntries,
  memoryPromptExcerpt,
  memorySourcePath,
  memoryEditUrl,
  EMPTY_MEMORY_HTML,
} from "@agents/a2a-common";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// The agent-memory loop (v2.9): the da.live page the migration agent reads
// before a run and the eval agent (eval.reflect) appends to after a scored run.
// This tier never touches the real page: DALIVE_MCP_URL is stripped from spawned
// agents, so the read reports "skipped" and the stub eval engine reflects at $0.

const MEMORY_PATH = "/source/jackzhaojin/adapt-to-2026-demo/ai-content/memory.html";

// The exact shape da.live returned for the seeded page (2026-09-05).
const SEEDED_HTML =
  '\n<body>\n  <header></header>\n  <main><div><p>Block library is at <a href="https://main--adapt-to-2026-demo--jackzhaojin.aem.page/ai-content/blocks/">https://main--adapt-to-2026-demo--jackzhaojin.aem.page/ai-content/blocks/</a></p></div></main>\n  <footer></footer>\n</body>\n';

async function runToTerminal(url: string, data: Record<string, unknown>) {
  const client = await new ClientFactory().createFromUrl(url);
  let finalState = "";
  let finalNote = "";
  let artifact: Record<string, unknown> | undefined;
  const notes: string[] = [];
  for await (const event of client.sendMessageStream({
    message: { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] },
  })) {
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

describe("agent memory: page format (a2a-common/memory)", () => {
  it("derives the da.live source path + edit URL from a site-relative page", () => {
    expect(memorySourcePath("jackzhaojin", "adapt-to-2026-demo", "ai-content/memory")).toBe(MEMORY_PATH);
    expect(memorySourcePath("o", "s", "/ai-content/memory.html")).toBe("/source/o/s/ai-content/memory.html");
    expect(memoryEditUrl(MEMORY_PATH)).toBe("https://da.live/edit#/jackzhaojin/adapt-to-2026-demo/ai-content/memory");
  });

  it("renders the seeded page as prompt text (links kept, tags gone)", () => {
    const text = htmlToMemoryText(SEEDED_HTML);
    expect(text).toBe("Block library is at https://main--adapt-to-2026-demo--jackzhaojin.aem.page/ai-content/blocks/");
    expect(countMemoryEntries(SEEDED_HTML)).toBe(0);
  });

  it("appends an entry as a new section without touching existing bytes, and reads it back", () => {
    const next = appendMemoryEntry(SEEDED_HTML, {
      date: "2026-09-05",
      runId: "abcd1234",
      title: "alpine-lake-circuit",
      via: "k3 via opencode",
      scoreLine: "Score 82 (structure 90 · visual 72) · migration PASS 90%",
      links: [{ text: "preview", href: "https://example.com/p" }],
      summary: "Solid run; visual lagged on the hero & <img>.",
      lessons: ["Put the byline inside the hero block.", "Use a stats band for trail figures."],
    });
    // every original byte survives, in order, and the entry lands inside <main>
    const originalBody = SEEDED_HTML.split("</main>")[0];
    expect(next.startsWith(originalBody)).toBe(true);
    expect(next).toContain("</div>\n</main>");
    expect(next).toContain("<h3>2026-09-05 · Run abcd1234 · alpine-lake-circuit (k3 via opencode)</h3>");
    expect(next).toContain("<li>Rule: Put the byline inside the hero block.</li>");
    expect(next).toContain("&amp; &lt;img&gt;"); // escaped, never raw HTML injection
    expect(countMemoryEntries(next)).toBe(1);

    const text = htmlToMemoryText(next);
    expect(text).toContain("### 2026-09-05 · Run abcd1234");
    expect(text).toContain("- Rule: Use a stats band for trail figures.");
    expect(text).toContain("preview (https://example.com/p)");
    expect(text).toContain("\n---\n"); // section boundary between the preamble and the entry

    // a second entry appends AFTER the first (chronological, append-only)
    const third = appendMemoryEntry(next, { date: "2026-09-06", runId: "eeee0000", title: "ridge-walk", lessons: [] });
    expect(countMemoryEntries(third)).toBe(2);
    expect(third.indexOf("Run abcd1234")).toBeLessThan(third.indexOf("Run eeee0000"));
    expect(third).toContain("No new rules");
  });

  it("creates the document from nothing on a first run (missing page)", () => {
    const html = appendMemoryEntry("", { date: "2026-09-05", runId: "11112222", title: "first", lessons: ["Rule one."] });
    expect(html).toContain(EMPTY_MEMORY_HTML.trim().split("\n")[0]); // <body>
    expect(html).toMatch(/<main>[\s\S]*<h3>2026-09-05 · Run 11112222 · first<\/h3>[\s\S]*<\/main>/);
  });

  it("excerpts a long page by keeping the human preamble and the newest entries", () => {
    let html = SEEDED_HTML;
    for (let i = 0; i < 60; i++) {
      html = appendMemoryEntry(html, {
        date: "2026-09-05",
        runId: `run${String(i).padStart(5, "0")}`,
        title: `page-${i}`,
        scoreLine: "Score 80 (structure 90 · accessibility 85 · content 80 · visual 65) · migration PASS 88%",
        lessons: [
          `Lesson number ${i} about hero images that is reasonably long to fill the page up.`,
          `Lesson number ${i} about metadata blocks that is reasonably long to fill the page up.`,
        ],
      });
    }
    const text = htmlToMemoryText(html);
    expect(text.length).toBeGreaterThan(15_000);
    const excerpt = memoryPromptExcerpt(text, 7000);
    expect(excerpt.length).toBeLessThan(7200);
    expect(excerpt.startsWith("Block library is at")).toBe(true); // preamble kept
    expect(excerpt).toContain("Run run00059"); // newest kept
    expect(excerpt).toContain("older memory entries omitted");
    expect(excerpt).not.toContain("Run run00030"); // the middle is what gets elided
  });
});

describe("agent memory: migration read + eval.reflect (spawned agents, $0)", () => {
  let migration: AgentHandle;
  let evalStub: AgentHandle;

  beforeAll(async () => {
    [migration, evalStub] = await Promise.all([
      startAgent("migration-agent", 14161),
      startAgent("eval-service", 14162, { env: { EVAL_ENGINE: "stub" } }),
    ]);
  });

  afterAll(async () => {
    await Promise.all([stopAgent(migration), stopAgent(evalStub)]);
  });

  it("migration.run with memoryPath reports the memory read on the artifact (skipped here: no DALIVE_MCP_URL)", async () => {
    const { finalState, artifact, notes } = await runToTerminal(migration.url, {
      sourceType: "webpage",
      sourceLocation: "https://example.com/legacy",
      site: "adapt-to-2026-demo",
      owner: "jackzhaojin",
      pageSlug: "memory-read-probe",
      backend: "dryrun",
      memoryPath: MEMORY_PATH,
    });
    expect(finalState).toBe("completed");
    const memory = artifact?.memory as { status: string; path: string; reason?: string; editUrl?: string };
    expect(memory.status).toBe("skipped");
    expect(memory.path).toBe(MEMORY_PATH);
    expect(memory.reason).toContain("DALIVE_MCP_URL");
    expect(memory.editUrl).toBe("https://da.live/edit#/jackzhaojin/adapt-to-2026-demo/ai-content/memory");
    expect(artifact?.lessons).toEqual([]); // a simulated migration learns nothing
    expect(notes.some((n) => n.startsWith("memory: skipped"))).toBe(true);
  });

  it("migration.run without memoryPath carries memory: null (feature is opt-in per run)", async () => {
    const { finalState, artifact } = await runToTerminal(migration.url, {
      sourceType: "webpage",
      sourceLocation: "https://example.com/legacy",
      site: "demo-site",
      owner: "jackzhaojin",
      pageSlug: "no-memory",
      backend: "dryrun",
    });
    expect(finalState).toBe("completed");
    expect(artifact?.memory).toBeNull();
  });

  it("eval agent advertises eval.reflect and the stub reflects deterministically without writing", async () => {
    const card = (await (await fetch(`${evalStub.url}/.well-known/agent-card.json`)).json()) as { skills: Array<{ id: string }> };
    expect(card.skills.map((s) => s.id)).toContain("eval.reflect");

    const { finalState, artifact, notes } = await runToTerminal(evalStub.url, {
      skill: "eval.reflect",
      site: "adapt-to-2026-demo",
      owner: "jackzhaojin",
      memoryPath: MEMORY_PATH,
      runId: randomUUID(),
      branches: [
        {
          branch: 1,
          pageSlug: "alpine-lake-circuit",
          migration: {
            backend: "opencode",
            model: "k3",
            status: "PASS",
            confidence: 90,
            blocksUsed: ["hero", "stats"],
            gaps: [],
            lessons: ["Set Theme: paper in the metadata block or the serif styling silently no-ops."],
          },
          eval: {
            overallScore: 81,
            dimensionScores: { structure: 90, accessibility: 85, content: 80, visual: 70 },
            findings: [
              { dimension: "visual", severity: "serious", issue: "Hero image is 600px wide", recommendation: "Use a hero image at least 1200px wide." },
              { dimension: "accessibility", severity: "minor", issue: "Minor contrast issue", recommendation: "Ignore me, I am minor." },
            ],
          },
        },
      ],
    });
    expect(finalState).toBe("completed");
    expect(artifact?.written).toBe(false);
    expect(artifact?.stub).toBe(true);
    expect(artifact?.tier).toBe("deterministic");
    expect(artifact?.path).toBe(MEMORY_PATH);
    // migrator lesson first, then the serious finding's recommendation; the minor one is dropped
    expect(artifact?.lessons).toEqual([
      "Set Theme: paper in the metadata block or the serif styling silently no-ops.",
      "Use a hero image at least 1200px wide.",
    ]);
    expect(notes.some((n) => n.startsWith("memory: stub"))).toBe(true);
  });

  it("eval.reflect validates its payload (bad memoryPath → failed with a hint)", async () => {
    const { finalState, finalNote } = await runToTerminal(evalStub.url, {
      skill: "eval.reflect",
      site: "s",
      owner: "o",
      memoryPath: "not-a-source-path",
      branches: [{ branch: 1 }],
    });
    expect(finalState).toBe("failed");
    expect(finalNote).toContain("memoryPath");
  });
});
