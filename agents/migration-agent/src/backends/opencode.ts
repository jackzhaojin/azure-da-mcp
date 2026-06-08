import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createLogger } from "@agents/a2a-common";
import type { MigrationBackend, MigrationRunPayload, MigrationResult, BackendContext } from "./types.ts";
import {
  buildOpencodeConfig,
  resolveOpencodeBin,
  resolveSkillsPath,
  playwrightOutputDir,
  opencodeSetupProblem,
  KIMI_PROVIDER_ID,
  KIMI_MODEL_ID,
  DEFAULT_DALIVE_MCP_URL,
} from "./opencode-config.ts";
import { buildMigrationPrompt, migrationTargets, parseMigrationReport } from "./opencode-prompt.ts";

const log = createLogger("da-migration-agent");

/**
 * opencode / Kimi K2.6 migration backend (PRD part-5, Backend C).
 *
 * Drives Kimi K2.6 headlessly via a long-lived `opencode serve` (one per agent
 * process, lazily started + reused), giving the model the da.live MCP, the
 * Playwright MCP, and the reused `da-live-author-playwright` skill. One A2A
 * `migration.run` task = one opencode session. Tool/skill firing is surfaced
 * live off the server's SSE /event stream → A2A status updates (observability).
 *
 * Reference: references/kimi/opencode/a2a-backend-poc.ts (the proven serve+REST
 * path) + kimi-k2.6-opencode-backend-findings.md.
 */

const TURN_TIMEOUT_MS = Number(process.env.OPENCODE_MIGRATION_TIMEOUT_MS ?? 20 * 60 * 1000);

// ── long-lived server singleton ─────────────────────────────────────────────
interface OpencodeServer {
  base: string;
  proc: ChildProcess;
}
let serverPromise: Promise<OpencodeServer> | null = null;
let serverChild: ChildProcess | null = null; // direct ref for synchronous cleanup on exit

function startServer(): Promise<OpencodeServer> {
  const bin = resolveOpencodeBin();
  const workdir = path.join(os.tmpdir(), "a2a-opencode-migration");
  const pwOut = playwrightOutputDir();
  mkdirSync(workdir, { recursive: true });
  mkdirSync(pwOut, { recursive: true });

  const config = buildOpencodeConfig({
    daliveUrl: process.env.DALIVE_MCP_URL ?? DEFAULT_DALIVE_MCP_URL,
    daliveBearer: process.env.DALIVE_BEARER_TOKEN || undefined,
    skillsPath: resolveSkillsPath(),
    playwrightOut: pwOut,
  });
  const cfgPath = path.join(workdir, "opencode.json");
  writeFileSync(cfgPath, JSON.stringify(config, null, 2));

  log.info("opencode serve starting", {
    bin,
    dalive_url: (config.mcp as any).dalive.url,
    skills_path: (config.skills as any).paths[0],
  });

  const proc = spawn(bin, ["serve", "--port", "0", "--hostname", "127.0.0.1", "--log-level", "INFO"], {
    cwd: workdir,
    env: { ...process.env, OPENCODE_CONFIG: cfgPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverChild = proc;

  return new Promise<OpencodeServer>((resolve, reject) => {
    let settled = false;
    const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
    const onData = (b: Buffer) => {
      const s = strip(b.toString());
      const m = s.match(/listening on\s+(https?:\/\/[^\s]+)/i);
      if (!settled && m) {
        settled = true;
        const base = m[1].replace(/\/+$/, "");
        log.info("opencode serve up", { base });
        resolve({ base, proc });
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("exit", (code) => {
      serverPromise = null; // allow a restart on the next task
      serverChild = null;
      if (!settled) reject(new Error(`opencode serve exited early (code ${code})`));
    });
    setTimeout(() => !settled && reject(new Error("timed out waiting for opencode serve to listen")), 45_000);
  });
}

function getServer(): Promise<OpencodeServer> {
  if (!serverPromise) serverPromise = startServer().catch((e) => ((serverPromise = null), Promise.reject(e)));
  return serverPromise;
}

// Don't leak `opencode serve`. On natural exit, kill it synchronously. On a
// signal, kill it then terminate — registering a SIGTERM/SIGINT listener
// suppresses Node's default termination, so we must call process.exit ourselves
// (else `stopAgent`/graceful shutdown hangs waiting for a process that won't die).
function killServerChild(): void {
  try {
    serverChild?.kill("SIGTERM");
  } catch {
    /* already gone */
  }
}
process.once("exit", killServerChild);
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => {
    killServerChild();
    process.exit(0);
  });
}

// ── REST + event tap ────────────────────────────────────────────────────────
async function postJson(base: string, p: string, body: unknown, timeoutMs = 30_000): Promise<any> {
  const res = await fetch(`${base}${p}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`opencode ${p} → HTTP ${res.status} ${await res.text().catch(() => "")}`.trim());
  return res.json();
}

/**
 * Tap the server's SSE /event stream and surface this session's tool + skill
 * firing through onProgress (the observability requirement). Returns a stopper
 * and a live summary (tools fired, whether the skill fired, validation count).
 */
function tapSession(base: string, sessionId: string, onProgress: (note: string) => void) {
  const ctrl = new AbortController();
  const summary = { toolsFired: new Set<string>(), skillFired: false, validations: 0, errors: [] as string[] };
  const seen = new Set<string>(); // partID:state → emit once

  (async () => {
    const res = await fetch(`${base}/event`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.startsWith("data: ") ? line.slice(6) : line;
        if (!t.trim()) continue;
        let ev: any;
        try {
          ev = JSON.parse(t);
        } catch {
          continue;
        }
        if (ev.type !== "message.part.updated") continue;
        const part = ev.properties?.part;
        if (!part || part.type !== "tool") continue;
        if (part.sessionID && part.sessionID !== sessionId) continue;
        const status: string = part.state?.status ?? "";
        const key = `${part.id}:${status}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const tool: string = part.tool ?? "tool";
        if (status === "running") {
          if (tool === "skill") {
            const skillName = part.state?.input?.skill ?? part.state?.input?.name ?? "skill";
            summary.skillFired ||= /da-live-author-playwright/.test(JSON.stringify(part.state?.input ?? {}));
            onProgress(`K2.6 → skill ${skillName}`);
          } else {
            summary.toolsFired.add(tool);
            if (/playwright_browser_(navigate|snapshot|take_screenshot)/.test(tool)) summary.validations++;
            onProgress(`K2.6 → ${tool}`);
          }
        } else if (status === "error") {
          const errText = String(part.state?.error ?? part.state?.title ?? "tool error").slice(0, 200);
          summary.errors.push(`${tool}: ${errText}`);
          onProgress(`K2.6 ✗ ${tool}: ${errText}`);
        }
      }
    }
  })().catch(() => {
    /* aborted or stream closed — expected at end of turn */
  });

  return { summary, stop: () => ctrl.abort() };
}

