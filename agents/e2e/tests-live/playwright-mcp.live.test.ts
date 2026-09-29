import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { probePlaywrightMcp } from "../../migration-agent/src/playwright-probe.ts";

// Issue #14, live: launch the REAL Playwright MCP with the exact command the
// migration backends build (playwrightMcpCommand, from this shell's env) and prove
// it renders a page: navigate + read an image's naturalWidth, which webfetch cannot
// do. The page is served from a local port, so there is no external dependency
// beyond the Playwright MCP package itself. No creds needed.
//
// On a laptop this exercises the local default (Google Chrome channel). To prove a
// container image, run the same probe inside it:
//   docker run --rm <migration-image> npx tsx src/playwright-probe.ts

const IMAGE_WIDTH = 640;
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_WIDTH}" height="320"><rect width="100%" height="100%" fill="teal"/></svg>`;
const HTML = `<!doctype html><html><head><title>probe page</title></head>
<body><h1>probe</h1><img src="/hero.svg" alt="hero" loading="lazy" style="margin-top:2000px"></body></html>`;

describe("Playwright MCP renders a page with the backends' launch command (issue #14)", () => {
  let server: Server;
  let base = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      if (req.url === "/hero.svg") {
        res.writeHead(200, { "content-type": "image/svg+xml" }).end(SVG);
      } else {
        res.writeHead(200, { "content-type": "text/html" }).end(HTML);
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("navigates and reads a lazy image's naturalWidth", async () => {
    const report = await probePlaywrightMcp({ url: `${base}/`, timeoutMs: 150_000 });
    const trail = report.steps.map((s) => `${s.ok ? "ok" : "FAIL"} ${s.step} ${s.detail ?? ""}`).join("\n");
    expect(report.ok, `probe failed: ${report.error}\n${trail}`).toBe(true);
    expect(report.page?.title).toBe("probe page");
    expect(report.page?.images.map((i) => i.naturalWidth)).toEqual([IMAGE_WIDTH]);
  }, 180_000);
});
