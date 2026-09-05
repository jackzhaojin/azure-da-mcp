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
  KIMI_API_BASE,
  DEFAULT_DALIVE_MCP_URL,
  resolveKimiModelLabel,
} from "./opencode-config.ts";
import { buildMigrationPrompt, migrationTargets, parseMigrationReport } from "./opencode-prompt.ts";
import { startKimiProxy, type KimiProxy } from "./kimi-proxy.ts";
import { loadRunMemory } from "../memory.ts";

const log = createLogger("da-migration-agent");

/**
 * opencode / Kimi migration backend (PRD part-5, Backend C).
 *
 * Drives Kimi headlessly via a long-lived `opencode serve` (one per agent
 * process, lazily started + reused), giving the model the da.live MCP, the
 * Playwright MCP, and the reused `da-live-author-playwright` skill. One A2A
 * `migration.run` task = one opencode session. Tool/skill firing is surfaced
 * live off the server's SSE /event stream → A2A status updates (observability).
 *
 * Reference: references/kimi/opencode/a2a-backend-poc.ts (the proven serve+REST
 * path) + kimi-k2.6-opencode-backend-findings.md.
 */

const TURN_TIMEOUT_MS = Number(process.env.OPENCODE_MIGRATION_TIMEOUT_MS ?? 40 * 60 * 1000);
/**
 * When a turn dies on a provider error (Kimi 400 on a replayed empty turn, an
 * SSE read timeout opencode gave up on), send ONE follow-up message in the SAME
 * session instead of failing the task: the work already done (files, da.live
 * pages, previews) survives, and the wire-repair proxy makes the replayed
 * history acceptable. Bounded by the original turn budget - never extends it.
 */
const MAX_CONTINUATIONS = Math.max(0, Number(process.env.OPENCODE_MAX_CONTINUATIONS ?? 1) || 0);
/** Don't start a continuation with less than this left on the clock. */
const MIN_CONTINUATION_BUDGET_MS = 4 * 60 * 1000;

// ── long-lived server singleton ─────────────────────────────────────────────
interface OpencodeServer {
  base: string;
  proc: ChildProcess;
}
let serverPromise: Promise<OpencodeServer> | null = null;
let serverChild: ChildProcess | null = null; // direct ref for synchronous cleanup on exit
let kimiProxy: KimiProxy | null = null; // one per process, outlives opencode restarts

/** For /health: where the Kimi traffic goes + what the proxy has had to repair. */
export function kimiProxyStatus() {
  return kimiProxy ? { base: kimiProxy.base, upstream: kimiProxy.upstream, ...kimiProxy.stats } : null;
}

/**
 * Confirm the generated config actually rerouted the provider (a silent merge
 * miss would mean the proxy is idle and the 400s come back). Never fatal.
 */
async function verifyProxyWiring(base: string, expectedBaseURL: string): Promise<void> {
  try {
    const cfg = await (await fetch(`${base}/config`, { signal: AbortSignal.timeout(10_000) })).json();
    const actual = (cfg as any)?.provider?.[KIMI_PROVIDER_ID]?.options?.baseURL;
    if (actual === expectedBaseURL) {
      log.info("opencode kimi-code provider routed through the wire-repair proxy", { baseURL: actual });
    } else {
      log.warn("opencode kimi-code provider is NOT using the wire-repair proxy - empty-assistant 400s can recur", {
        expected: expectedBaseURL,
        actual: actual ?? null,
      });
    }
  } catch (e) {
    log.warn("could not verify opencode provider wiring", { error: String(e).slice(0, 200) });
  }
}

