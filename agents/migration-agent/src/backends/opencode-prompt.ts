import type { MigrationRunPayload, MigrationResult } from "./types.ts";

/**
 * The headless migration prompt for Kimi (driven through opencode).
 *
 * Two things make this work autonomously:
 *  1. The SKILL.md has a human "confirmation gate" ("ask first, act second").
 *     A headless run has no human, so we declare the working context PRE-CONFIRMED
 *     (every field the gate would ask for is already in the payload) and tell the
 *     agent to skip the gate and proceed.
 *  2. We pin a single machine-readable FINAL_REPORT block so the backend can parse
 *     a contract-shaped MigrationResult out of the model's prose.
 */

export interface PromptContext {
  payload: MigrationRunPayload;
  folder: string;
  previewUrl: string;
  pageUrl: string;
  /**
   * The site's agent memory (lessons from previous runs), already read by the
   * backend and excerpted to a prompt-safe size. Undefined = no memory for
   * this run (no memoryPath, page empty, or the read failed — never fatal).
   */
  memory?: { text: string; editUrl?: string };
}

export function buildMigrationPrompt(ctx: PromptContext): string {
  const { payload, folder, previewUrl, pageUrl, memory } = ctx;
  const neighbor = payload.neighborPageUrl;
  const reference = neighbor ?? payload.blockLibraryUrl;
  const articlePattern = payload.pattern === "article";
  const libBase = (payload.blockLibraryUrl ?? "").replace(/\/+$/, "");
  return `You are a da.live (Adobe Edge Delivery Services / EDS) content migration agent running HEADLESS — there is no human to answer questions, so do not ask any. Use the **da-live-author-playwright** skill (invoke the \`skill\` tool with name "da-live-author-playwright"). It orchestrates the da.live MCP (CRUD + preview-publish) and Playwright MCP (view the source + validate the published preview).

The working context is ALREADY CONFIRMED — skip the skill's confirmation gate and proceed straight to the create-page-from-source operation:

- owner:        ${payload.owner}
- site:         ${payload.site}
- operation:    create-page-from-source
- source type:  ${payload.sourceType}
- source:       ${payload.sourceLocation}
- target folder:${folder}
- page slug:    ${payload.pageSlug}
- target path:  /source/${payload.owner}/${payload.site}/${folder}/${payload.pageSlug}.html
- preview URL:  ${previewUrl}
${payload.blockLibraryUrl ? `- block library:${payload.blockLibraryUrl} (the canonical definition of every block on this site — an index linking ONE showcase page per block with all its variations; GET a specific block page only when you need its exact shape)\n` : ""}${neighbor ? `- reference page (mimic its blocks/look): ${neighbor}\n` : ""}- max refinement iterations: ${payload.maxRefinementIterations ?? 2}

Authentication: the da.live MCP server self-authenticates to da.live (server-side S2S technical account). Call its tools normally — do NOT ask for a bearer token. If a tool returns 401 / "Authentication failed", STOP, do not retry forever, and record it as a gap in the final report.

Do the migration end to end. Be DECISIVE and move fast — read each thing ONCE, don't re-fetch or explore beyond what the steps below ask. The goal is a published, validated page within budget, not an exhaustive survey:
1. Read the SOURCE once (Playwright for a webpage; the da.live MCP/read for a PDF or da.live path). One pass — don't fetch it twice with different tools.
2. Learn the target${reference ? `: GET the reference page (${reference}) ONCE for the editorial look and block order` : ""}${
    payload.blockLibraryUrl
      ? `, then open the block library page of EVERY block you are about to author — one GET per block, the index alone is NOT enough. The index (${payload.blockLibraryUrl}) only lists the blocks; each block's page at ${libBase}/<block-name> (e.g. ${libBase}/hero, ${libBase}/stats, ${libBase}/quote, ${libBase}/author-bio) is the canonical definition on THIS site: every variant, the exact cell layout, what it can and cannot do. The reference page shows ONE usage; the library page shows the definition, and a block authored from your memory of another site (or from a description) renders wrong here — so for each block you use, read its library page before you write it, and list those pages in referencesConsulted`
      : ""
  }. Do NOT enumerate whole folders.
3. CREATE/SAVE the page at the target path, then preview-publish it (full /source/... path). This is the priority — reach it quickly.
4. VALIDATE the published ${previewUrl} with Playwright (navigate + snapshot/screenshot) ONCE. Refine only if it is clearly broken, up to the max iterations. Preserve all factual source content exactly — structural transformation only.
5. Be honest about confidence and gaps.
${
  articlePattern
    ? `
This page is a JOURNAL ARTICLE — author it to match the reference page's editorial look, not a generic dump:
- Page metadata (the LAST section, nested in its OWN <div> section): Title, Description, Theme: paper, Template: article. The Theme/Template values are lowercase and EXACT — "paper"/"article" — or the serif article styling silently no-ops.
- Lead with a full-bleed \`hero\`: the source's header image + an eyebrow ("<Category> · <N> min read") + the <h1> title + an italic dek + a byline ("By <author> · <role> · <date>"). No CTA buttons.
- Where the source has figures, use a \`stats forest\` "Trail Highlights" band (Elevation Gain / Distance / Est. Duration / Difficulty).
- Include a \`quote\` pull-quote, and CLOSE with an \`author-bio center\` block (avatar + name + role + 2-sentence bio + a couple of links).
- Use a real, prominent header image (the source provides one) — the hero image is the whole vibe.
`
    : ""
}${
    payload.guidance
      ? `
GUIDING PRINCIPLES (operator-supplied — apply them within the steps above without extra exploration; a principle you cannot satisfy is NOT a failure: proceed anyway and record it in the final report's "gaps"):
${payload.guidance}
`
      : ""
  }
