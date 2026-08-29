/**
 * Model-matrix benchmark: the SAME content migration through N models, each
 * result scored by the SAME eval engine (4 dimensions, fixed judge model) —
 * the "Model and Prompt Comparison" slide with real numbers.
 *
 * For each selected model it:
 *   1. runs `migration.run` (backend opencode for Kimi, sdk for Claude) on one
 *      shared legacy source page → a real da.live page per model
 *   2. verifies the published preview answers, then runs `eval.run` in
 *      fidelity mode (source vs target) with the eval agent's fixed judge
 *   3. records per-dimension scores + overall + timing into
 *      agents/output/model-matrix/<folder>/results.{json,md} (written after
 *      every run, so a crash loses nothing)
 *
 * Requirements (env / agents/.env): CLAUDE_CODE_OAUTH_TOKEN (sdk backend +
 * agentic eval), MOONSHOT_API_KEY (Kimi models). Spawns its own migration +
 * eval agents on isolated 14xxx ports — no dev servers needed.
 *
 * Usage (from agents/):
 *   npm run model-matrix                                  # all five models
 *   npm run model-matrix -- --models k3,sonnet            # subset
 *   npm run model-matrix -- --source <url> --folder my-run
 */
import "@agents/a2a-common"; // side effect: disables undici's 300s fetch timeouts (quiet SSE > 5 min)
import { ClientFactory } from "@a2a-js/sdk/client";
import type { TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from "@a2a-js/sdk";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startAgent, stopAgent, type AgentHandle } from "../helpers/mesh.ts";

// ── configuration ───────────────────────────────────────────────────────────

interface ModelConfig {
  key: string;
  label: string;
  backend: "opencode" | "sdk" | "dryrun";
  model?: string;
  /** Not part of the default lineup — must be selected via --models. */
  optIn?: boolean;
}

/** The comparison lineup. Kimi via the opencode backend, Claude via the Agent SDK backend. */
const MODELS: ModelConfig[] = [
  { key: "k3", label: "Kimi K3", backend: "opencode", model: "k3" },
  { key: "k27", label: "Kimi K2.7", backend: "opencode", model: "kimi-for-coding" },
  { key: "sonnet", label: "Claude Sonnet 5", backend: "sdk", model: "claude-sonnet-5" },
  { key: "opus", label: "Claude Opus 5", backend: "sdk", model: "claude-opus-5" },
  { key: "haiku", label: "Claude Haiku 4.5", backend: "sdk", model: "claude-haiku-4-5" },
  // Pipeline smoke: simulated migration (previewUrl = source), still runs the real eval.
  { key: "dryrun", label: "Dryrun (smoke)", backend: "dryrun", optIn: true },
];

// Mirrors coordinator/src/site-profiles.ts for adapt-to-2026-demo (the harness
// drives the migration agent directly, so it threads the profile itself).
const AEM_BASE = "https://main--adapt-to-2026-demo--jackzhaojin.aem.page";
const DEFAULTS = {
  source: "https://www.jackzhaojin.com/adapt-to-2026-demo/articles/one-week-above-10000-feet.html",
  site: "adapt-to-2026-demo",
  owner: "jackzhaojin",
  slugBase: "one-week-above-10000-feet",
  blockLibraryUrl: `${AEM_BASE}/ai-content/blocks/`,
  neighborPageUrl: `${AEM_BASE}/ai-content/stories/chasing-sunsets`,
  pattern: "article",
  guidance:
    "Image quality: before using an image (especially the hero), check its actual resolution ONCE (Playwright naturalWidth, or the image URL). " +
    "If the best copy is narrower than ~1200px, make ONE quick attempt to find a higher-res variant of the SAME image (srcset, og:image meta, a thumbnail's full-size link target). " +
    'Use the best you find — never drop the image. If only a low-res copy exists, keep it and record the resolution in the final report\'s gaps (e.g. "hero image only 600×400 — needs a higher-res replacement").',
};

