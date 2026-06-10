import type express from "express";
import type { StoreDb } from "@agents/a2a-common";

/**
 * Domain read endpoints, owned by the A2A layer (the store's only owner):
 *   GET /store/runs            → { runs }  light list (no branchResults, trimmed progress)
 *   GET /store/runs?contextId= → { run }   resolve a trigger's contextId to its run
 *   GET /store/runs/:id        → { run }   full detail (branchResults, full progress, a2aTaskId)
 *
 * The Next.js dashboard consumes these over loopback HTTP — it has NO database
 * access of its own. Bearer-gated by the edge token when one is configured
 * (same semantics as /hooks): open in local dev, locked at the edge.
 *
 * Why the /store prefix: Express routes are registered BEFORE the Next.js
 * catch-all, and the dashboard's PAGES live at /runs/[id] — a bare GET /runs/:id
 * here would shadow them. /store/* is reserved for the A2A layer's JSON reads.
 */

interface RunRow {
  id: string;
  kind: string;
  config: string;
  status: string;
  stats: string | null;
  progress: string | null;
  context_id: string | null;
  user_email: string | null;
  created_at: string;
  completed_at: string | null;
}

const COLS = "id, kind, config, status, stats, progress, context_id, user_email, created_at, completed_at";
const LIST_PROGRESS_TAIL = 10; // dashboard cards show the last few notes; keep list payloads light

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toView(row: RunRow, { full = false } = {}) {
  let stats = parseJson<Record<string, unknown> | null>(row.stats, null);
  if (stats && !full) {
    const { branchResults: _omit, ...rest } = stats;
    stats = rest;
  }
  let progress = parseJson<Array<{ ts: string; note: string }>>(row.progress, []);
  if (!full) progress = progress.slice(-LIST_PROGRESS_TAIL);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    contextId: row.context_id,
    userEmail: row.user_email,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    config: parseJson<Record<string, unknown>>(row.config, {}),
    stats,
    progress,
  };
}

export function mountRunsRoutes(ctx: { app: express.Express; db: StoreDb; edgeToken?: string }): void {
  const { app, db, edgeToken } = ctx;

  const guard = (req: express.Request, res: express.Response): boolean => {
    if (!edgeToken) return true;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ") && header.slice(7) === edgeToken) return true;
    res.status(401).json({ error: "unauthorized: bearer token required" });
    return false;
  };

  app.get("/store/runs", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const contextId = req.query.contextId;
      if (typeof contextId === "string" && contextId) {
        const row = await db
          .prepare(`select ${COLS} from runs where context_id = ? order by created_at desc limit 1`)
          .get<RunRow>(contextId);
        return res.json({ run: row ? toView(row) : null });
      }
      const limit = Math.min(Number(req.query.limit ?? 30) || 30, 100);
      // ?user= scopes to that user's runs PLUS unowned system runs (CLI / edge
      // shim / mesh have no SSO identity — user_email stays null on those).
      const user = req.query.user;
      const rows =
        typeof user === "string" && user
          ? await db
              .prepare(`select ${COLS} from runs where user_email = ? or user_email is null order by created_at desc limit ?`)
              .all<RunRow>(user, limit)
          : await db.prepare(`select ${COLS} from runs order by created_at desc limit ?`).all<RunRow>(limit);
      res.json({ runs: rows.map((r) => toView(r)) });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get("/store/runs/:id", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const row = await db.prepare(`select ${COLS} from runs where id = ?`).get<RunRow>(req.params.id);
      if (!row) return res.status(404).json({ error: "run not found" });
      // The coordinator's own coordinate.run task shares the run's contextId —
      // surface its A2A taskId so clients can tasks/get / tasks/resubscribe.
      const task = row.context_id
        ? await db
            .prepare("select a2a_task_id from tasks where agent = 'da-coordinator' and context_id = ? limit 1")
            .get<{ a2a_task_id: string }>(row.context_id)
        : undefined;
      res.json({ run: { ...toView(row, { full: true }), a2aTaskId: task?.a2a_task_id ?? null } });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}
