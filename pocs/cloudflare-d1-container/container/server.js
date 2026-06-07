// D1-access probe server, runs INSIDE a Cloudflare Container (port 8080).
//
// The container has NO native D1 binding (no env.DB). To reach D1 it calls back
// into its fronting Worker's secret-gated /d1/query endpoint over plain HTTPS.
// This file measures the round-trip latency of that Worker-proxy access pattern.
//
// Trigger: GET /run-test?base=<worker-url>&secret=<s>&iters=<n>
//   - base/secret default to env vars injected by the Worker (WORKER_BASE_URL,
//     D1_PROXY_SECRET) so a bare `GET /run-test` works too.

const http = require("http");

const PORT = 8080;
const SERVER_VERSION = "2"; // bump to force a fresh container image + boot
const BOOT_ID = Math.random().toString(36).slice(2, 10);
const BOOT_AT = new Date().toISOString();
const TABLE = "spike_probe";

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stats(nums) {
  if (!nums.length) return null;
  const round = (n) => Math.round(n * 100) / 100;
  return {
    count: nums.length,
    min: round(Math.min(...nums)),
    median: round(median(nums)),
    max: round(Math.max(...nums)),
    mean: round(nums.reduce((a, b) => a + b, 0) / nums.length),
    all: nums.map(round),
  };
}

// One call to the Worker's D1 proxy. Returns { ms, body }.
async function d1Query(base, secret, sql, params) {
  const t0 = performance.now();
  const res = await fetch(`${base}/d1/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-d1-secret": secret },
    body: JSON.stringify({ sql, params: params ?? [] }),
  });
  const body = await res.json();
  const ms = performance.now() - t0;
  if (!res.ok) {
    throw new Error(`d1 proxy ${res.status}: ${JSON.stringify(body)}`);
  }
  return { ms, body };
}

async function runTest(base, secret, iters) {
  log(`[run-test] base=${base} iters=${iters} bootId=${BOOT_ID}`);
  const runId = `${BOOT_ID}-${Date.now()}`;

  // 1. Ensure the probe table exists (leaves it behind — that's allowed).
  await d1Query(
    base,
    secret,
    `CREATE TABLE IF NOT EXISTS ${TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, seq INTEGER, payload TEXT, created_at TEXT)`
  );

  // 2. INSERT loop — measure per-call round trip.
  const insertMs = [];
  for (let i = 0; i < iters; i++) {
    const { ms } = await d1Query(
      base,
      secret,
      `INSERT INTO ${TABLE} (run_id, seq, payload, created_at) VALUES (?, ?, ?, ?)`,
      [runId, i, `probe-payload-${i}`, new Date().toISOString()]
    );
    insertMs.push(ms);
  }

  // 3. SELECT loop — measure per-call round trip (full read of this run's rows).
  const selectMs = [];
  let lastRows = [];
  for (let i = 0; i < iters; i++) {
    const { ms, body } = await d1Query(
      base,
      secret,
      `SELECT id, seq, payload, created_at FROM ${TABLE} WHERE run_id = ? ORDER BY seq`,
      [runId]
    );
    selectMs.push(ms);
    lastRows = body.results;
  }

  return {
    bootId: BOOT_ID,
    runId,
    iters,
    accessPattern: "container -> Worker /d1/query (shared-secret) -> D1 binding",
    insertLatencyMs: stats(insertMs),
    selectLatencyMs: stats(selectMs),
    rowsInsertedThisRun: insertMs.length,
    rowsReadBack: lastRows.length,
    sampleRows: lastRows.slice(0, 3),
    selectSucceeded: lastRows.length === iters,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(obj, null, 2));
  };

  try {
    if (url.pathname === "/run-test") {
      const base = url.searchParams.get("base") || process.env.WORKER_BASE_URL;
      const secret = url.searchParams.get("secret") || process.env.D1_PROXY_SECRET;
      const iters = Math.max(1, Math.min(50, parseInt(url.searchParams.get("iters") || "10", 10)));
      if (!base) return send(400, { error: "missing base (and no WORKER_BASE_URL env)" });
      if (!secret) return send(400, { error: "missing secret (and no D1_PROXY_SECRET env)" });
      const result = await runTest(base, secret, iters);
      log(`[run-test] DONE insert.median=${result.insertLatencyMs.median}ms select.median=${result.selectLatencyMs.median}ms`);
      return send(200, { ok: true, ...result });
    }

    if (url.pathname === "/proxy-test") {
      // Convenience alias: uses injected env vars only.
      const base = process.env.WORKER_BASE_URL;
      const secret = process.env.D1_PROXY_SECRET;
      if (!base || !secret) {
        return send(500, {
          error: "WORKER_BASE_URL / D1_PROXY_SECRET env vars not injected by Worker",
          haveBase: !!base,
          haveSecret: !!secret,
        });
      }
      const result = await runTest(base, secret, 10);
      return send(200, { ok: true, ...result });
    }

    // health / default — also reports which env vars the container can see,
    // proving no D1 binding is present (only the injected strings).
    return send(200, {
      ok: true,
      serverVersion: SERVER_VERSION,
      bootId: BOOT_ID,
      bootAt: BOOT_AT,
      uptimeSec: Math.round(process.uptime()),
      injectedEnv: {
        WORKER_BASE_URL: process.env.WORKER_BASE_URL || null,
        hasD1ProxySecret: !!process.env.D1_PROXY_SECRET,
      },
      note: "No native D1 binding exists inside this container; access is via WORKER_BASE_URL + secret.",
    });
  } catch (e) {
    log(`[error]`, e);
    return send(500, { ok: false, error: String((e && e.message) || e) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  log(`D1 probe server listening on 0.0.0.0:${PORT} (bootId=${BOOT_ID})`);
});

process.on("SIGTERM", () => {
  log(`SIGTERM — container stopping (bootId=${BOOT_ID}, uptime=${Math.round(process.uptime())}s)`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
});
