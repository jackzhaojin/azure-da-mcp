import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, Message } from "@a2a-js/sdk";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// Tier-2 evidence for the scoring-honesty fixes (hardening sprint):
//   1. sourceType none → content dimension is SKIPPED (excluded + renormalized),
//      not scored 0 at 25% weight.
//   2. an unreachable target FAILS its dimensions — visual must not report 100
//      for a page that never rendered (the old placeholder-screenshot false-100).
//   3. webpage source comparison survives full-page screenshots of different
//      heights (shared-region crop + size penalty) instead of silently
//      skipping the comparison and scoring 100.
// Real engine, real Chromium/axe; AI keys stripped → deterministic-only modes.
const NO_AI_ENV = {
  EVAL_ENGINE: "real",
  CLAUDE_CODE_OAUTH_TOKEN: "",
  ANTHROPIC_API_KEY: "",
  EVAL_MAX_ATTEMPTS: "1",
};

const FIXTURE_PORT = 14036;

const para = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<p>Paragraph ${i + 1}: the community workshop offers hands-on training in ceramics, woodworking and printmaking for all skill levels.</p>`
  ).join("\n");

const PAGES: Record<string, string> = {
  // tall source page (many paragraphs → tall full-page screenshot)
  "/source.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Community Workshop</title><meta name="viewport" content="width=device-width"></head>
<body><main><h1>Community Workshop</h1>${para(40)}</main></body></html>`,
  // short paraphrased target (few paragraphs → much shorter screenshot)
  "/target.html": `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Community Workshop</title><meta name="viewport" content="width=device-width"></head>
<body><main><h1>Community Workshop</h1><p>Our workshop runs hands-on ceramics and woodworking classes for beginners and experts alike.</p><p>Printmaking sessions are offered monthly.</p></main></body></html>`,
};

function evalMessage(payload: Record<string, unknown>): Message {
  return {
    kind: "message",
    messageId: randomUUID(),
    role: "user",
    parts: [{ kind: "data", data: payload }],
  };
}

interface EvalArtifactData {
  overallScore: number;
  grade: string;
  dimensionScores: Record<string, number>;
  report: {
    summary: { overallScore: number; grade: string; passedDimensions: number; totalDimensions: number };
    results: Record<string, { score: number; metadata: { mode?: string; modeReason?: string } } | undefined>;
    findings: Array<{ dimension: string; severity: string; issue: string }>;
  };
}

async function runEval(agent: AgentHandle, payload: Record<string, unknown>) {
  const client = await new ClientFactory().createFromUrl(agent.url);
  const events: Array<Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent | Message> = [];
  for await (const event of client.sendMessageStream({ message: evalMessage(payload) })) {
    events.push(event as never);
  }
  const last = events[events.length - 1] as TaskStatusUpdateEvent;
  const artifact = events.find((e) => e.kind === "artifact-update") as TaskArtifactUpdateEvent | undefined;
  const data = artifact
    ? ((artifact.artifact.parts[0] as { kind: "data"; data: unknown }).data as EvalArtifactData)
    : undefined;
  return { finalState: last.status.state, data };
}

describe("eval scoring honesty (skip / fail / size-mismatch semantics)", () => {
  let agent: AgentHandle;
  let fixtures: Server;

  beforeAll(async () => {
    fixtures = createServer((req, res) => {
      const body = PAGES[req.url ?? ""];
      if (!body) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(body);
    });
    await new Promise<void>((r) => fixtures.listen(FIXTURE_PORT, r));
    agent = await startAgent("eval-service", 14035, { env: NO_AI_ENV });
  });

  afterAll(async () => {
    if (agent) await stopAgent(agent);
    await new Promise((r) => fixtures.close(r));
  });

  it("sourceType none: content is skipped and excluded — not 0 at 25% weight", async () => {
    const { finalState, data } = await runEval(agent, {
      targetUrl: `http://localhost:${FIXTURE_PORT}/target.html`,
      sourceType: "none",
    });
    expect(finalState).toBe("completed");
    expect(data).toBeTruthy();

    // content is absent, not zero
    expect(data!.dimensionScores.content).toBeUndefined();
    expect(data!.report.results.content).toBeUndefined();
    expect(data!.report.summary.totalDimensions).toBe(3);

    // the skip is visible in the findings, not silent
    expect(
      data!.report.findings.some((f) => f.dimension === "content" && f.issue.includes("skipped"))
    ).toBe(true);

    // overall renormalizes over the three evaluated dimensions (equal weights)
    const present = ["structure", "accessibility", "visual"].map((d) => data!.dimensionScores[d]);
    expect(present.every((s) => typeof s === "number")).toBe(true);
    const renormalized = Math.round(present.reduce((a, b) => a + b, 0) / present.length);
    expect(data!.overallScore).toBe(renormalized);

    // no AI keys → every dimension records its degraded mode explicitly
    for (const dim of ["structure", "accessibility", "visual"]) {
      expect(data!.report.results[dim]?.metadata.mode).toBe("deterministic-only");
    }
  });

  it("unreachable target: dimensions fail and are excluded — visual must NOT be 100", async () => {
    const { finalState, data } = await runEval(agent, {
      targetUrl: "http://127.0.0.1:9/dead-page",
      sourceType: "none",
    });
    // the eval completes — a dead target is a catastrophic migration verdict, not an agent crash
    expect(finalState).toBe("completed");
    expect(data).toBeTruthy();

    // the old behavior scored visual=100 from a size-0 placeholder screenshot
    expect(data!.dimensionScores.visual).toBeUndefined();
    expect(data!.overallScore).toBe(0);
    expect(data!.grade).toBe("critical");
    expect(Object.keys(data!.dimensionScores)).toHaveLength(0);

    // each failed dimension is reported, not silently dropped
    for (const dim of ["structure", "accessibility", "visual"]) {
      expect(
        data!.report.findings.some((f) => f.dimension === dim && f.issue.includes("evaluation failed"))
      ).toBe(true);
    }
  }, 180_000);

  it("webpage source with mismatched page heights: comparison runs on the shared region with a size penalty", async () => {
    const { finalState, data } = await runEval(agent, {
      targetUrl: `http://localhost:${FIXTURE_PORT}/target.html`,
      sourceType: "webpage",
      sourceLocation: `http://localhost:${FIXTURE_PORT}/source.html`,
    });
    expect(finalState).toBe("completed");
    expect(data).toBeTruthy();

    // all four dimensions evaluated
    expect(data!.report.summary.totalDimensions).toBe(4);
    for (const dim of ["structure", "accessibility", "content", "visual"]) {
      expect(typeof data!.dimensionScores[dim]).toBe("number");
    }

    // the old behavior: height mismatch → compareImages threw → comparison
    // skipped → visual 100. Now: shared-region diff + capped size penalty.
    expect(data!.dimensionScores.visual).toBeLessThan(100);
    expect(data!.dimensionScores.visual).toBeGreaterThan(0);

    // content ran against the real source (word-overlap tier, no AI keys)
    expect(data!.report.results.content?.metadata.mode).toBe("deterministic-only");
  }, 180_000);
});
