import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface RunRow {
  id: string;
  kind: string;
  config: string;
  status: string;
  stats: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Read-only view over the coordinator's store (v1 is polling — PRD part-6). */
export function readRuns(limit = 50): RunRow[] {
  const dbPath = resolve(process.cwd(), process.env.COORDINATOR_DB ?? "../coordinator/data/store.db");
  if (!existsSync(dbPath)) return [];
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db
      .prepare("select id, kind, config, status, stats, created_at, completed_at from runs order by created_at desc limit ?")
      .all(limit) as RunRow[];
  } finally {
    db.close();
  }
}
