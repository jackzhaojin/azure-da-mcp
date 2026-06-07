import type { Task } from "@a2a-js/sdk";
import type { TaskStore } from "@a2a-js/sdk/server";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

/**
 * SQLite-backed A2A TaskStore — the one place we go beyond SDK defaults (PRD part-3):
 * tasks must survive process restarts (and, later, Cloudflare Containers sleep/wake —
 * the sleep-tolerance rule proven by pocs/cloudflare-long-session-container).
 *
 * The full A2A Task object is the payload; row columns mirror the queryable bits.
 */
export class SqliteTaskStore implements TaskStore {
  constructor(
    private readonly db: Database.Database,
    private readonly agent: string
  ) {}

  async save(task: Task): Promise<void> {
    const payload = JSON.stringify(task);
    const state = task.status?.state ?? "unknown";
    const error =
      task.status?.state === "failed" && task.status.message
        ? JSON.stringify(task.status.message)
        : null;

    this.db
      .prepare(
        `insert into tasks (id, agent, a2a_task_id, context_id, state, payload, error)
         values (@id, @agent, @a2aTaskId, @contextId, @state, @payload, @error)
         on conflict(a2a_task_id) do update set
           state = @state, payload = @payload, error = @error,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
      )
      .run({
        id: randomUUID(),
        agent: this.agent,
        a2aTaskId: task.id,
        contextId: task.contextId ?? null,
        state,
        payload,
        error,
      });
  }

  async load(taskId: string): Promise<Task | undefined> {
    const row = this.db
      .prepare("select payload from tasks where a2a_task_id = ?")
      .get(taskId) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as Task) : undefined;
  }
}
