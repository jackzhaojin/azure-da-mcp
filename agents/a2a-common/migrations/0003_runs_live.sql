-- Live-observability columns for the coordinator UI (v2.0):
--   context_id — the A2A contextId threaded through every child task, so a
--                trigger response (taskId+contextId) can be joined to its run row
--   progress   — JSON array of {ts, note} working-notes, updated live while the
--                run executes (forwarded child notes incl. "K2.6 → <tool>")
alter table runs add column context_id text;
alter table runs add column progress text;