async function startServer(): Promise<OpencodeServer> {
  const bin = resolveOpencodeBin();
  const workdir = path.join(os.tmpdir(), "a2a-opencode-migration");
  const pwOut = playwrightOutputDir();
  mkdirSync(workdir, { recursive: true });
  mkdirSync(pwOut, { recursive: true });

  // The Kimi wire-repair proxy (kimi-proxy.ts): opencode → 127.0.0.1 → api.kimi.com.
  // KIMI_PROXY_DISABLED=1 restores the direct path (debugging lever only).
  if (!kimiProxy && process.env.KIMI_PROXY_DISABLED !== "1") {
    kimiProxy = await startKimiProxy({ upstream: KIMI_API_BASE });
  }
  const kimiBaseURL = kimiProxy ? `${kimiProxy.base}${new URL(KIMI_API_BASE).pathname}` : undefined;

  const config = buildOpencodeConfig({
    daliveUrl: process.env.DALIVE_MCP_URL ?? DEFAULT_DALIVE_MCP_URL,
    daliveBearer: process.env.DALIVE_BEARER_TOKEN || undefined,
    skillsPath: resolveSkillsPath(),
    playwrightOut: pwOut,
    kimiBaseURL,
  });
  const cfgPath = path.join(workdir, "opencode.json");
  writeFileSync(cfgPath, JSON.stringify(config, null, 2));

  log.info("opencode serve starting", {
    bin,
    dalive_url: (config.mcp as any).dalive.url,
    skills_path: (config.skills as any).paths[0],
    kimi_base_url: kimiBaseURL ?? "(direct)",
  });

  const proc = spawn(bin, ["serve", "--port", "0", "--hostname", "127.0.0.1", "--log-level", "INFO"], {
    cwd: workdir,
    env: { ...process.env, OPENCODE_CONFIG: cfgPath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverChild = proc;

  const server = await new Promise<OpencodeServer>((resolve, reject) => {
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

  if (kimiBaseURL) await verifyProxyWiring(server.base, kimiBaseURL);
  return server;
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
  void kimiProxy?.close().catch(() => {});
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
function tapSession(base: string, sessionId: string, onProgress: (note: string) => void, model: string) {
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
            onProgress(`${model} → skill ${skillName}`);
          } else {
            summary.toolsFired.add(tool);
            if (/playwright_browser_(navigate|snapshot|take_screenshot)/.test(tool)) summary.validations++;
            onProgress(`${model} → ${tool}`);
          }
        } else if (status === "error") {
          const errText = String(part.state?.error ?? part.state?.title ?? "tool error").slice(0, 200);
          summary.errors.push(`${tool}: ${errText}`);
          onProgress(`${model} ✗ ${tool}: ${errText}`);
        }
      }
    }
  })().catch(() => {
    /* aborted or stream closed — expected at end of turn */
  });

  return { summary, stop: () => ctrl.abort() };
}

/** The follow-up sent into the same session after a provider-side turn failure. */
function continuationPrompt(reason: string): string {
  return [
    `Your previous turn in this session was cut short by a transient API error (${reason}).`,
    "Everything you already did is still in place: files you wrote, da.live pages you created, previews you published.",
    "Continue the migration from where you left off. Do NOT start over and do NOT re-create pages that already exist.",
    "1. Re-check the current state first (GET the target page on da.live and/or open its preview URL).",
    "2. Finish the remaining steps of the original task.",
    "3. End with the FINAL_REPORT block exactly as the original instructions specified.",
  ].join("\n");
}

const errorSummary = (err: any): string => String(err?.data?.message ?? err?.message ?? err?.name ?? JSON.stringify(err)).slice(0, 160);