const MIGRATION_PORT = 14431;
const EVAL_PORT = 14432;
const STREAM_RECOVERY_MAX_MS = 50 * 60_000;
const STREAM_RECOVERY_POLL_MS = 10_000;
const TERMINAL = new Set(["completed", "failed", "canceled", "rejected"]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// ── one task against one agent (stream + tasks/get recovery, from coordinator's callAgent) ──

interface CallResult {
  taskId?: string;
  state: string;
  artifact?: Record<string, unknown>;
  error?: string;
  notes: string[];
  durationMs: number;
}

async function callAgent(agentUrl: string, data: Record<string, unknown>, tag: string): Promise<CallResult> {
  const t0 = Date.now();
  const notes: string[] = [];
  const say = (n: string) => {
    notes.push(n);
    console.log(`  [${tag}] ${n}`);
  };
  try {
    const client = await new ClientFactory().createFromUrl(agentUrl);
    let taskId: string | undefined;
    let state = "unknown";
    let artifact: Record<string, unknown> | undefined;
    let failNote = "";

    try {
      for await (const event of client.sendMessageStream({
        message: { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] },
      })) {
        if (event.kind === "task") taskId = event.id;
        if (event.kind === "status-update") {
          const e = event as TaskStatusUpdateEvent;
          state = e.status.state;
          const note = e.status.message?.parts.find((p) => p.kind === "text")?.text;
          if (note) say(note);
          if (e.final && state === "failed") failNote = note ?? "";
        }
        if (event.kind === "artifact-update") {
          const part = (event as TaskArtifactUpdateEvent).artifact.parts[0];
          if (part?.kind === "data") artifact = part.data as Record<string, unknown>;
        }
      }
    } catch (streamErr) {
      if (!taskId) throw streamErr;
      say(`stream interrupted (${String(streamErr).slice(0, 80)}) — recovering via tasks/get`);
    }

    if (taskId && !TERMINAL.has(state)) {
      const deadline = Date.now() + STREAM_RECOVERY_MAX_MS;
      while (Date.now() < deadline && !TERMINAL.has(state)) {
        await new Promise((r) => setTimeout(r, STREAM_RECOVERY_POLL_MS));
        try {
          const task = await client.getTask({ id: taskId });
          state = task.status.state;
          if (TERMINAL.has(state)) {
            for (const a of task.artifacts ?? []) {
              const part = a.parts[0];
              if (part?.kind === "data") artifact = part.data as Record<string, unknown>;
            }
            if (state === "failed") failNote = task.status.message?.parts.find((p) => p.kind === "text")?.text ?? "";
          }
        } catch {
          /* transient — keep polling */
        }
      }
      if (!TERMINAL.has(state)) return { taskId, state: "failed", error: `task stuck at '${state}'`, notes, durationMs: Date.now() - t0 };
      say(`recovered via tasks/get: ${state}`);
    }

    return { taskId, state, artifact, ...(failNote ? { error: failNote } : {}), notes, durationMs: Date.now() - t0 };
  } catch (err) {
    return { state: "failed", error: String(err), notes, durationMs: Date.now() - t0 };
  }
}

// ── the matrix ──────────────────────────────────────────────────────────────

interface RunRecord {
  key: string;
  label: string;
  backend: string;
  model?: string;
  pageSlug: string;
  previewUrl?: string;
  migration: {
    state: string;
    status?: string;
    confidence?: number;
    blocksUsed?: string[];
    gaps?: string[];
    durationMs: number;
    error?: string;
  };
  eval?: {
    state: string;
    overallScore?: number;
    grade?: string;
    dimensionScores?: Record<string, number>;
    /** Per-dimension scoring mode — 'agentic' is the real judge; 'deterministic-*' means the Claude pass didn't run. */
    dimensionModes?: Record<string, string>;
    /** The Claude model that judged this row — must be identical across all rows. */
    judgeModel?: string;
    durationMs: number;
    error?: string;
  };
}

