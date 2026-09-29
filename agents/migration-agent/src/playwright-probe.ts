/**
 * Playwright MCP probe: launch the EXACT Playwright MCP command the migration
 * backends use (playwrightMcpCommand) and prove it can drive a real browser -
 * navigate a page, then read its images' naturalWidth (the check the site's
 * image-quality rule asks the model to make, which webfetch cannot do).
 * Dependency-free MCP over stdio (newline-delimited JSON-RPC), no model turn.
 *
 * Why it exists (issue #14): the cloud migrator's browser never launched, and for
 * weeks nothing turned red because the model quietly fell back to webfetch. This
 * makes "can this image launch a browser" a one-command check:
 *
 *   npm run probe:playwright -w @agents/migration-agent -- [url]      # local
 *   docker run --rm <migration-image> npx tsx src/playwright-probe.ts   # the image
 *
 * Prints a JSON report. Exit 0 = navigate + evaluate succeeded, 1 = a step failed.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { playwrightMcpCommand } from "./backends/opencode-config.ts";

/** The site's canonical reference story (public preview, read-only GET). */
export const DEFAULT_PROBE_URL = "https://main--adapt-to-2026-demo--jackzhaojin.aem.page/ai-content/stories/chasing-sunsets";

export interface ProbeImage {
  src: string;
  naturalWidth: number;
}

export interface ProbeResult {
  ok: boolean;
  url: string;
  command: string[];
  steps: Array<{ step: string; ok: boolean; ms: number; detail?: string }>;
  page?: { title: string; images: ProbeImage[] };
  error?: string;
}

type Json = Record<string, unknown>;

// Runs in the page. Lazy images only load when near the viewport, so force each
// candidate eager + into view before reading naturalWidth.
const EVALUATE_FN = `async () => {
  const imgs = [...document.images].slice(0, 5);
  for (const img of imgs) { img.loading = "eager"; img.scrollIntoView(); }
  await Promise.all(imgs.map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; setTimeout(r, 5000); })));
  return { title: document.title, images: imgs.map((i) => ({ src: i.currentSrc || i.src, naturalWidth: i.naturalWidth })) };
}`;

function toolText(msg: Json): string {
  const result = msg.result as { content?: Array<{ type?: string; text?: string }> } | undefined;
  return (result?.content ?? []).map((c) => c.text ?? "").join("\n");
}

function toolFailed(msg: Json): string | null {
  if (msg.error) return JSON.stringify(msg.error).slice(0, 600);
  const result = msg.result as { isError?: boolean } | undefined;
  const text = toolText(msg);
  if (result?.isError || /^### Error/m.test(text)) return text.slice(0, 600);
  return null;
}

/**
 * browser_evaluate answers in markdown sections ("### Result", then e.g. "### Ran
 * Playwright code" with a fenced js block). The value is the "### Result" section,
 * fenced or not - never the first fenced block in the reply, which is the code.
 */
export function parseEvaluateResult(text: string): { title: string; images: ProbeImage[] } | null {
  const section = text.match(/### Result[^\n]*\n([\s\S]*?)(?=\n### |$)/);
  const body = (section ? section[1] : text)
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  const candidate = body.slice(body.indexOf("{"), body.lastIndexOf("}") + 1);
  try {
    const value = JSON.parse(candidate) as { title?: unknown; images?: unknown };
    if (typeof value.title !== "string" || !Array.isArray(value.images)) return null;
    return { title: value.title, images: value.images as ProbeImage[] };
  } catch {
    return null;
  }
}

export async function probePlaywrightMcp(
  opts: { url?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<ProbeResult> {
  const url = opts.url ?? DEFAULT_PROBE_URL;
  const env = opts.env ?? process.env;
  const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
  const outDir = mkdtempSync(path.join(os.tmpdir(), "pw-probe-"));
  const command = playwrightMcpCommand(outDir, env);
  const result: ProbeResult = { ok: false, url, command, steps: [] };

  const child = spawn(command[0], command.slice(1), { stdio: ["pipe", "pipe", "pipe"], env });
  let stderr = "";
  child.stderr.on("data", (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-8000);
  });
  const pending = new Map<number, (msg: Json) => void>();
  let buf = "";
  child.stdout.on("data", (d: Buffer) => {
    buf += d.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as Json;
        const id = msg.id;
        if (typeof id === "number" && pending.has(id)) {
          pending.get(id)!(msg);
          pending.delete(id);
        }
      } catch {
        /* a non-JSON line on stdout - ignore */
      }
    }
  });
  const died = new Promise<never>((_, reject) => {
    child.on("error", (err) => reject(new Error(`could not start ${command[0]}: ${err.message}`)));
    child.on("exit", (code) => reject(new Error(`playwright MCP exited (code ${code}): ${stderr.trim().slice(-600)}`)));
  });
  died.catch(() => {}); // observed through the races below

  let nextId = 1;
  const rpc = (method: string, params: Json): Promise<Json> => {
    const id = nextId++;
    const reply = new Promise<Json>((resolve) => pending.set(id, resolve));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    const remaining = Math.max(1, deadline - Date.now());
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${method} timed out`)), remaining).unref()
    );
    return Promise.race([reply, died, timer]);
  };
  const step = async (name: string, fn: () => Promise<string | undefined>) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      result.steps.push({ step: name, ok: true, ms: Date.now() - t0, ...(detail ? { detail } : {}) });
    } catch (err) {
      result.steps.push({ step: name, ok: false, ms: Date.now() - t0, detail: String(err instanceof Error ? err.message : err) });
      throw err;
    }
  };

  try {
    await step("initialize", async () => {
      const init = await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "migration-agent-playwright-probe", version: "1" },
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      const info = (init.result as { serverInfo?: { name?: string; version?: string } } | undefined)?.serverInfo;
      return info ? `${info.name} ${info.version}` : undefined;
    });
    await step("browser_navigate", async () => {
      const msg = await rpc("tools/call", { name: "browser_navigate", arguments: { url } });
      const failed = toolFailed(msg);
      if (failed) throw new Error(failed);
      return undefined;
    });
    await step("browser_evaluate", async () => {
      const msg = await rpc("tools/call", { name: "browser_evaluate", arguments: { function: EVALUATE_FN } });
      const failed = toolFailed(msg);
      if (failed) throw new Error(failed);
      const page = parseEvaluateResult(toolText(msg));
      if (!page) throw new Error(`unparseable evaluate result: ${toolText(msg).slice(0, 400)}`);
      result.page = page;
      const widths = page.images.map((i) => i.naturalWidth).join(", ");
      return `title "${page.title}", ${page.images.length} image(s), naturalWidth ${widths || "n/a"}`;
    });
    // A real render proves more than a fetch: at least one image must have decoded.
    const images = result.page?.images ?? [];
    if (images.length > 0 && !images.some((i) => i.naturalWidth > 0)) {
      throw new Error("page rendered but no image decoded (every naturalWidth is 0)");
    }
    result.ok = true;
    await rpc("tools/call", { name: "browser_close", arguments: {} }).catch(() => undefined);
  } catch (err) {
    result.error = String(err instanceof Error ? err.message : err);
  } finally {
    child.kill("SIGTERM");
    rmSync(outDir, { recursive: true, force: true });
  }
  return result;
}

// CLI: `tsx src/playwright-probe.ts [url]`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await probePlaywrightMcp({ url: process.argv[2] });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
