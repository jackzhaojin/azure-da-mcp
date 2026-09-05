import type { Artifact, Message, TaskStatusUpdateEvent } from "@a2a-js/sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  createLogger,
  daliveMcpUrl,
  memoryEditUrl,
  memoryPromptExcerpt,
  readMemory,
  appendMemoryToDalive,
  type MemoryEntry,
} from "@agents/a2a-common";
import { randomUUID } from "node:crypto";
import { hasAgentAuth } from "./engine/agent-auth";
import { extractJsonText } from "./engine/extract-json";

const log = createLogger("da-eval-agent");

/**
 * eval.reflect — the "improves itself" step of the loop (slides: "Self-evaluate
 * each run and learn from the last"). After a run has been scored, this skill
 * distils the eval findings + the migrator's own self-reported lessons into
 * 0-3 NEW, generalizable rules and appends one dated entry to the site's
 * memory page on da.live — the page the migration agent reads before its
 * next run. It lives on the eval agent on purpose: the thing being measured
 * never grades itself, and the grader is the one with the evidence.
 *
 * Never destructive: append-only, re-reads the page right before saving, and a
 * dryrun migration (simulated) is skipped so the memory never fills with noise.
 */

// ── payload (contract: agents/contracts/eval.reflect.v1.json) ──────────────

export interface ReflectFinding {
  dimension: string;
  severity: string;
  issue: string;
  recommendation?: string;
}

export interface ReflectBranch {
  branch: number;
  pageSlug?: string;
  previewUrl?: string;
  pageUrl?: string;
  sourceUrl?: string;
  migration?: {
    backend?: string;
    model?: string;
    status?: string;
    confidence?: number;
    blocksUsed?: string[];
    gaps?: string[];
    lessons?: string[];
  };
  eval?: {
    overallScore?: number;
    grade?: string;
    mode?: string;
    dimensionScores?: Record<string, number>;
    findings?: ReflectFinding[];
  };
}

export interface ReflectPayload {
  skill: "eval.reflect";
  site: string;
  owner: string;
  /** `/source/{owner}/{site}/{page}.html` — the memory page to append to. */
  memoryPath: string;
  runId?: string;
  /** Dashboard link for the run (goes into the entry). */
  runUrl?: string;
  topic?: string;
  route?: string;
  branches: ReflectBranch[];
  /** Distil lessons but do not write the page. */
  dryRun?: boolean;
}

/** The `memory-update` artifact. */
export interface ReflectResult {
  attempted: boolean;
  written: boolean;
  path: string;
  editUrl: string;
  /** Entries on the page AFTER this run (when written). */
  entries?: number;
  chars?: number;
  lessons: string[];
  summary?: string;
  /** How the lessons were produced. */
  tier: "agentic" | "deterministic" | "none";
  model?: string;
  skipped?: string;
  error?: string;
  stub?: boolean;
}

export function isReflectPayload(data: unknown): data is ReflectPayload {
  return Boolean(data && typeof data === "object" && (data as { skill?: unknown }).skill === "eval.reflect");
}

export function validateReflectPayload(p: ReflectPayload): void {
  for (const field of ["site", "owner", "memoryPath"] as const) {
    if (!p[field] || typeof p[field] !== "string") throw new Error(`eval.reflect.v1: '${field}' is required`);
  }
  if (!/^\/source\/[^/]+\/[^/]+\/.+\.html$/.test(p.memoryPath)) {
    throw new Error("eval.reflect.v1: 'memoryPath' must be a da.live source path like /source/{owner}/{site}/ai-content/memory.html");
  }
  if (!Array.isArray(p.branches) || p.branches.length === 0) throw new Error("eval.reflect.v1: 'branches' must be a non-empty array");
}

// ── lesson distillation ────────────────────────────────────────────────────

const REFLECT_MODEL = process.env.REFLECT_MODEL || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const REFLECT_TIMEOUT_MS = Number(process.env.REFLECT_TIMEOUT_MS) || 120_000;
const MAX_LESSONS = 3;
const SEVERITY_RANK: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3, info: 4 };

