import Database from "better-sqlite3";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

/**
 * Opens (creating if needed) the agent's local SQLite database and applies
 * any unapplied migrations from a2a-common/migrations/*.sql in filename order.
 *
 * Same SQL runs on Cloudflare D1 at deploy (D3) — one set of migration files,
 * two drivers; this is the local-SQLite half of the adapter.
 */
export function openDb(dbPath: string): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(
    `create table if not exists _migrations (
       name text primary key,
       applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     )`
  );

  const applied = new Set(
    (db.prepare("select name from _migrations").all() as { name: string }[]).map((r) => r.name)
  );
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("insert into _migrations (name) values (?)").run(file);
    })();
  }
  return db;
}
