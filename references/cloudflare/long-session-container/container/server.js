// Minimal SSE test server for Cloudflare Containers.
// Does nothing useful except: stream SSE ticks, log connections + durations,
// and self-report via /stats so we can detect container sleep/wake (bootId changes).

const http = require("http");

const PORT = 8080;
const BOOT_ID = Math.random().toString(36).slice(2, 10);
const BOOT_AT = new Date().toISOString();
const TICK_MS = 5000;

let connSeq = 0;
const history = []; // { id, openedAt, closedAt, durationSec, ticks }

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (url.pathname === "/sse") {
    const id = ++connSeq;
    const openedAtMs = Date.now();
    const rec = { id, openedAt: new Date().toISOString(), closedAt: null, durationSec: null, ticks: 0 };
    history.push(rec);
    log(`[sse] conn ${id} OPENED (bootId=${BOOT_ID})`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...corsHeaders(),
    });

    res.write(`event: hello\ndata: ${JSON.stringify({ bootId: BOOT_ID, bootAt: BOOT_AT, connId: id })}\n\n`);

    const timer = setInterval(() => {
      rec.ticks += 1;
      const elapsedSec = Math.round((Date.now() - openedAtMs) / 1000);
      res.write(
        `event: tick\ndata: ${JSON.stringify({
          bootId: BOOT_ID,
          connId: id,
          seq: rec.ticks,
          elapsedSec,
          containerTime: new Date().toISOString(),
        })}\n\n`
      );
      if (elapsedSec % 60 === 0) log(`[sse] conn ${id} alive ${elapsedSec}s (${rec.ticks} ticks)`);
    }, TICK_MS);

    req.on("close", () => {
      clearInterval(timer);
      rec.closedAt = new Date().toISOString();
      rec.durationSec = Math.round((Date.now() - openedAtMs) / 1000);
      log(`[sse] conn ${id} CLOSED after ${rec.durationSec}s (${rec.ticks} ticks)`);
    });
    return;
  }

  if (url.pathname === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
    return res.end(
      JSON.stringify(
        {
          bootId: BOOT_ID,
          bootAt: BOOT_AT,
          uptimeSec: Math.round(process.uptime()),
          activeConnections: history.filter((c) => !c.closedAt).length,
          history,
        },
        null,
        2
      )
    );
  }

  // health / default
  res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
  res.end(JSON.stringify({ ok: true, bootId: BOOT_ID, bootAt: BOOT_AT, uptimeSec: Math.round(process.uptime()) }));
});

server.listen(PORT, "0.0.0.0", () => {
  log(`SSE test server listening on 0.0.0.0:${PORT} (bootId=${BOOT_ID})`);
});

process.on("SIGTERM", () => {
  log(`SIGTERM received — container is being stopped (bootId=${BOOT_ID}, uptime=${Math.round(process.uptime())}s)`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
});