// ── the backend ─────────────────────────────────────────────────────────────
export const opencodeBackend: MigrationBackend = {
  name: "opencode",

  assertConfigured() {
    const problem = opencodeSetupProblem();
    if (problem) throw new Error(problem);
  },

  async run(payload: MigrationRunPayload, ctx: BackendContext): Promise<MigrationResult> {
    const targets = migrationTargets(payload);

    ctx.onProgress("opencode/K2.6: starting headless server");
    const { base } = await getServer();

    const session = await postJson(base, "/session", { title: `migration ${payload.pageSlug}` });
    const sessionId: string = session.id;
    log.info("opencode session created", { a2a_task_id: ctx.taskId, session_id: sessionId, slug: payload.pageSlug });

    const tap = tapSession(base, sessionId, ctx.onProgress);
    ctx.onProgress(`opencode/K2.6: migrating ${payload.sourceType} ${payload.sourceLocation} → ${targets.folder}/${payload.pageSlug}`);

    let message: any;
    try {
      message = await postJson(
        base,
        `/session/${sessionId}/message`,
        {
          providerID: KIMI_PROVIDER_ID,
          modelID: KIMI_MODEL_ID,
          parts: [{ type: "text", text: buildMigrationPrompt({ payload, ...targets }) }],
        },
        TURN_TIMEOUT_MS
      );
    } finally {
      // give the event stream a beat to flush the final tool states, then stop
      await new Promise((r) => setTimeout(r, 250));
      tap.stop();
    }

    if (message?.info?.error) throw new Error(`opencode/K2.6 turn errored: ${JSON.stringify(message.info.error).slice(0, 300)}`);

    const text = (message?.parts ?? [])
      .filter((p: { type: string; text?: string }) => p.type === "text" && typeof p.text === "string")
      .map((p: { text: string }) => p.text)
      .join("\n")
      .trim();

    const result = parseMigrationReport(text, payload, targets, { refinementIterations: tap.summary.validations || undefined });

    // fold observed gaps in (e.g. a 401 the model hit) so the artifact is honest
    if (tap.summary.errors.length) result.gaps = [...result.gaps, ...tap.summary.errors];

    log.info("opencode/K2.6 migration done", {
      a2a_task_id: ctx.taskId,
      status: result.status,
      confidence: result.confidence,
      skill_fired: tap.summary.skillFired,
      tools_fired: [...tap.summary.toolsFired],
      validations: tap.summary.validations,
      tokens: message?.info?.tokens,
      cost: message?.info?.cost,
    });
    ctx.onProgress(
      `opencode/K2.6: done — ${result.status} (${result.confidence}%), skill ${tap.summary.skillFired ? "fired" : "not detected"}, ${tap.summary.toolsFired.size} tool(s)`
    );

    return result;
  },
};