async function main(): Promise<void> {
  const source = arg("source") ?? DEFAULTS.source;
  const site = arg("site") ?? DEFAULTS.site;
  const owner = arg("owner") ?? DEFAULTS.owner;
  const folder = arg("folder") ?? `model-matrix-${new Date().toISOString().slice(0, 10)}`;
  const selected = (arg("models") ?? MODELS.filter((m) => !m.optIn).map((m) => m.key).join(","))
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const lineup = selected.map((k) => {
    const m = MODELS.find((mm) => mm.key === k);
    if (!m) throw new Error(`unknown model key '${k}' — available: ${MODELS.map((mm) => mm.key).join(", ")}`);
    return m;
  });

  // 'redesign' (default): replatform-aware scoring — content stays source-aware,
  // visual judges carryover + new-template execution instead of like-for-like.
  // Pass --eval-mode fidelity to reproduce the strict comparison behavior.
  const evalMode = arg("eval-mode") ?? "redesign";
  // --eval-only: reuse each model's previously-migrated page (from this folder's
  // results.json) and just re-score it — free for quota-limited models.
  const evalOnly = process.argv.includes("--eval-only");

  const scriptsDir = dirname(fileURLToPath(import.meta.url));
  const outDir = arg("out") ?? join(scriptsDir, "..", "..", "output", "model-matrix", folder);
  mkdirSync(outDir, { recursive: true });

  console.log(`model matrix: ${lineup.map((m) => m.label).join(" · ")}`);
  console.log(`source: ${source}`);
  console.log(`target: ${owner}/${site}/${folder}/`);
  console.log(`output: ${outDir}\n`);

  // Scrub any invoking Claude Code session's plumbing (running this harness
  // from inside Claude Code leaks CLAUDE_CODE_* / ANTHROPIC_BASE_URL session
  // vars; nested agentic passes then exit 1). Spawned agents must see the env
  // a clean user shell would give them.
  for (const k of Object.keys(process.env)) {
    if (k === "CLAUDE_CODE_OAUTH_TOKEN") continue;
    if (k.startsWith("CLAUDE") || k === "ANTHROPIC_BASE_URL") delete process.env[k];
  }

  const oauth = process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "";
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!oauth && !apiKey) throw new Error("CLAUDE_CODE_OAUTH_TOKEN (or ANTHROPIC_API_KEY) required — source agents/.env");
  // Eval-only reruns make no Kimi calls (the judge is Claude), so the key is
  // only needed when a Kimi model will actually migrate. A missing prior row
  // under --eval-only falls back to migration and fails with a clear task error.
  const needsKimi = lineup.some((m) => m.backend === "opencode") && !evalOnly;
  if (needsKimi && !process.env.MOONSHOT_API_KEY) throw new Error("MOONSHOT_API_KEY required for Kimi models");

  const aiEnv: Record<string, string> = {};
  if (oauth) aiEnv.CLAUDE_CODE_OAUTH_TOKEN = oauth;
  if (apiKey) aiEnv.ANTHROPIC_API_KEY = apiKey;

  console.log("starting migration + eval agents…");
  const migration = await startAgent("migration-agent", MIGRATION_PORT, { env: { ...aiEnv } });
  const evalAgent = await startAgent("eval-service", EVAL_PORT, { env: { ...aiEnv, EVAL_ENGINE: "real" } });
  const cleanup = async () => {
    await Promise.allSettled([stopAgent(migration), stopAgent(evalAgent)]);
  };
  process.on("SIGINT", () => cleanup().then(() => process.exit(130)));

  // Resume-friendly: rerunning a subset into the same folder keeps prior rows
  // (e.g. quota-limited Kimi runs) and replaces only the models selected now.
  const records: RunRecord[] = [];
  const priorByKey = new Map<string, RunRecord>();
  const resultsPath = join(outDir, "results.json");
  if (existsSync(resultsPath)) {
    try {
      const prior = JSON.parse(readFileSync(resultsPath, "utf8")) as { records?: RunRecord[] };
      const rerun = new Set(lineup.map((m) => m.key));
      for (const r of prior.records ?? []) {
        priorByKey.set(r.key, r);
        if (!rerun.has(r.key)) records.push(r);
      }
      if (records.length) console.log(`kept ${records.length} prior row(s): ${records.map((r) => r.key).join(", ")}\n`);
    } catch {
      /* unreadable prior results — start fresh */
    }
  }
  const order = (r: RunRecord) => {
    const i = MODELS.findIndex((m) => m.key === r.key);
    return i === -1 ? MODELS.length : i;
  };
  const persist = () => {
    records.sort((a, b) => order(a) - order(b));
    writeFileSync(
      resultsPath,
      JSON.stringify({ source, site, owner, folder, evalMode, generatedAt: new Date().toISOString(), records }, null, 2)
    );
    writeFileSync(join(outDir, "results.md"), renderMarkdown(source, folder, records, evalMode));
  };

  try {
    for (const m of lineup) {
      const pageSlug = `${arg("slug") ?? DEFAULTS.slugBase}-${m.key}`;
      console.log(`\n━━ ${m.label} (${m.backend}/${m.model}) → /${folder}/${pageSlug} ━━`);

      // Eval-only rerun: the page already exists from a prior migration — reuse
      // that row's migration outcome and just re-score under the current eval mode.
      const prior = evalOnly ? priorByKey.get(m.key) : undefined;
      if (prior?.previewUrl && prior.migration.state === "completed") {
        console.log(`  [${m.key}·migrate] eval-only: reusing ${prior.previewUrl}`);
      }
      const mig: CallResult = prior?.previewUrl && prior.migration.state === "completed"
        ? {
            state: prior.migration.state,
            artifact: {
              previewUrl: prior.previewUrl,
              status: prior.migration.status,
              confidence: prior.migration.confidence,
              blocksUsed: prior.migration.blocksUsed,
              gaps: prior.migration.gaps,
            },
            notes: [`eval-only: reusing page migrated earlier (${prior.previewUrl})`],
            durationMs: prior.migration.durationMs,
          }
        : await callAgent(
        migration.url,
        {
          sourceType: "webpage",
          sourceLocation: source,
          site,
          owner,
          pageSlug,
          folder,
          blockLibraryUrl: DEFAULTS.blockLibraryUrl,
          neighborPageUrl: DEFAULTS.neighborPageUrl,
          pattern: DEFAULTS.pattern,
          guidance: DEFAULTS.guidance,
          backend: m.backend,
          ...(m.model ? { model: m.model } : {}),
          maxRefinementIterations: 2,
        },
        `${m.key}·migrate`
      );

      const rec: RunRecord = {
        key: m.key,
        label: m.label,
        backend: m.backend,
        model: m.model,
        pageSlug,
        previewUrl: typeof mig.artifact?.previewUrl === "string" ? (mig.artifact.previewUrl as string) : undefined,
        migration: {
          state: mig.state,
          status: mig.artifact?.status as string | undefined,
          confidence: mig.artifact?.confidence as number | undefined,
          blocksUsed: mig.artifact?.blocksUsed as string[] | undefined,
          gaps: mig.artifact?.gaps as string[] | undefined,
          durationMs: mig.durationMs,
          ...(mig.error ? { error: mig.error } : {}),
        },
      };
      records.push(rec);
      persist();

      // Only evaluate a page that actually answers (an honest 404 shouldn't
      // produce a fake eval row — it stays a migration failure).
      if (mig.state === "completed" && rec.previewUrl) {
        let live = false;
        for (let i = 0; i < 6 && !live; i++) {
          try {
            const res = await fetch(rec.previewUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000) });
            live = res.ok;
          } catch {
            /* not yet */
          }
          if (!live) await new Promise((r) => setTimeout(r, 5_000));
        }
        if (!live) {
          rec.eval = { state: "skipped", error: `preview URL never answered 200: ${rec.previewUrl}`, durationMs: 0 };
          persist();
          continue;
        }

        // Tag names the PAGE under evaluation and the judge — "[k3·eval]" read
        // like K3 was doing the judging; it never is (the judge is the eval
        // engine's fixed Claude model for every row).
        const judgeLabel = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
        const ev = await callAgent(
          evalAgent.url,
          {
            targetUrl: rec.previewUrl,
            sourceType: "webpage",
            sourceLocation: source,
            mode: evalMode,
            labels: { matrix: folder, model: m.key, backend: m.backend },
          },
          `${judgeLabel} scoring ${m.key}-page`
        );
        const fullReport = ev.artifact?.report as
          | { results?: Record<string, { metadata?: { mode?: string; agentic?: { model?: string } } }> }
          | undefined;
        const dimensionModes: Record<string, string> = {};
        let judgeModel: string | undefined;
        for (const [dim, res] of Object.entries(fullReport?.results ?? {})) {
          if (res?.metadata?.mode) dimensionModes[dim] = res.metadata.mode;
          judgeModel ??= res?.metadata?.agentic?.model;
        }
        rec.eval = {
          state: ev.state,
          overallScore: ev.artifact?.overallScore as number | undefined,
          grade: ev.artifact?.grade as string | undefined,
          dimensionScores: ev.artifact?.dimensionScores as Record<string, number> | undefined,
          ...(Object.keys(dimensionModes).length ? { dimensionModes } : {}),
          ...(judgeModel ? { judgeModel } : {}),
          durationMs: ev.durationMs,
          ...(ev.error ? { error: ev.error } : {}),
        };
        if (fullReport) writeFileSync(join(outDir, `eval-report-${m.key}.json`), JSON.stringify(fullReport, null, 2));
        persist();
      }
    }
  } finally {
    await cleanup();
  }

  console.log(`\n${renderMarkdown(source, folder, records, evalMode)}`);
  console.log(`results: ${join(outDir, "results.json")}`);
}

