import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ClientFactory } from "@a2a-js/sdk/client";
import type { Message, Task, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

function userMessage(text: string): Message {
  return { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "text", text }] };
}

type StreamEvent = Task | TaskStatusUpdateEvent | TaskArtifactUpdateEvent | Message;

async function collectStream(url: string, text: string): Promise<StreamEvent[]> {
  const client = await new ClientFactory().createFromUrl(url);
  const events: StreamEvent[] = [];
  for await (const event of client.sendMessageStream({ message: userMessage(text) })) {
    events.push(event as StreamEvent);
  }
  return events;
}

// The full A2A task lifecycle over real SSE: submitted → working… → artifact → completed,
// then tasks/get retrieval and the Part-2 store schema mapping underneath.
describe("task lifecycle (message/stream → tasks/get → store row)", () => {
  let evalAgent: AgentHandle;
  let contentGen: AgentHandle;

  beforeAll(async () => {
    [evalAgent, contentGen] = await Promise.all([
      startAgent("eval-service", 14011, { env: { EVAL_ENGINE: "stub" } }),
      startAgent("content-gen", 14012),
    ]);
  });

  afterAll(async () => {
    await Promise.all([stopAgent(evalAgent), stopAgent(contentGen)]);
  });

  it("eval.run streams the full choreography and persists a queryable task", async () => {
    const events = await collectStream(evalAgent.url, "evaluate https://example.com (e2e)");

    // 1. choreography: first event is the Task in submitted state
    const first = events[0] as Task;
    expect(first.kind).toBe("task");
    expect(first.status.state).toBe("submitted");
    const taskId = first.id;
    expect(taskId).toBeTruthy();

    // 2. one working update per dimension
    const working = events.filter(
      (e) => e.kind === "status-update" && e.status.state === "working"
    ) as TaskStatusUpdateEvent[];
    expect(working.length).toBe(4);
    const dims = working.map(
      (w) => w.status.message?.parts.find((p) => p.kind === "text")?.text ?? ""
    );
    for (const d of ["structure", "accessibility", "content", "visual"]) {
      expect(dims.some((t) => t.includes(d))).toBe(true);
    }

    // 3. exactly one artifact, with overall + 4 dimension scores
    const artifacts = events.filter((e) => e.kind === "artifact-update") as TaskArtifactUpdateEvent[];
    expect(artifacts.length).toBe(1);
    const part = artifacts[0].artifact.parts[0];
    expect(part.kind).toBe("data");
    const data = (part as { kind: "data"; data: Record<string, unknown> }).data;
    expect(typeof data.overallScore).toBe("number");
    expect(Object.keys(data.dimensionScores as object)).toEqual(
      expect.arrayContaining(["structure", "accessibility", "content", "visual"])
    );

    // 4. terminal event is a final completed status-update
    const last = events[events.length - 1] as TaskStatusUpdateEvent;
    expect(last.kind).toBe("status-update");
    expect(last.status.state).toBe("completed");
    expect(last.final).toBe(true);

    // 5. contextId threads every event of the task
    const contextIds = new Set(
      events.map((e) => (e.kind === "task" ? e.contextId : (e as TaskStatusUpdateEvent).contextId))
    );
    expect(contextIds.size).toBe(1);

    // 6. tasks/get returns the completed task with the artifact
    const client = await new ClientFactory().createFromUrl(evalAgent.url);
    const fetched = await client.getTask({ id: taskId });
    expect(fetched.status.state).toBe("completed");
    expect(fetched.artifacts?.length).toBe(1);

    // 7. evidence in the store: Part-2 schema row, correctly mapped
    const db = new Database(evalAgent.dbPath, { readonly: true });
    const row = db
      .prepare("select agent, state, context_id, payload from tasks where a2a_task_id = ?")
      .get(taskId) as { agent: string; state: string; context_id: string; payload: string };
    db.close();
    expect(row).toBeTruthy();
    expect(row.agent).toBe("da-eval-agent");
    expect(row.state).toBe("completed");
    expect(row.context_id).toBe([...contextIds][0]);
    expect((JSON.parse(row.payload) as Task).id).toBe(taskId);
  });

  it("content.brief streams a data artifact and completes", async () => {
    const events = await collectStream(contentGen.url, "brief for a buying guide (e2e)");
    const artifact = events.find((e) => e.kind === "artifact-update") as TaskArtifactUpdateEvent;
    expect(artifact).toBeTruthy();
    expect(artifact.artifact.name).toBe("content-brief");
    const last = events[events.length - 1] as TaskStatusUpdateEvent;
    expect(last.status.state).toBe("completed");
    expect(last.final).toBe(true);
  });

  it("tasks/get for an unknown id returns the A2A TaskNotFound error (-32001)", async () => {
    const res = await fetch(`${evalAgent.url}/a2a`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/get",
        params: { id: randomUUID() },
      }),
    });
    const body = await res.json();
    expect(body.result).toBeUndefined();
    expect(body.error).toBeTruthy();
    expect(body.error.code).toBe(-32001);
  });
});
