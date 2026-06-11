-- Hardening sprint (2026-06-11): failure visibility + live branch progress.
--   error — WHY a run failed (status='failed'); previously a failed run was a
--           bare red badge and the reason lived only in server logs
--   live  — JSON BranchResult[] snapshot updated per stage transition while the
--           run executes, so the dashboard can render the branch/stage grid
--           DURING a run; cleared when the final stats land (stats.branchResults)
alter table runs add column error text;
alter table runs add column live text;
