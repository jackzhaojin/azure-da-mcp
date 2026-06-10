import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read-only view over the coordinator's own store. The Express/A2A side (src/)
 * owns all writes; the Next.js backend only reads. Same path logic as
 * src/index.ts so both halves of the hybrid see one db.
 */
const DB_PATH = () => resolve(process.cwd(), process.env.STORE_DB_PATH ?? "./data/store.db");

export interface RunRow {
  id: string;
  kind: string;
  config: string;
  status: string;
  stats: string | null;
  progress: string | null;
  context_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ProgressNote {
  ts: string;
  note: string;
}

export interface RunView {
  id: string;
  kind: string;
  status: string;
  contextId: string | null;
  createdAt: string;
  completedAt: string | null;
  config: Record<string, unknown>;
  stats: Record<string, unknown> | null;
  progress: ProgressNote[];
}

function parseRow(row: RunRow, { withBranches = false } = {}): RunView {
  let stats: Record<string, unknown> | null = null;
  try {
    stats = row.stats ? (JSON.parse(row.stats) as Record<string, unknown>) : null;
  } catch {
    stats = null;
  }
  if (stats && !withBranches) {
    // list views stay light — the branch grid is detail-page data
    const { branchResults: _omit, ...rest } = stats;
    stats = rest;
  }
  let progress: ProgressNote[] = [];
  try {
    progress = row.progress ? (JSON.parse(row.progress) as ProgressNote[]) : [];
  } catch {
    progress = [];
  }
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.config) as Record<string, unknown>;
  } catch {
    config = {};
  }
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    contextId: row.context_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    config,
    stats,
    progress,
  };
}

function withDb<T>(fn: (db: Database.Database) => T): T | null {
  const path = DB_PATH();
  if (!existsSync(path)) return null;
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

const COLS = "id, kind, config, status, stats, progress, context_id, created_at, completed_at";

export function listRuns(limit = 30): RunView[] {
  return (
    withDb((db) =>
      (db.prepare(`select ${COLS} from runs order by created_at desc limit ?`).all(limit) as RunRow[]).map((r) => parseRow(r))
    ) ?? []
  );
}

export function getRun(id: string): RunView | null {
  return (
    withDb((db) => {
      const row = db.prepare(`select ${COLS} from runs where id = ?`).get(id) as RunRow | undefined;
      return row ? parseRow(row, { withBranches: true }) : null;
    }) ?? null
  );
}

export function findRunByContext(contextId: string): RunView | null {
  return (
    withDb((db) => {
      const row = db
        .prepare(`select ${COLS} from runs where context_id = ? order by created_at desc limit 1`)
        .get(contextId) as RunRow | undefined;
      return row ? parseRow(row) : null;
    }) ?? null
  );
}
