/**
 * Claude Agent SDK probe: one tiny agent turn with the SAME harness options the
 * sdk migration backend uses (bypassPermissions, the platform Claude binary the
 * SDK resolves, CLAUDE_CODE_OAUTH_TOKEN auth), plus one Bash tool call so the
 * permission-bypass path is exercised, not just a chat reply.
 *
 * Why it exists: the sdk backend became the default migration backend in 2026-10
 * and had never run in the Cloudflare image. That image runs as root, where the
 * Claude binary refuses bypassPermissions unless IS_SANDBOX=1, and headless OAuth
 * needs the .claude.json account stanza the entrypoint writes. A failed migration
 * explains none of that, so this makes "can this image run Claude" one command:
 *
 *   npm run probe:sdk -w @agents/migration-agent -- [model]             # local
 *   docker run --rm -e CLAUDE_CODE_OAUTH_TOKEN -e CLAUDE_ACCOUNT_UUID \
 *     -e CLAUDE_EMAIL -e CLAUDE_ORG_UUID <migration-image> npx tsx src/sdk-probe.ts
 *
 * Spends one short turn (default model haiku). Prints a JSON report.
 * Exit 0 = the session started, the Bash call ran, and the run ended in success.
 */
import { mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";

export interface SdkProbeResult {
  ok: boolean;
  model: string;
  resolvedModel?: string;
  /** What `id -u` printed inside the session (0 = running as root). */
  uid?: string;
  isSandbox: boolean;
  bashRan: boolean;
  ms: number;
  costUsd?: number;
  error?: string;
  /** Last lines the Claude binary wrote to stderr - where the root guard and auth errors show up. */
  stderrTail?: string;
}

export async function probeSdk(opts: { model?: string; timeoutMs?: number } = {}): Promise<SdkProbeResult> {
  const model = opts.model || "haiku";
  const started = Date.now();
  const result: SdkProbeResult = { ok: false, model, isSandbox: process.env.IS_SANDBOX === "1", bashRan: false, ms: 0 };
  const stderr: string[] = [];
  const cwd = mkdtempSync(path.join(os.tmpdir(), "sdk-probe-"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("sdk probe timed out")), opts.timeoutMs ?? 120_000);
  const texts: string[] = [];
  let success = false;

  try {
    for await (const message of query({
      prompt: "Run the shell command `id -u` with the Bash tool. Then reply with exactly one line: UID=<the number it printed>",
      options: {
        model,
        cwd,
        maxTurns: 4,
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: [], // nothing from disk: this checks the harness, not a project
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        persistSession: false,
        abortController: controller,
        stderr: (data: string) => stderr.push(data),
      },
    })) {
      if (message.type === "system" && message.subtype === "init") result.resolvedModel = message.model;
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) texts.push(block.text);
          if (block.type === "tool_use" && block.name === "Bash") result.bashRan = true;
        }
      }
      if (message.type === "result") {
        result.costUsd = message.total_cost_usd;
        success = message.subtype === "success";
        if (!success) result.error = `run ended: ${message.subtype}`;
      }
    }
    result.uid = texts.join("\n").match(/UID=(\d+)/)?.[1];
    if (!result.bashRan) result.error ??= "the Bash tool never ran (permission bypass not exercised)";
    result.ok = success && result.bashRan && result.uid !== undefined;
    if (!result.ok) result.error ??= `no UID line in the reply: ${texts.join(" ").slice(0, 200)}`;
  } catch (err) {
    result.error = String(err instanceof Error ? err.message : err);
  } finally {
    clearTimeout(timer);
    rmSync(cwd, { recursive: true, force: true });
    result.ms = Date.now() - started;
    const tail = stderr.join("").trim().split("\n").slice(-8).join("\n");
    if (tail) result.stderrTail = tail;
  }
  return result;
}

// CLI: `tsx src/sdk-probe.ts [model]`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await probeSdk({ model: process.argv[2] });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
