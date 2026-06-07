import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dbPath = resolve(process.cwd(), process.env.COORDINATOR_DB ?? "../coordinator/data/store.db");
  if (!existsSync(dbPath)) return NextResponse.json({ error: "store not found" }, { status: 404 });

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db
      .prepare("select id, kind, config, status, stats, created_at, completed_at from runs where id = ?")
      .get(id) as { id: string; kind: string; config: string; status: string; stats: string | null; created_at: string; completed_at: string | null } | undefined;
    if (!row) return NextResponse.json({ error: "run not found" }, { status: 404 });
    return NextResponse.json({
      run: {
        id: row.id,
        kind: row.kind,
        status: row.status,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        config: safeParse(row.config),
        stats: row.stats ? safeParse(row.stats) : null,
      },
    });
  } finally {
    db.close();
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
