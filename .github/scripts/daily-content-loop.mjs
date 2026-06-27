#!/usr/bin/env node
// @ts-check
/**
 * The agent-led daily content loop — the unattended driver (v2.2).
 *
 * Runs from GitHub Actions (schedule + workflow_dispatch). It is intentionally a
 * plain dependency-free Node script against the public mesh, so the whole run is
 * legible in the Actions log (that observability is why O5/GH-Actions was chosen
 * over a Cloudflare Workflow for the first cut — see
 * ai-docs/2026-06-17-v2.2-agentic-loop/design.md §3.3).
 *
 * What it does, in order:
 *   1. PRE-WARM   — wake the scale-to-zero containers (coordinator + 3 agents) by
 *                   polling /health with retries until each is up. This is the
 *                   "refresh until it works" a human does today, scripted. Nobody
 *                   is here to refresh on a schedule.  (design §3.1)
 *   2. SUBMIT     — POST /a2a coordinate.run (Bearer mesh token, blocking:false).
 *                   No `topic` → the coordinator asks content-gen to ideate one
 *                   (agent-led). No `requestedBy` → user_email NULL → a SHARED
 *                   system run visible to every signed-in dashboard user. (§3.2)
 *   3. RESOLVE    — map the run's contextId → runId via /store/runs (Bearer edge).
 *   4. POLL       — GET /store/runs/:id until terminal. Each poll is an incoming
 *                   request that renews the coordinator's sleepAfter — the poll
 *                   loop IS the keepalive. (§3.3 "fire + poll, don't hold")
 *   5. SUMMARY    — write topic / preview URL / score to the GH step summary.
 *
 * Auth: Google SSO guards only the dashboard pages + /api/*. The Express A2A
 * surface (/a2a, /store/*) is mesh/edge-token gated, so this authenticates AS THE
 * MESH and never touches Google. (server.ts:100-105, runs-routes.ts guard)
 *
 * Exit code: 0 only if the run reached `completed`; non-zero otherwise (so a red
 * GH run means the day's content was NOT produced).
 */

import { randomUUID } from "node:crypto";

// ── config (env, with safe defaults) ────────────────────────────────────────
const COORDINATOR = (process.env.COORDINATOR_BASE || "https://content-factory.jackzhaojin.com").replace(/\/$/, "");
// Derive the three agent health hosts from the coordinator host (content-factory.<zone>).
const ZONE = new URL(COORDINATOR).host.replace(/^content-factory\./, "");
const AGENT_HOSTS = {
  coordinator: COORDINATOR,
  eval: process.env.CLOUD_EVAL_URL || `https://content-factory-eval.${ZONE}`,
  gen: process.env.CLOUD_GEN_URL || `https://content-factory-gen.${ZONE}`,
  migrate: process.env.CLOUD_MIGRATE_URL || `https://content-factory-migrate.${ZONE}`,
};

const MESH_TOKEN = process.env.A2A_MESH_TOKEN;
const EDGE_TOKEN = process.env.A2A_EDGE_TOKEN || MESH_TOKEN;

const GOAL = process.env.GOAL || "full-loop";
const BACKEND = process.env.BACKEND || "opencode";
const SITE = process.env.SITE || "adapt-to-2026-demo";
const OWNER = process.env.OWNER || "jackzhaojin";
// Empty → the coordinator's site profile supplies the lane (wilderness-journal for
// adapt-to-2026-demo); content.ideate's own default is the final fallback.
const LANE = process.env.LANE || "";
const TOPIC = process.env.TOPIC || ""; // empty → coordinator ideates one
const FAN_OUT = Math.max(1, Number(process.env.FAN_OUT || "1") || 1);

const PREWARM_BUDGET_S = Number(process.env.PREWARM_BUDGET_S || "150");
const POLL_INTERVAL_S = Number(process.env.POLL_INTERVAL_S || "30");
const MAX_WAIT_S = Number(process.env.MAX_WAIT_S || "2700"); // 45 min — covers a 20-min Kimi turn + eval
const RESOLVE_BUDGET_S = Number(process.env.RESOLVE_BUDGET_S || "120");
// Self-heal: the migration container is COLD on a daily run (everything sleeps
// between runs), and the first opencode turn after a cold start — or an occasional
// Kimi stall — can hit the 20-min migration timeout. A second attempt runs against
// a now-warm container with a fresh Kimi turn, which is what recovers it in practice.
const MAX_ATTEMPTS = Math.max(1, Number(process.env.MAX_ATTEMPTS || "2") || 2);

