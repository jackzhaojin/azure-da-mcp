/**
 * Agentic content backend — the real writer (PRD part-4, M3).
 *
 * Replaces the deterministic template tier's *bodies* (generateBrief / ideateTopic)
 * with genuine Claude authoring, behind the SAME signatures + shapes, so nothing
 * on the A2A surface changes. The template tier stays as the $0 / no-creds / test
 * fallback; this is the path the daily loop should actually run so migration has a
 * compelling, substantive source page to work from — not lorem.
 *
 * Auth mirrors the eval engine: CLAUDE_CODE_OAUTH_TOKEN (Claude Pro/Max) OR
 * ANTHROPIC_API_KEY. Without either, callers fall back to the template tier.
 * Uses @anthropic-ai/claude-agent-sdk's query() — no tools (writing is a pure
 * generation pass), bounded by an abort timeout (undici timeouts are disabled
 * mesh-wide, so a hung turn would otherwise never resolve).
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import { extractJsonText } from "./extract-json.ts";
import { generateBrief, ideateTopic, type Brief, type IdeatedTopic } from "./generator.ts";

export function hasAgentAuth(): boolean {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

/** Model for content writing. Defaults to a strong general model; override per env. */
const MODEL = process.env.CONTENT_GEN_MODEL || process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const TIMEOUT_MS = Number(process.env.CONTENT_GEN_AGENTIC_TIMEOUT_MS) || 180_000; // 3 min/page