function renderMarkdown(source: string, folder: string, records: RunRecord[], evalMode: string): string {
  const fmtMin = (ms: number) => `${(ms / 60_000).toFixed(1)}m`;
  const judges = [...new Set(records.map((r) => r.eval?.judgeModel).filter(Boolean))] as string[];
  const judgeLine = judges.length
    ? `Judge: **${judges.join(" / ")}** (agentic eval engine, ${evalMode} mode) — constant across rows${judges.length > 1 ? " ⚠️ JUDGE VARIED — rows not comparable" : ""}.`
    : `Judge: eval engine, ${evalMode} mode.`;
  const lines = [
    `# Model matrix — ${folder}`,
    "",
    `Same source (${source}), same prompt/skill/tools. ${judgeLine}`,
    "",
    "| Configuration | Structure | Accessibility | Content Fidelity | Visual Correctness | Overall | Migration confidence | Migration time | Eval time |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of records) {
    const d = r.eval?.dimensionScores ?? {};
    const cell = (k: string) => (typeof d[k] === "number" ? String(d[k]) : "—");
    const failed = r.migration.state !== "completed" ? " (migration failed)" : r.eval && r.eval.state !== "completed" ? ` (eval ${r.eval.state})` : "";
    lines.push(
      `| ${r.label}${failed} | ${cell("structure")} | ${cell("accessibility")} | ${cell("content")} | ${cell("visual")} | ` +
        `${r.eval?.overallScore ?? "—"} | ${r.migration.confidence ?? "—"} | ${fmtMin(r.migration.durationMs)} | ${r.eval ? fmtMin(r.eval.durationMs) : "—"} |`
    );
  }
  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