if (!MESH_TOKEN) {
  console.error("FATAL: A2A_MESH_TOKEN is required (set it as a GitHub Actions secret).");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowS = () => Math.round(Date.now() / 1000);
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

/** fetch with a hard per-request timeout (cold containers can hang while booting). */
async function fetchT(url, opts = {}, timeoutMs = 30_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── 1. pre-warm: wake every container before spending tokens ─────────────────
async function prewarm() {
  log(`PRE-WARM: waking ${Object.keys(AGENT_HOSTS).length} containers (budget ${PREWARM_BUDGET_S}s)…`);
  const deadline = nowS() + PREWARM_BUDGET_S;
  const results = await Promise.all(
    Object.entries(AGENT_HOSTS).map(async ([name, base]) => {
      let attempt = 0;
      while (nowS() < deadline) {
        attempt++;
        try {
          const res = await fetchT(`${base}/health`, {}, 25_000);
          if (res.status === 200) {
            log(`  ✓ ${name} healthy (attempt ${attempt})`);
            return { name, ok: true };
          }
          log(`  … ${name} → HTTP ${res.status} (attempt ${attempt}), retrying`);
        } catch (e) {
          log(`  … ${name} not ready (attempt ${attempt}: ${String(e).slice(0, 60)}), retrying`);
        }
        await sleep(5000);
      }
      return { name, ok: false };
    })
  );
  const down = results.filter((r) => !r.ok).map((r) => r.name);
  if (down.length) throw new Error(`pre-warm failed — containers still down after ${PREWARM_BUDGET_S}s: ${down.join(", ")}`);
  log("PRE-WARM: all containers healthy.");
}

// ── 2. submit coordinate.run (blocking:false) ────────────────────────────────
async function submit() {
  /** @type {Record<string, unknown>} */
  const data = { goal: GOAL, fanOut: FAN_OUT, backend: BACKEND, site: SITE, owner: OWNER };
  if (TOPIC.trim()) data.topic = TOPIC.trim();
  if (LANE.trim()) data.lane = LANE.trim();
  // Mark it as the daily system loop (badge + "today's drafts" filter); NO
  // requestedBy → user_email stays NULL → shared system run.
  data.labels = { source: "daily-loop", firedAt: new Date().toISOString() };

  log(`SUBMIT: coordinate.run ${JSON.stringify(data)}`);
  const res = await fetchT(
    `${COORDINATOR}/a2a`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${MESH_TOKEN}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "message/send",
        params: {
          message: { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "data", data }] },
          configuration: { blocking: false },
        },
      }),
    },
    60_000
  );
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 || body.error) {
    throw new Error(`submit failed: HTTP ${res.status} ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  }
  const task = body.result;
  if (!task?.contextId) throw new Error(`submit returned no contextId: ${JSON.stringify(body).slice(0, 300)}`);
  log(`SUBMIT: task ${task.id} contextId ${task.contextId} state ${task.status?.state}`);
  return { taskId: task.id, contextId: task.contextId };
}

// ── 3. resolve contextId → runId ─────────────────────────────────────────────
async function resolveRunId(contextId) {
  log(`RESOLVE: contextId ${contextId} → runId (budget ${RESOLVE_BUDGET_S}s)…`);
  const deadline = nowS() + RESOLVE_BUDGET_S;
  while (nowS() < deadline) {
    const res = await fetchT(`${COORDINATOR}/store/runs?contextId=${encodeURIComponent(contextId)}`, {
      headers: { authorization: `Bearer ${EDGE_TOKEN}` },
    });
    if (res.status === 200) {
      const { run } = await res.json();
      if (run?.id) {
        log(`RESOLVE: runId ${run.id}`);
        return run.id;
      }
    }
    await sleep(3000);
  }
  throw new Error(`could not resolve runId for contextId ${contextId} within ${RESOLVE_BUDGET_S}s`);
}

// ── 4. poll until terminal (the keepalive) ───────────────────────────────────
const TERMINAL = new Set(["completed", "completed_with_failures", "failed"]);

async function poll(runId) {
  log(`POLL: runId ${runId} every ${POLL_INTERVAL_S}s (max ${MAX_WAIT_S}s)…`);
  const deadline = nowS() + MAX_WAIT_S;
  let lastNote = "";
  while (nowS() < deadline) {
    const res = await fetchT(`${COORDINATOR}/store/runs/${encodeURIComponent(runId)}`, {
      headers: { authorization: `Bearer ${EDGE_TOKEN}` },
    });
    if (res.status === 200) {
      const { run } = await res.json();
      const note = run.progress?.at(-1)?.note ?? "";
      if (note && note !== lastNote) {
        log(`  • ${run.status} — ${note}`);
        lastNote = note;
      } else {
        log(`  • ${run.status}`);
      }
      if (TERMINAL.has(run.status)) {
        log(`POLL: terminal — ${run.status}`);
        return run;
      }
    } else {
      log(`  • poll HTTP ${res.status} (transient, retrying)`);
    }
    await sleep(POLL_INTERVAL_S * 1000);
  }
  throw new Error(`run ${runId} did not reach a terminal state within ${MAX_WAIT_S}s`);
}

// ── 5. step summary + exit code ──────────────────────────────────────────────
import { appendFileSync } from "node:fs";
function summarize(run) {
  const cfg = run.config ?? {};
  const stats = run.stats ?? {};
  const branches = stats.branchResults ?? [];
  const previews = branches.map((b) => b.target).filter((t) => typeof t === "string" && /^https?:\/\//.test(t));
  const score = stats.overall?.mean;
  const dashHost = ZONE ? `https://content-factor-dash.${ZONE}` : "";

  const lines = [
    `# 🤖 Daily content loop — ${run.status}`,
    "",
    `| | |`,
    `|---|---|`,
    `| **Topic** | ${cfg.topic ?? "(none)"} |`,
    `| **Route** | ${stats.route ?? cfg.goal ?? GOAL} |`,
    `| **Backend / site** | ${cfg.backend ?? BACKEND} → ${cfg.owner ?? OWNER}/${cfg.site ?? SITE} |`,
    `| **Branches** | ${stats.completed ?? 0}/${stats.branches ?? branches.length} completed |`,
    `| **Overall score** | ${typeof score === "number" ? score : "—"} |`,
    `| **Run** | \`${run.id}\` |`,
    dashHost ? `| **Dashboard** | ${dashHost}/runs/${run.id} |` : "",
    "",
    previews.length ? `## Preview${previews.length > 1 ? "s" : ""} (\`.aem.page\` — not yet published)` : "## No preview produced",
    ...previews.map((p) => `- ${p}`),
    run.error ? `\n## Error\n\`\`\`\n${String(run.error).slice(0, 1500)}\n\`\`\`` : "",
  ].filter((l) => l !== "");

  const md = lines.join("\n") + "\n";
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log("\n" + md);
}

const isWin = (run) => run && run.status === "completed" && (run.stats?.completed ?? 0) > 0;

/** One full attempt: submit → resolve → poll to terminal. */
async function attempt(n) {
  log(`ATTEMPT ${n}/${MAX_ATTEMPTS}`);
  const { contextId } = await submit();
  const runId = await resolveRunId(contextId);
  return poll(runId);
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const t0 = nowS();
  try {
    await prewarm(); // wake once; retries reuse the now-warm containers
    let run;
    for (let n = 1; n <= MAX_ATTEMPTS; n++) {
      run = await attempt(n);
      if (isWin(run)) break;
      if (n < MAX_ATTEMPTS) {
        log(`attempt ${n} ended '${run.status}' — retrying on warm containers in 10s…`);
        await sleep(10_000);
      }
    }
    summarize(run);
    log(`DONE in ${nowS() - t0}s — status ${run.status}`);
    process.exit(isWin(run) ? 0 : 1);
  } catch (err) {
    log(`FAILED: ${String(err)}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `# 🤖 Daily content loop — FAILED\n\n\`\`\`\n${String(err)}\n\`\`\`\n`);
    }
    process.exit(1);
  }
})();
