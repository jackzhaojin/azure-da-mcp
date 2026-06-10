import type { PushNotificationConfig } from "@a2a-js/sdk";
import type { PushNotificationStore } from "@a2a-js/sdk/server";
import type { StoreDb } from "./db.ts";

/**
 * Store-backed PushNotificationStore: callback registrations survive process
 * restarts (the SDK ships in-memory only). A2A push notifications are the
 * Make.com interop mechanism (PRD part-3), so losing them on sleep/wake would
 * silently break edge callers.
 */
export class SqlitePushNotificationStore implements PushNotificationStore {
  constructor(private readonly db: StoreDb) {}

  async save(taskId: string, config: PushNotificationConfig): Promise<void> {
    // mirror the SDK's InMemoryPushNotificationStore: a config without an id
    // gets the taskId as its id (getTaskPushNotificationConfig looks it up that way)
    const withId = { ...config, id: config.id ?? taskId };
    await this.db
      .prepare(
        `insert into push_configs (task_id, config_id, config)
         values (?, ?, ?)
         on conflict(task_id, config_id) do update set config = excluded.config`
      )
      .run(taskId, withId.id, JSON.stringify(withId));
  }

  async load(taskId: string): Promise<PushNotificationConfig[]> {
    const rows = await this.db
      .prepare("select config from push_configs where task_id = ?")
      .all<{ config: string }>(taskId);
    return rows.map((r) => JSON.parse(r.config) as PushNotificationConfig);
  }

  async delete(taskId: string, configId?: string): Promise<void> {
    if (configId) {
      await this.db.prepare("delete from push_configs where task_id = ? and config_id = ?").run(taskId, configId);
    } else {
      await this.db.prepare("delete from push_configs where task_id = ?").run(taskId);
    }
  }
}
