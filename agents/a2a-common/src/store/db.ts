import Database from "better-sqlite3";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../logging.ts";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
const log = createLogger("store-db");

/**
 * The async store seam (D3): one query interface, two drivers.
 *
 *   - SqliteDb     — local better-sqlite3 (dev/CI; runs migrations on open)
 *   - D1ProxyDb    — Cloudflare D1 via the fronting Worker's secret-gated
 *                    /d1/query endpoint (containers get NO native bindings —
 *                    the Worker-proxy pattern measured at ~100ms/query in
 *                    references/cloudflare/d1-container)
 *
 * Driver selection in openDb(): D1_PROXY_URL + D1_PROXY_SECRET env → D1 proxy,
 * else local SQLite. Statements use POSITIONAL `?` params only (D1 has no
 * named-parameter binding).
 */
export interface StoreStatement {
  run(...params: unknown[]): Promise<{ changes: number }>;
  get<T = unknown>(...params: unknown[]): Promise<T | undefined>;
  all<T = unknown>(...params: unknown[]): Promise<T[]>;
}

export interface StoreDb {
  readonly driver: "sqlite" | "d1-proxy";
  prepare(sql: string): StoreStatement;
}

class SqliteDb implements StoreDb {
  readonly driver = "sqlite" as const;
  constructor(readonly raw: Database.Database) {}

  prepare(sql: string): StoreStatement {
    const stmt = this.raw.prepare(sql);
    return {
      run: async (...params: unknown[]) => {
        const info = stmt.run(...params);
        return { changes: info.changes };
      },
      get: async <T>(...params: unknown[]) => stmt.get(...params) as T | undefined,
      all: async <T>(...params: unknown[]) => stmt.all(...params) as T[],
    };
  }
}

class D1ProxyDb implements StoreDb {
  readonly driver = "d1-proxy" as const;
  constructor(
    private readonly baseUrl: string, // the fronting Worker's origin
    private readonly secret: string
  ) {}

  private async query<T>(sql: string, params: unknown[]): Promise<{ results: T[]; changes: number }> {
    const res = await fetch(`${this.baseUrl}/d1/query`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-d1-secret": this.secret },
      body: JSON.stringify({ sql, params }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`d1-proxy query failed: ${res.status} ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as {
      success?: boolean;
      results?: T[];
      meta?: { changes?: number };
      error?: string;
    };
    if (body.error || body.success === false) throw new Error(`d1-proxy query error: ${body.error ?? "unknown"}`);
    return { results: body.results ?? [], changes: body.meta?.changes ?? 0 };
  }

  prepare(sql: string): StoreStatement {
    return {
      run: async (...params: unknown[]) => {
        const { changes } = await this.query(sql, params);
        return { changes };
      },
      get: async <T>(...params: unknown[]) => (await this.query<T>(sql, params)).results[0],
      all: async <T>(...params: unknown[]) => (await this.query<T>(sql, params)).results,
    };
  }
}

/**
 * Opens the agent store. With D1_PROXY_URL + D1_PROXY_SECRET set (Cloudflare
 * Containers), returns the D1 proxy driver — schema is managed externally via
 * `wrangler d1 execute` (D1 has no _migrations table). Otherwise opens/creates
 * the local SQLite file and applies unapplied a2a-common/migrations/*.sql.
 */
export async function openDb(dbPath: string): Promise<StoreDb> {
  const proxyUrl = process.env.D1_PROXY_URL?.replace(/\/$/, "");
  const proxySecret = process.env.D1_PROXY_SECRET;
  if (proxyUrl && proxySecret) {
    const db = new D1ProxyDb(proxyUrl, proxySecret);
    // fail fast on boot if the proxy is unreachable/misconfigured
    await db.prepare("select 1 as ok").get();
    log.info("store driver: d1-proxy", { base: proxyUrl });
    return db;
  }
  return new SqliteDb(openSqliteDb(dbPath));
}

/** The raw local-SQLite open + migration runner (also used by tools that need sync access). */
export function openSqliteDb(dbPath: string): Database.Database {
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
