import { describe, it, expect } from "vitest";
import { createArtifactStore } from "@agents/a2a-common";
import { AwsClient } from "aws4fetch";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tier-2 R2 evidence: the REAL Cloudflare R2 backend, end-to-end — a SigV4 PUT
// through the same createArtifactStore() the agents use, then a public r2.dev GET.
// This is the integration the local-backend content-gen e2e can't prove.
//
// Gated on R2 creds — mint an R2 API token (dashboard → R2 → Manage API Tokens →
// Object Read & Write) and export R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET, R2_PUBLIC_BASE, R2_ACCOUNT_ID. Skipped in CI / without creds.
// Self-cleaning: the test object is deleted at the end.
const haveR2 =
  !!process.env.R2_ACCESS_KEY_ID &&
  !!process.env.R2_SECRET_ACCESS_KEY &&
  !!process.env.R2_BUCKET &&
  !!process.env.R2_PUBLIC_BASE &&
  !!(process.env.R2_S3_ENDPOINT || process.env.R2_ACCOUNT_ID);

const tmpDir = () => mkdtempSync(join(tmpdir(), "r2-live-"));

describe.skipIf(!haveR2)("live: Cloudflare R2 artifact store", () => {
  it("selects the R2 backend when R2 env is present", () => {
    const store = createArtifactStore({ localDir: tmpDir(), localPublicBase: "http://unused" });
    expect(store.kind).toBe("r2");
  });

  it("PUTs an object and serves it over the public r2.dev URL", async () => {
    const store = createArtifactStore({ localDir: tmpDir(), localPublicBase: "http://unused" });
    const key = `test/r2-live-${randomUUID()}.html`;
    const body = `<!doctype html><h1>r2 live roundtrip ${key}</h1>`;

    const url = await store.put({ key, body, contentType: "text/html" });
    expect(url).toBe(`${process.env.R2_PUBLIC_BASE!.replace(/\/$/, "")}/${key}`);

    // public read-back — r2.dev can lag a beat right after a fresh PUT, so retry briefly
    let res!: Response;
    for (let i = 0; i < 10; i++) {
      res = await fetch(url, { cache: "no-store" });
      if (res.ok) break;
      await new Promise((r) => setTimeout(r, 1_000));
    }
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe(body);

    // cleanup — direct signed DELETE so the bucket never accumulates test objects
    const endpoint = (
      process.env.R2_S3_ENDPOINT ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    ).replace(/\/$/, "");
    const aws = new AwsClient({
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      region: "auto",
      service: "s3",
    });
    const del = await aws.fetch(`${endpoint}/${process.env.R2_BUCKET}/${key}`, { method: "DELETE" });
    expect([200, 204]).toContain(del.status);
  }, 30_000);
});