${
    memory
      ? `
MEMORY — what previous runs on this site learned${memory.editUrl ? ` (a human-editable page: ${memory.editUrl})` : ""}. Apply these lessons within the steps above; they may also point you at resources (e.g. the block library). You do NOT write to this page — the evaluation step appends to it after your run.
<<<MEMORY
${memory.text}
MEMORY>>>
`
      : ""
  }
When finished, output your normal report, then end your message with EXACTLY this machine-readable block and nothing after it:

FINAL_REPORT:
\`\`\`json
{
  "status": "PASS | NEEDS-REFINEMENT | FAIL",
  "confidence": 0,
  "previewUrl": "${previewUrl}",
  "pageUrl": "${pageUrl}",
  "blocksUsed": [],
  "refinementIterations": 0,
  "gaps": [],
  "lessons": [],
  "memoryApplied": [],
  "referencesConsulted": []
}
\`\`\`

"memoryApplied" = the MEMORY rules (quoted or paraphrased) that changed a decision in this run — empty if memory changed nothing. "referencesConsulted" = the URLs/paths you actually read (reference page, block library pages).
"lessons" = 0-3 short, generalizable lessons for the NEXT migration to this site (an error you hit and how you fixed it, a block mapping that worked or failed, something the reference page taught you). Rules for the next agent, not a diary — and nothing already covered by MEMORY. Empty if nothing new.
`;
}

/** Compute the deterministic da.live folder/URLs for a run (shared by prompt + result fallback). */
export function migrationTargets(payload: MigrationRunPayload): { folder: string; previewUrl: string; pageUrl: string } {
  // An explicit `folder` (e.g. "ai-articles" for generated drafts) is used verbatim
  // and keeps the URL clean; otherwise fall back to the run-isolated batch folder.
  const folder = payload.folder
    ? payload.folder.replace(/^\/+|\/+$/g, "")
    : `migration-batch-opencode${payload.folderPostfix ? `-${payload.folderPostfix}` : ""}`;
  const base = `${payload.owner}/${payload.site}/${folder}/${payload.pageSlug}`;
  return {
    folder,
    previewUrl: `https://main--${payload.site}--${payload.owner}.aem.page/${folder}/${payload.pageSlug}`,
    pageUrl: `https://da.live/edit#/${base}`,
  };
}

/**
 * Parse the model's reply into a contract-shaped MigrationResult. Tolerant of
 * fenced/prose-wrapped JSON; falls back to deterministic targets + a derived
 * status when the model under-fills the report.
 */
export function parseMigrationReport(
  text: string,
  payload: MigrationRunPayload,
  targets: { folder: string; previewUrl: string; pageUrl: string },
  observed: { refinementIterations?: number } = {}
): MigrationResult {
  let parsed: Record<string, unknown> = {};
  // prefer the explicit FINAL_REPORT block; else the last JSON object in the text
  const afterMarker = text.split(/FINAL_REPORT:/i).pop() ?? text;
  const fenced = afterMarker.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : afterMarker;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      parsed = JSON.parse(body.slice(start, end + 1));
    } catch {
      /* leave parsed empty → fall through to defaults */
    }
  }

  const confidence = clamp(Number(parsed.confidence), 0, 100, 0);
  const statusRaw = String(parsed.status ?? "").toUpperCase().replace(/\s+/g, "-");
  const status: MigrationResult["status"] = ["PASS", "NEEDS-REFINEMENT", "FAIL"].includes(statusRaw)
    ? (statusRaw as MigrationResult["status"])
    : confidence >= 85
      ? "PASS"
      : confidence >= 60
        ? "NEEDS-REFINEMENT"
        : "FAIL";

  return {
    pageUrl: typeof parsed.pageUrl === "string" && parsed.pageUrl ? parsed.pageUrl : targets.pageUrl,
    previewUrl: typeof parsed.previewUrl === "string" && parsed.previewUrl ? parsed.previewUrl : targets.previewUrl,
    status,
    confidence,
    blocksUsed: Array.isArray(parsed.blocksUsed) ? (parsed.blocksUsed as string[]) : [],
    refinementIterations:
      clamp(Number(parsed.refinementIterations), 0, 99, NaN) || observed.refinementIterations || 1,
    gaps: Array.isArray(parsed.gaps) ? (parsed.gaps as string[]) : [],
    lessons: parseLessons(parsed.lessons),
    backend: "opencode",
  };
}

/** The model's self-reports about memory + references (soft evidence; the observed reads are the hard evidence). */
export function parseSelfReports(text: string): { memoryApplied: string[]; referencesConsulted: string[] } {
  let parsed: Record<string, unknown> = {};
  const afterMarker = text.split(/FINAL_REPORT:/i).pop() ?? text;
  const fenced = afterMarker.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : afterMarker;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      parsed = JSON.parse(body.slice(start, end + 1));
    } catch {
      /* no self-reports */
    }
  }
  return { memoryApplied: parseLessons(parsed.memoryApplied, 8), referencesConsulted: parseLessons(parsed.referencesConsulted, 12) };
}

/** Model-reported lessons: strings only, trimmed, deduped, bounded (raw input to the reflect step). */
export function parseLessons(raw: unknown, max = 5): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const text = String(item ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (!text || out.some((l) => l.toLowerCase() === text.toLowerCase())) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
