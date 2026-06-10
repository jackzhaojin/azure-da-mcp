-- Per-user run scoping (Google SSO on the coordinator dashboard):
--   user_email — the signed-in Google account that triggered the run
--                (payload.requestedBy → runs.user_email). NULL = system run
--                (CLI, edge shim, mesh) — visible to every signed-in user.
alter table runs add column user_email text;
create index if not exists idx_runs_user_email on runs(user_email);