// ── the backend ─────────────────────────────────────────────────────────────
export const opencodeBackend: MigrationBackend = {
  name: "opencode",

  assertConfigured() {
    const problem = opencodeSetupProblem();
    if (problem) throw new Error(problem);
  },

  async run(payload: MigrationRunPayload, ctx: BackendContext): Promise<MigrationResult> {
    const targets = migrationTargets(payload);
    // v1's "STEP 1: READ MEMORY" — lessons from previous runs on this site,
    // read deterministically (no model turn spent) and injected into the prompt.
    const memory = await loadRunMemory(payload, ctx.onProgress);

    // Per-run model override (the daily-loop workflow's dropdown) falling back
    // to the container's KIMI_MODEL_ID default.
    const modelId = payload.model || KIMI_MODEL_ID;
    // The real display name behind that id (e.g. "K2.7 Coding", "K3"). Cached
    // per id; falls back to "Kimi" and never throws.
    const model = await resolveKimiModelLabel(modelId);

    ctx.onProgress(`opencode/${model}: starting headless server`);
    const { base } = await getServer();

    const session = await postJson(base, "/session", { title: `migration ${payload.pageSlug}` });
    const sessionId: string = session.id;
    log.info("opencode session created", { a2a_task_id: ctx.taskId, session_id: sessionId, slug: payload.pageSlug });

    const tap = tapSession(base, sessionId, ctx.onProgress, model);
    ctx.onProgress(`opencode/${model}: migrating ${payload.sourceType} ${payload.sourceLocation} → ${targets.folder}/${payload.pageSlug}`);

    // One turn budget covers the prompt AND any continuation - the ceilings above
    // us (coordinator stream recovery, daily-loop MAX_WAIT_S) are sized to it.
    const deadline = Date.now() + TURN_TIMEOUT_MS;
    let message: any;
    let continuations = 0;
    let prompt = buildMigrationPrompt({ payload, ...targets, ...(memory?.text ? { memory: { text: memory.text, editUrl: memory.editUrl } } : {}) });
    try {
      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`opencode/${model}: turn budget (${TURN_TIMEOUT_MS} ms) exhausted`);
        message = await postJson(
          base,
          `/session/${sessionId}/message`,
          { providerID: KIMI_PROVIDER_ID, modelID: modelId, parts: [{ type: "text", text: prompt }] },
          remaining
        );
        const err = message?.info?.error;
        if (!err) break;

        const errText = JSON.stringify(err).slice(0, 300);
        const budgetLeft = deadline - Date.now();
        if (continuations >= MAX_CONTINUATIONS || budgetLeft < MIN_CONTINUATION_BUDGET_MS) {
          const suffix = continuations ? ` (after ${continuations} continuation${continuations > 1 ? "s" : ""})` : "";
          throw new Error(`opencode/${model} turn errored${suffix}: ${errText}`);
        }
        continuations++;
        log.warn("opencode turn errored - continuing in the same session", {
          a2a_task_id: ctx.taskId,
          session_id: sessionId,
          continuation: continuations,
          budget_left_ms: budgetLeft,
          error: errText,
        });
        ctx.onProgress(
          `opencode/${model}: turn errored (${errorSummary(err)}) - continuing in the same session, attempt ${continuations}/${MAX_CONTINUATIONS}`
        );
        prompt = continuationPrompt(errorSummary(err));
      }
    } finally {
      // give the event stream a beat to flush the final tool states, then stop
      await new Promise((r) => setTimeout(r, 250));
      tap.stop();
    }

    const text = (message?.parts ?? [])
      .filter((p: { type: string; text?: string }) => p.type === "text" && typeof p.text === "string")
      .map((p: { text: string }) => p.text)
      .join("\n")
      .trim();

    const result = parseMigrationReport(text, payload, targets, { refinementIterations: tap.summary.validations || undefined });

    // fold observed gaps in (e.g. a 401 the model hit) so the artifact is honest
    if (tap.summary.errors.length) result.gaps = [...result.gaps, ...tap.summary.errors];
    result.memory = memory?.use ?? null;

    log.info("opencode migration done", {
      a2a_task_id: ctx.taskId,
      model,
      model_id: modelId,
      status: result.status,
      confidence: result.confidence,
      skill_fired: tap.summary.skillFired,
      tools_fired: [...tap.summary.toolsFired],
      validations: tap.summary.validations,
      continuations,
      lessons: result.lessons?.length ?? 0,
      memory: result.memory?.status ?? "none",
      kimi_proxy: kimiProxyStatus(),
      tokens: message?.info?.tokens,
      cost: message?.info?.cost,
    });
    ctx.onProgress(
      `opencode/${model}: done — ${result.status} (${result.confidence}%), skill ${tap.summary.skillFired ? "fired" : "not detected"}, ${tap.summary.toolsFired.size} tool(s)`
    );

    return result;
  },
};
