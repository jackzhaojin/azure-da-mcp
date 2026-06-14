-- v1.0 UI parity (2026-06-14): durable bulk-run grouping.
--   batch_id — groups the N independent coordinate.run / eval-direct runs that a
--              single "bulk run" submission fired (each item is its own durable
--              run row; the batch is the shared id). NULL = a one-off run.
-- The dashboard's bulk submit mints one batch_id client-side and tags every item;
-- the batch page queries `/store/runs?batchId=` to aggregate per-item progress.
alter table runs add column batch_id text;
create index if not exists idx_runs_batch_id on runs(batch_id);
