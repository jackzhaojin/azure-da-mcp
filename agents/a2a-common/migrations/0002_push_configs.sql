-- Push-notification configs (A2A webhooks) — store-backed so registered callbacks
-- survive restarts/sleep (sleep-tolerance rule), unlike the SDK's in-memory store.

create table if not exists push_configs (
  task_id text not null,
  config_id text not null default 'default',
  config text not null,                -- JSON: A2A PushNotificationConfig {url, token?, authentication?}
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (task_id, config_id)
);
