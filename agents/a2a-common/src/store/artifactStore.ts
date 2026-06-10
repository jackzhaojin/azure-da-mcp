import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";
import type { StoreDb } from "./db.ts";
import { createLogger } from "../logging.ts";

const log = createLogger("artifact-store");

export interface PutArtifact {
  /** Object key relative to the bucket/dir root, e.g. "sources/<taskId>.html". */
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}

export interface ArtifactStore {
  /** Which backend is active — for logging/diagnostics and test assertions. */
  readonly kind: "r2" | "local";
  /** Public base URL artifacts are fetchable from (no trailing slash). */
  readonly publicBase: string;
  /** Store the bytes and return the publicly-fetchable URL. */
  put(a: PutArtifact): Promise<string>;
}

/**
 * Local filesystem stand-in: writes under `localDir`, served by the agent's
 * staticRoutes. Default when R2 env isn't configured — keeps the closed loop
 * (and CI) fully local with zero credentials and identical URL contract.
 */
class LocalArtifactStore implements ArtifactStore {
  readonly kind = "local" as const;
  constructor(
    private readonly localDir: string,
    readonly publicBase: string
  ) {}

  async put({ key, body }: PutArtifact): Promise<string> {
    const abs = join(this.localDir, key);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
    return `${this.publicBase}/${key}`;
  }
}

/**
 * Cloudflare R2 via the S3-compatible API (SigV4 over fetch — one code path that
 * works identically in local Node and in a Container at deploy, since containers
 * get no native bindings, D3). Reads are public via the bucket's r2.dev URL.
 */
class R2ArtifactStore implements ArtifactStore {
  readonly kind = "r2" as const;
  private readonly client: AwsClient;
  constructor(
    private readonly endpoint: string, // https://<account>.r2.cloudflarestorage.com
    private readonly bucket: string,
    readonly publicBase: string,
    accessKeyId: string,
    secretAccessKey: string
  ) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" });
  }

  async put({ key, body, contentType }: PutArtifact): Promise<string> {
    const url = `${this.endpoint}/${this.bucket}/${key}`;
    const res = await this.client.fetch(url, {
      method: "PUT",
      // Buffer is a Uint8Array subclass (valid BodyInit at runtime); DOM's BodyInit type omits it
      body: body as BodyInit,
      headers: { "content-type": contentType },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`R2 put failed: ${res.status} ${res.statusText} ${detail.slice(0, 300)}`);
    }
    return `${this.publicBase}/${key}`;
  }
}

export interface ArtifactStoreOptions {
  /** Local dir for the filesystem fallback (served via staticRoutes). */
  localDir: string;
  /** Public base for the filesystem fallback, e.g. http://localhost:4002/artifacts. */
  localPublicBase: string;
}

/**
 * Selects the R2 backend when the R2 env vars are present, else the local
 * filesystem stand-in. Required R2 env (all must be set):
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE,
 *   and one of R2_S3_ENDPOINT or R2_ACCOUNT_ID.
 */
export function createArtifactStore(opts: ArtifactStoreOptions): ArtifactStore {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBase = process.env.R2_PUBLIC_BASE?.replace(/\/$/, "");
  const endpoint =
    process.env.R2_S3_ENDPOINT?.replace(/\/$/, "") ??
    (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

  if (accessKeyId && secretAccessKey && bucket && publicBase && endpoint) {
    log.info("artifact store: R2", { bucket, publicBase });
    return new R2ArtifactStore(endpoint, bucket, publicBase, accessKeyId, secretAccessKey);
  }
  log.info("artifact store: local filesystem (R2 env not set)", { publicBase: opts.localPublicBase });
  return new LocalArtifactStore(opts.localDir, opts.localPublicBase.replace(/\/$/, ""));
}

/**
 * Records an artifacts-table row (Part-2 schema) linking an A2A task to its
 * stored object key. Best-effort: skips with a warn if the tasks row isn't
 * persisted yet (FK requires it), so it never blocks the producing path.
 */
export async function recordArtifact(
  db: StoreDb,
  a: { a2aTaskId: string; type: string; storagePath: string; metadata?: Record<string, unknown> }
): Promise<void> {
  const row = await db.prepare("select id from tasks where a2a_task_id = ?").get<{ id: string }>(a.a2aTaskId);
  if (!row) {
    log.warn("artifact row skipped — no tasks row yet", { a2a_task_id: a.a2aTaskId, type: a.type });
    return;
  }
  await db
    .prepare("insert into artifacts (id, task_id, type, storage_path, metadata) values (?, ?, ?, ?, ?)")
    .run(randomUUID(), row.id, a.type, a.storagePath, a.metadata ? JSON.stringify(a.metadata) : null);
}
