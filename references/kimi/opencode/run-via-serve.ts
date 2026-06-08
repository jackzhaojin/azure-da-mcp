#!/usr/bin/env npx tsx
/**
 * opencode + Kimi K2.6 — headless "print mode" PoC (via `opencode serve`).
 *
 * Why a server and not `opencode run`?
 *   `opencode run` (the obvious headless analogue of `kimi --print`) does NOT
 *   surface assistant text for the `kimi-code/kimi-for-coding` (K2.6) model in
 *   v1.16.2: it emits only a `step_start` event and exits 0 with no body. The
 *   interactive TUI renders the same model fine, and so does the HTTP server.
 *   So the robust programmatic path — and the one the A2A migration agent's
 *   `opencode` backup backend should use — is `opencode serve` + the REST API.
 *
 * What this does:
 *   1. spawns `opencode serve` on a local port (inherits MOONSHOT_API_KEY)
 *   2. waits for "listening on"
 *   3. POST /session                       -> create a session
 *   4. POST /session/:id/message           -> one full agent turn (K2.6)
 *   5. prints the final assistant text + token usage, then kills the server
 *
 * Auth: the Kimi-For-Coding credential lives in $MOONSHOT_API_KEY (see
 * ../README.md). opencode's bundled `kimi-code` provider points at
 * https://api.kimi.com/coding/v1 and identifies as a recognized coding agent,
 * which is what the endpoint's client allowlist requires.
 *
 * Run from anywhere (opencode is resolved from PATH or ~/.opencode/bin):
 *   MOONSHOT_API_KEY=... npx tsx references/kimi/opencode/run-via-serve.ts "your prompt"
 */

import { spawn, ChildProcess } from "child_process";
import * as os from "os";
import * as path from "path";

const MODEL_PROVIDER = "kimi-code";
const MODEL_ID = "kimi-for-coding"; // catalog label: Kimi for Coding (K2.6)

// Pick a port in a high range; opencode also accepts --port 0 (random) but then
// we'd have to scrape it from the log — a fixed port keeps the PoC simple.
const PORT = Number(process.env.OPENCODE_PORT ?? 47821);
const HOST = "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;

// Resolve the opencode binary: prefer PATH, fall back to the standard install.
function opencodeBin(): string {
  return process.env.OPENCODE_BIN ?? path.join(os.homedir(), ".opencode", "bin", "opencode");
}

async function waitForServer(proc: ChildProcess, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve();
    };
    const onData = (buf: Buffer) => {
      const s = buf.toString();
      // strip ANSI so the match is robust
      if (/listening on/i.test(s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, ""))) done();
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("exit", (code) => done(new Error(`opencode serve exited early (code ${code})`)));
    setTimeout(() => done(new Error("timed out waiting for opencode serve")), timeoutMs);
  });
}

async function jsonFetch(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} -> ${res.status} ${await res.text()}`);
  return res.json();
}

/** Pull the assistant's visible text out of the message `parts` array. */
function extractText(message: { parts?: Array<{ type: string; text?: string }> }): string {
  return (message.parts ?? [])
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
}

async function main() {
  const prompt =
    process.argv.slice(2).join(" ") ||
    "Reply with exactly one short line stating which model and version you are.";

  if (!process.env.MOONSHOT_API_KEY) {
    console.error("[!] MOONSHOT_API_KEY is not set — `source ~/.zshrc` or export it first.");
    process.exit(1);
  }

  console.log("=== opencode + Kimi K2.6 — headless serve PoC ===\n");
  console.log(`[*] spawning opencode serve on ${BASE} ...`);

  const proc = spawn(opencodeBin(), ["serve", "--port", String(PORT), "--hostname", HOST], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(proc);
    console.log("[*] server up\n");

    const session = await jsonFetch(`${BASE}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "k2.6-serve-poc" }),
    });
    console.log(`[*] session ${session.id}`);

    console.log(`[User] ${prompt}`);
    const message = await jsonFetch(`${BASE}/session/${session.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerID: MODEL_PROVIDER,
        modelID: MODEL_ID,
        parts: [{ type: "text", text: prompt }],
      }),
    });

    console.log(`[Kimi K2.6] ${extractText(message)}\n`);

    const info = message.info ?? {};
    const t = info.tokens ?? {};
    console.log(
      `[meta] model=${info.providerID}/${info.modelID} ` +
        `tokens(in=${t.input ?? "?"} out=${t.output ?? "?"} ` +
        `reasoning=${t.reasoning ?? "?"} cacheRead=${t.cache?.read ?? "?"}) ` +
        `cost=${info.cost ?? "?"} parts=[${(message.parts ?? []).map((p: any) => p.type).join(", ")}]`
    );
  } finally {
    proc.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
