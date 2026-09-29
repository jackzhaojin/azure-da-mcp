import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Real modules, no mocks. Imported across the workspace boundary by path, like
// kimi-proxy.e2e.test.ts. The env is passed as a plain object parameter.
import { buildOpencodeConfig, playwrightMcpCommand } from "../../migration-agent/src/backends/opencode-config.ts";
import { parseEvaluateResult } from "../../migration-agent/src/playwright-probe.ts";

// Issue #14: in the cloud migration container @playwright/mcp defaulted to the
// Google Chrome channel (/opt/google/chrome/chrome), which the image never had, so
// every browser call failed and the migrator silently fell back to webfetch.

const OUT = "/tmp/pw-out";
const CONTAINER_ENV = {
  PLAYWRIGHT_MCP_BIN: "/usr/local/bin/playwright-mcp",
  PLAYWRIGHT_MCP_BROWSER: "chromium",
  PLAYWRIGHT_MCP_SANDBOX: "false",
};

describe("playwrightMcpCommand - the Playwright MCP launch command (issue #14)", () => {
  it("local dev (nothing set) is unchanged: npx, default browser channel, sandbox untouched", () => {
    expect(playwrightMcpCommand(OUT, {})).toEqual([
      "npx", "-y", "@playwright/mcp@latest", "--headless", "--isolated", "--output-dir", OUT,
    ]);
  });

  it("the container launches the bundled Chromium without the sandbox (root)", () => {
    expect(playwrightMcpCommand(OUT, CONTAINER_ENV)).toEqual([
      "/usr/local/bin/playwright-mcp", "--headless", "--isolated",
      "--browser", "chromium", "--no-sandbox", "--output-dir", OUT,
    ]);
  });

  it("only an explicit false/0 disables the sandbox", () => {
    const has = (sandbox: string | undefined) =>
      playwrightMcpCommand(OUT, { PLAYWRIGHT_MCP_SANDBOX: sandbox }).includes("--no-sandbox");
    expect(has("false")).toBe(true);
    expect(has("0")).toBe(true);
    expect(has(" FALSE ")).toBe(true);
    expect(has("true")).toBe(false);
    expect(has("")).toBe(false);
    expect(has(undefined)).toBe(false);
  });

  it("the generated opencode config carries exactly that command", () => {
    const saved = { ...process.env };
    Object.assign(process.env, CONTAINER_ENV);
    try {
      const cfg = buildOpencodeConfig({ daliveUrl: "https://example.test/mcp", skillsPath: "/app/skills", playwrightOut: OUT }) as {
        mcp: { playwright: { command: string[] } };
      };
      expect(cfg.mcp.playwright.command).toEqual(playwrightMcpCommand(OUT, CONTAINER_ENV));
    } finally {
      for (const k of Object.keys(CONTAINER_ENV)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});

describe("migration.Dockerfile - the image declares its browser (issue #14)", () => {
  const dockerfile = readFileSync(
    fileURLToPath(new URL("../../deploy/docker/migration.Dockerfile", import.meta.url)),
    "utf8"
  );

  it("pins @playwright/mcp instead of taking @latest on every build", () => {
    expect(dockerfile).not.toMatch(/@playwright\/mcp@latest/);
    expect(dockerfile).toMatch(/ARG PLAYWRIGHT_MCP_VERSION=\d+\.\d+\.\d+/);
    expect(dockerfile).toMatch(/npm i -g @playwright\/mcp@\$\{PLAYWRIGHT_MCP_VERSION\}/);
  });

  it("installs Chromium and points the MCP at it, sandbox off", () => {
    expect(dockerfile).toMatch(/playwright install --with-deps chromium/);
    expect(dockerfile).toMatch(/PLAYWRIGHT_MCP_BROWSER=chromium/);
    expect(dockerfile).toMatch(/PLAYWRIGHT_MCP_SANDBOX=false/);
  });
});

describe("parseEvaluateResult - the probe reads browser_evaluate's markdown reply", () => {
  // The exact reply shape @playwright/mcp 0.0.82 returned on 2026-09-26: an
  // unfenced "### Result" followed by a fenced js block with the code it ran.
  const REPLY = [
    "### Result",
    '{\n  "title": "Chasing Sunsets",\n  "images": [\n    { "src": "https://x.test/hero.avif", "naturalWidth": 1600 }\n  ]\n}',
    "### Ran Playwright code",
    "```js\nawait page.evaluate('() => ({ a: 1 })');\n```",
  ].join("\n");

  it("takes the Result section, not the first fenced block (the code)", () => {
    expect(parseEvaluateResult(REPLY)).toEqual({
      title: "Chasing Sunsets",
      images: [{ src: "https://x.test/hero.avif", naturalWidth: 1600 }],
    });
  });

  it("accepts a fenced Result too", () => {
    const fenced = '### Result\n```json\n{ "title": "T", "images": [] }\n```';
    expect(parseEvaluateResult(fenced)).toEqual({ title: "T", images: [] });
  });

  it("rejects anything that is not the probe's shape", () => {
    expect(parseEvaluateResult("### Result\n42")).toBeNull();
    expect(parseEvaluateResult("### Error\nboom")).toBeNull();
  });
});