const REFLECT_SYSTEM = `You are the reflection step of a self-improving content-migration system for Adobe Edge Delivery Services (da.live). An AI migration agent authored a page; an evaluation scored it across structure, accessibility, content, and visual. Your job: distil what the migration agent should do DIFFERENTLY NEXT TIME into a few durable rules. The rules are read by that agent before its next run, so write them for an AI agent, not for a human report.

Return ONLY one JSON object (no prose, no markdown fence):
{ "summary": "one sentence on how this run went and the main reason", "lessons": ["rule", "..."] }

Rules for "lessons":
- 0 to ${MAX_LESSONS} items. An empty list is a valid, honest answer when nothing new was learned.
- Each is ONE imperative, specific, actionable sentence (max 200 characters). Say what to do, e.g. "Put the byline inside the hero block, not as a separate paragraph, so the article template renders it as the dek."
- Generalize beyond this page: no page-specific facts, names, or numbers; no scores.
- Prefer rules backed by evidence in the findings or the migrator's gaps/lessons, and rules that would lift the LOWEST-scoring dimension.
- MUST NOT duplicate or trivially rephrase anything already in the CURRENT MEMORY; if a memory rule was violated, do not repeat it - instead say nothing (or propose a sharper, different rule).
- Never invent problems the evidence does not show.`;