/** One bounded, tool-free Claude generation pass → raw assistant text. */
async function runQuery(systemPrompt: string, prompt: string, label: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  const chunks: string[] = [];
  try {
    for await (const message of query({
      prompt,
      options: {
        model: MODEL,
        maxTurns: 1,
        systemPrompt,
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
  return chunks.join("\n");
}

// ── content.brief (agentic) ──────────────────────────────────────────────────

const ALLOWED_BLOCKS = ["hero", "cards", "columns", "table", "default-content", "cta", "quote", "accordion"] as const;

interface LlmSection {
  heading: string;
  summary: string;
  targetBlock: string;
  body: string;
}
interface LlmBrief {
  title: string;
  pageType: string;
  dek: string;
  audience: string;
  intent: string;
  sections: LlmSection[];
  images: Array<{ description: string; alt: string }>;
  links: Array<{ href: string; text: string }>;
}

const BRIEF_SYSTEM = `You are a senior content strategist and feature writer producing a publication-quality web article.
Write the way a great trade magazine or a strong brand newsroom writes: a sharp, specific angle, a confident narrative
arc, concrete details and realistic numbers, and prose that respects the reader's time. No filler, no lorem, no
"in today's fast-paced world" throat-clearing, no marketing fluff. Every section must say something a knowledgeable
reader would find genuinely useful.

Return ONLY a single JSON object (no prose, no markdown fence) with EXACTLY this shape:
{
  "title": "compelling, specific headline (not just the topic restated)",
  "pageType": "article | landing | product | event",
  "dek": "one-sentence standfirst/hook under the title",
  "audience": "who this is for, one phrase",
  "intent": "what the reader should be able to do after reading, one sentence",
  "sections": [
    {
      "heading": "specific, scannable section headline",
      "summary": "one line on what this section delivers",
      "targetBlock": "one of: ${ALLOWED_BLOCKS.join(", ")}",
      "body": "2-4 real paragraphs of substantive prose. Separate paragraphs with a blank line. Use concrete examples, specifics, and realistic figures."
    }
  ],
  "images": [ { "description": "what the image shows", "alt": "descriptive alt text" } ],
  "links": [ { "href": "https://...", "text": "anchor text" } ]
}

Rules:
- 4 to 6 sections. Open with a hook section (targetBlock "hero") and, for how-to/decision topics, close with a clear next-step section ("cta").
- Total body copy roughly 600-1000 words unless a word count is specified.
- 2 images, 2-3 links. Links may be plausible illustrative URLs (e.g. https://example.com/guide) — they are for a synthetic page.
- Output MUST be valid JSON and nothing else.`;

function validateLlmBrief(x: unknown): LlmBrief {
  const b = x as LlmBrief;
  if (!b || typeof b.title !== "string" || !Array.isArray(b.sections) || b.sections.length === 0) {
    throw new Error("agentic brief: missing title/sections");
  }
  for (const s of b.sections) {
    if (typeof s.heading !== "string" || typeof s.body !== "string" || !s.body.trim()) {
      throw new Error("agentic brief: a section is missing heading/body");
    }
  }
  return b;
}

function toBrief(llm: LlmBrief, fallbackPageType: string): Brief {
  const sections = llm.sections.map((s) => ({
    heading: s.heading.trim(),
    summary: (s.summary ?? "").trim(),
    targetBlock: (ALLOWED_BLOCKS as readonly string[]).includes(s.targetBlock) ? s.targetBlock : "default-content",
    body: s.body.trim(),
  }));
  return {
    title: llm.title.trim(),
    pageType: llm.pageType?.trim() || fallbackPageType,
    audience: llm.audience?.trim() || "general readers",
    intent: llm.intent?.trim() || "",
    dek: llm.dek?.trim() || undefined,
    outline: sections.map((s) => ({ heading: s.heading, summary: s.summary, targetBlock: s.targetBlock })),
    copyBlocks: sections.map((s) => ({ block: s.heading, text: s.body })),
    imageDirections: (llm.images ?? []).map((i) => ({ description: i.description, alt: i.alt })),
    links: (llm.links ?? []).filter((l) => l && typeof l.href === "string" && typeof l.text === "string"),
    generator: "agent-sdk",
  };
}

/**
 * Generate a compelling brief with Claude. Falls back to the deterministic
 * template on any failure (no creds, timeout, malformed JSON) — generation must
 * never hard-fail the closed loop.
 */
export async function agenticBrief(opts: {
  topic: string;
  pageType?: string;
  siteBrief?: string;
  constraints?: { wordCount?: number; imageCount?: number };
}): Promise<Brief> {
  const pageType = opts.pageType ?? "article";
  const ask = [
    `Topic: ${opts.topic}`,
    `Page type: ${pageType}`,
    opts.siteBrief ? `Site voice / concept: ${opts.siteBrief}` : "",
    opts.constraints?.wordCount ? `Target word count: ~${opts.constraints.wordCount}` : "",
    opts.constraints?.imageCount != null ? `Number of images: ${opts.constraints.imageCount}` : "",
    "",
    "Write the article brief as specified. JSON only.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await runQuery(BRIEF_SYSTEM, ask, "content.brief");
  const llm = validateLlmBrief(JSON.parse(extractJsonText(raw)));
  return toBrief(llm, pageType);
}

/** Brief with agentic backend when creds exist, else the deterministic template. */
export async function buildBrief(opts: {
  topic: string;
  pageType?: string;
  siteBrief?: string;
  constraints?: { wordCount?: number; imageCount?: number };
}): Promise<{ brief: Brief; via: "agent-sdk" | "template"; note?: string }> {
  if (hasAgentAuth()) {
    try {
      return { brief: await agenticBrief(opts), via: "agent-sdk" };
    } catch (err) {
      return { brief: generateBrief(opts), via: "template", note: `agentic brief failed, used template: ${String(err).slice(0, 160)}` };
    }
  }
  return { brief: generateBrief(opts), via: "template" };
}

// ── content.ideate (agentic) ─────────────────────────────────────────────────

const IDEATE_SYSTEM = `You are the editor of a content newsroom choosing the single best article to commission today.
Pick a fresh, specific, genuinely interesting angle within the given editorial lane — the kind of headline a reader
would actually click and an expert would respect. Avoid generic "ultimate guide" framings and avoid topics that are
obvious restatements of the lane name.

Return ONLY a JSON object: { "topic": "the article angle/headline, as a writeable topic", "rationale": "one sentence on why this is worth publishing today" }`;

/**
 * Pick today's topic with Claude. Falls back to the deterministic lane picker on
 * any failure. The deterministic seed is still threaded through so the scheduled
 * loop stays reproducible when creds are absent.
 */
export async function agenticIdeate(opts: { lane?: string; seed?: string }): Promise<IdeatedTopic> {
  const det = ideateTopic(opts); // also gives us the resolved lane label + seed
  const ask = [
    `Editorial lane: ${det.lane}`,
    `For inspiration only (do NOT just reuse it), a deterministic pick was: "${det.topic}".`,
    `Date seed: ${det.seed}. Choose something distinct and compelling. JSON only.`,
  ].join("\n");
  const raw = await runQuery(IDEATE_SYSTEM, ask, "content.ideate");
  const parsed = JSON.parse(extractJsonText(raw)) as { topic?: string; rationale?: string };
  if (!parsed.topic || typeof parsed.topic !== "string") throw new Error("agentic ideate: no topic");
  return {
    topic: parsed.topic.trim(),
    lane: det.lane,
    rationale: parsed.rationale?.trim() || `Agent-picked ${det.lane} topic for ${det.seed}.`,
    seed: det.seed,
  };
}

/** Ideate with the agentic editor when creds exist, else the deterministic picker. */
export async function pickTopic(opts: { lane?: string; seed?: string }): Promise<{ topic: IdeatedTopic; via: "agent-sdk" | "template" }> {
  if (hasAgentAuth()) {
    try {
      return { topic: await agenticIdeate(opts), via: "agent-sdk" };
    } catch {
      return { topic: ideateTopic(opts), via: "template" };
    }
  }
  return { topic: ideateTopic(opts), via: "template" };
}
