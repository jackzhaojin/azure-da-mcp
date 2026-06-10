import type { Task } from "@a2a-js/sdk";
import type { TaskStore } from "@a2a-js/sdk/server";
import { randomUUID } from "node:crypto";
import type { StoreDb } from "./db.ts";

/**
 * Store-backed A2A TaskStore (local SQLite or D1 via the proxy driver) — the one
 * place we go beyond SDK defaults (PRD part-3): tasks must survive process
 * restarts and Cloudflare Containers sleep/wake (the sleep-tolerance rule proven
 * by references/cloudflare/long-session-container).
 *
 * The full A2A Task object is the payload; row columns mirror the queryable bits.
 * Positional params only — D1 has no named-parameter binding.
 */
export class SqliteTaskStore implements TaskStore {
  constructor(
    private readonly db: StoreDb,
    private readonly agent: string
  ) {}

  async save(task: Task): Promise<void> {
    const payload = JSON.stringify(task);
    const state = task.status?.state ?? "unknown";
    const error =
      task.status?.state === "failed" && task.status.message
        ? JSON.stringify(task.status.message)
        : null;

    await this.db
      .prepare(
        `insert into tasks (id, agent, a2a_task_id, context_id, state, payload, error)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict(a2a_task_id) do update set
           state = excluded.state, payload = excluded.payload, error = excluded.error,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
      )
      .run(randomUUID(), this.agent, task.id, task.contextId ?? null, state, payload, error);
  }

  async load(taskId: string): Promise<Task | undefined> {
    const row = await this.db
      .prepare("select payload from tasks where a2a_task_id = ?")
      .get<{ payload: string }>(taskId);
    return row ? (JSON.parse(row.payload) as Task) : undefined;
  }
}
