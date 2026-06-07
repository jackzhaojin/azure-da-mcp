-- Store schema v1 — SQLite dialect (local SQLite in dev, Cloudflare D1 at deploy)
-- Source of truth: ai-docs/2026-06-05-a2a-agent-platform/part-2-eval-service.md

create table if not exists runs (
  id text primary key,                 -- uuid v4, generated app-side
  kind text not null,                  -- 'eval-batch' | 'pipeline' | 'single'
  config text not null,                -- JSON: pipeline spec / batch input
  status text not null default 'running',
  stats text,                          -- JSON, filled on completion: mean/stddev/pass-rate per dimension
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at text
);

create table if not exists tasks (
  id text primary key,
  run_id text references runs(id),
  agent text not null,                 -- 'eval' | 'migration' | 'content-gen' | 'coordinator'
  a2a_task_id text unique not null,
  context_id text,                     -- A2A contextId — groups pipeline steps
  state text not null,                 -- submitted|working|completed|failed|canceled
  payload text not null,               -- JSON (full A2A Task object)
  error text,                          -- JSON
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists idx_tasks_a2a_task_id on tasks(a2a_task_id);
create index if not exists idx_tasks_run_id on tasks(run_id);
create index if not exists idx_tasks_context_id on tasks(context_id);

create table if not exists eval_reports (
  id text primary key,
  task_id text not null references tasks(id),
  target_url text not null,
  overall_score real,
  dimension_scores text,               -- JSON
  report text not null,                -- JSON: full EvaluationReport
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists artifacts (
  id text primary key,
  task_id text not null references tasks(id),
  type text not null,                  -- screenshot|source-html|diff|brief
  storage_path text not null,          -- R2 object key
  metadata text                        -- JSON
);