function dedupeLessons(candidates: string[], memoryText: string, max = MAX_LESSONS): string[] {
  const seen = new Set<string>();
  const mem = memoryText.toLowerCase();
  const out: string[] = [];
  for (const raw of candidates) {
    const text = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
    if (!text) continue;
    const key = text.toLowerCase().replace(/[.!]+$/, "");
    if (seen.has(key) || mem.includes(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * $0 fallback (no Claude creds, or the agentic pass failed): the migrator's own
 * lessons first, then the recommendations behind the most severe eval findings.
 */
export function deterministicLessons(p: ReflectPayload, memoryText = ""): { summary: string; lessons: string[] } {
  const migratorLessons = p.branches.flatMap((b) => b.migration?.lessons ?? []);
  const findings = p.branches
    .flatMap((b) => b.eval?.findings ?? [])
    .filter((f) => f.recommendation && (SEVERITY_RANK[f.severity] ?? 9) <= 1)
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
    .map((f) => f.recommendation!.trim());
  const lessons = dedupeLessons([...migratorLessons, ...findings], memoryText);
  const scores = p.branches.map((b) => b.eval?.overallScore).filter((s): s is number => typeof s === "number");
  const mean = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : undefined;
  const summary =
    mean === undefined
      ? "Migration completed; no evaluation scores were available to learn from."
      : `Run scored ${mean} overall; ${lessons.length ? "lessons carried over from the migrator's report and the most severe findings." : "no new lessons beyond what memory already holds."}`;
  return { summary, lessons };
}

function evidenceForPrompt(p: ReflectPayload): string {
  const lines: string[] = [];
  if (p.topic) lines.push(`Topic: ${p.topic}`);
  if (p.route) lines.push(`Route: ${p.route}`);
  for (const b of p.branches) {
    lines.push(`\n## Branch ${b.branch}${b.pageSlug ? ` — ${b.pageSlug}` : ""}`);
    if (b.migration) {
      const m = b.migration;
      lines.push(
        `Migration: ${m.status ?? "?"} (confidence ${m.confidence ?? "?"}) via ${m.backend ?? "?"}${m.model ? `/${m.model}` : ""}; blocks used: ${(m.blocksUsed ?? []).join(", ") || "n/a"}`
      );
      if (m.gaps?.length) lines.push(`Migration gaps:\n${m.gaps.map((g) => `- ${g}`).join("\n")}`);
      if (m.lessons?.length) lines.push(`Migrator's own lessons:\n${m.lessons.map((l) => `- ${l}`).join("\n")}`);
    }
    if (b.eval) {
      const e = b.eval;
      const dims = Object.entries(e.dimensionScores ?? {})
        .map(([d, s]) => `${d} ${s}`)
        .join(", ");
      lines.push(`Evaluation (${e.mode ?? "fidelity"} mode): overall ${e.overallScore ?? "?"}${e.grade ? ` (${e.grade})` : ""}; ${dims}`);
      const findings = [...(e.findings ?? [])]
        .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
        .slice(0, 12);
      if (findings.length) {
        lines.push(
          `Findings:\n${findings.map((f) => `- [${f.severity}/${f.dimension}] ${f.issue}${f.recommendation ? ` → ${f.recommendation}` : ""}`).join("\n")}`
        );
      }
    }
  }
  return lines.join("\n");
}

/** One bounded, tool-free Claude pass → { summary, lessons }. Throws on timeout/malformed output. */
async function agenticLessons(p: ReflectPayload, memoryText: string): Promise<{ summary: string; lessons: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`reflect timed out after ${REFLECT_TIMEOUT_MS}ms`)), REFLECT_TIMEOUT_MS);
  const prompt = `CURRENT MEMORY (what the migration agent already reads before every run):
<<<MEMORY
${memoryPromptExcerpt(memoryText, 6000) || "(empty — this is the first entry)"}
MEMORY>>>

THIS RUN'S EVIDENCE:
${evidenceForPrompt(p)}

Respond with the JSON object only.`;
  const chunks: string[] = [];
  try {
    for await (const message of query({
      prompt,
      options: {
        model: REFLECT_MODEL,
        maxTurns: 1,
        systemPrompt: REFLECT_SYSTEM,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        cwd: process.cwd(),
        abortController: controller,
      },
    })) {
      if (message.type === "assistant" && "message" in message && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text) chunks.push(block.text);
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  const parsed = JSON.parse(extractJsonText(chunks.join("\n"))) as { summary?: unknown; lessons?: unknown };
  const lessons = dedupeLessons(Array.isArray(parsed.lessons) ? parsed.lessons.map(String) : [], memoryText);
  const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 400) : "";
  return { summary, lessons };
}

// ── entry rendering ────────────────────────────────────────────────────────

function fmtScore(n: number | undefined): string {
  return typeof n === "number" ? String(Math.round(n)) : "—";
}

function buildEntry(p: ReflectPayload, distilled: { summary: string; lessons: string[] }): MemoryEntry {
  const first = p.branches[0];
  const titleBase = first.pageSlug ?? p.topic ?? "migration";
  const title = p.branches.length > 1 ? `${titleBase} (+${p.branches.length - 1} more)` : titleBase;
  const m = first.migration;
  const via = m ? `${m.model ? `${m.model} via ` : ""}${m.backend ?? "?"}` : undefined;

  let scoreLine: string;
  if (p.branches.length === 1) {
    const e = first.eval;
    const dims = Object.entries(e?.dimensionScores ?? {})
      .map(([d, s]) => `${d} ${fmtScore(s)}`)
      .join(" · ");
    scoreLine = e ? `Score ${fmtScore(e.overallScore)}${dims ? ` (${dims})` : ""}` : "Not evaluated";
    if (m) scoreLine += ` · migration ${m.status ?? "?"} ${fmtScore(m.confidence)}%`;
  } else {
    const scores = p.branches.map((b) => b.eval?.overallScore).filter((s): s is number => typeof s === "number");
    const mean = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : undefined;
    scoreLine = `${p.branches.length} branches · score μ ${fmtScore(mean)}${scores.length ? ` (best ${Math.max(...scores)}, worst ${Math.min(...scores)})` : ""}`;
  }

  const links: MemoryEntry["links"] = [];
  if (first.previewUrl) links.push({ text: "preview", href: first.previewUrl });
  if (p.runUrl) links.push({ text: "run", href: p.runUrl });

  return {
    date: new Date().toISOString().slice(0, 10),
    runId: (p.runId ?? randomUUID()).slice(0, 8),
    title,
    via,
    scoreLine,
    links,
    summary: distilled.summary || undefined,
    lessons: distilled.lessons,
  };
}

// ── the job ────────────────────────────────────────────────────────────────

export function extractReflectPayload(message: Message): ReflectPayload {
  for (const part of message.parts) {
    if (part.kind === "data" && isReflectPayload(part.data)) return part.data;
  }
  throw new Error("eval.reflect payload not found");
}

export function reflectArtifact(result: ReflectResult): Artifact {
  return {
    artifactId: randomUUID(),
    name: "memory-update",
    parts: [{ kind: "data", data: result as unknown as Record<string, unknown> }],
  };
}

/**
 * Run the reflection. Returns the artifact data; throws only on a real
 * transport/auth failure writing the page (skips are reported, not thrown).
 */
export async function runReflect(
  payload: ReflectPayload,
  note: (text: string) => void
): Promise<ReflectResult> {
  const path = payload.memoryPath;
  const editUrl = memoryEditUrl(path);
  const base: ReflectResult = { attempted: true, written: false, path, editUrl, lessons: [], tier: "none" };

  const backends = new Set(payload.branches.map((b) => b.migration?.backend).filter(Boolean));
  if (backends.size && [...backends].every((b) => b === "dryrun")) {
    note("memory: skipped — dryrun migration (simulated), nothing real to learn");
    return { ...base, skipped: "dryrun migration (simulated)" };
  }
  if (!daliveMcpUrl()) {
    note("memory: skipped — DALIVE_MCP_URL unset in the eval agent");
    return { ...base, skipped: "DALIVE_MCP_URL unset" };
  }

  note(`memory: reading ${path}`);
  const current = await readMemory(path);
  const memoryText = current?.text ?? "";
  note(`memory: ${current?.missing ? "page missing (will be created)" : `${current?.chars ?? 0} chars, ${current?.entries ?? 0} prior entries`}`);

  let distilled: { summary: string; lessons: string[] };
  let tier: ReflectResult["tier"] = "deterministic";
  let model: string | undefined;
  if (hasAgentAuth()) {
    note(`memory: distilling lessons with ${REFLECT_MODEL}`);
    try {
      distilled = await agenticLessons(payload, memoryText);
      tier = "agentic";
      model = REFLECT_MODEL;
    } catch (err) {
      log.warn("agentic reflect failed — falling back to deterministic lessons", { error: String(err).slice(0, 200) });
      note(`memory: agentic reflection failed (${String(err).slice(0, 80)}) — using deterministic lessons`);
      distilled = deterministicLessons(payload, memoryText);
    }
  } else {
    note("memory: no Claude credentials — deterministic lessons (migrator lessons + severe findings)");
    distilled = deterministicLessons(payload, memoryText);
  }
  note(`memory: ${distilled.lessons.length} new rule(s)${distilled.summary ? ` — ${distilled.summary.slice(0, 120)}` : ""}`);

  if (payload.dryRun) {
    return { ...base, lessons: distilled.lessons, summary: distilled.summary, tier, model, skipped: "dryRun requested" };
  }

  const entry = buildEntry(payload, distilled);
  const { entries, chars } = await appendMemoryToDalive(path, entry);
  note(`memory: entry appended — ${entries} entr${entries === 1 ? "y" : "ies"} on ${editUrl}`);
  log.info("eval.reflect wrote memory", { path, entries, lessons: distilled.lessons.length, tier, run_id: payload.runId });
  return { ...base, written: true, entries, chars, lessons: distilled.lessons, summary: distilled.summary, tier, model };
}

/** Helper for executors: the working/terminal status event shapes. */
export function reflectStatus(
  taskId: string,
  contextId: string,
  state: "working" | "completed" | "failed",
  text?: string,
  final = false
): TaskStatusUpdateEvent {
  return {
    kind: "status-update",
    taskId,
    contextId,
    status: {
      state,
      timestamp: new Date().toISOString(),
      ...(text
        ? {
            message: {
              kind: "message" as const,
              messageId: randomUUID(),
              role: "agent" as const,
              parts: [{ kind: "text" as const, text }],
              taskId,
              contextId,
            },
          }
        : {}),
    },
    final,
  };
}
