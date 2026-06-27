import type { MigrationRunPayload, MigrationResult } from "./types.ts";

/**
 * The headless migration prompt for Kimi K2.6 (driven through opencode).
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
}

export function buildMigrationPrompt(ctx: PromptContext): string {
  const { payload, folder, previewUrl, pageUrl } = ctx;
  const neighbor = payload.neighborPageUrl;
  const reference = neighbor ?? payload.blockLibraryUrl;
  const articlePattern = payload.pattern === "article";
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
${payload.blockLibraryUrl ? `- block library:${payload.blockLibraryUrl}\n` : ""}${neighbor ? `- reference page (mimic its blocks/look): ${neighbor}\n` : ""}- max refinement iterations: ${payload.maxRefinementIterations ?? 2}

Authentication: the da.live MCP server self-authenticates to da.live (server-side S2S technical account). Call its tools normally — do NOT ask for a bearer token. If a tool returns 401 / "Authentication failed", STOP, do not retry forever, and record it as a gap in the final report.

Do the migration end to end. Be DECISIVE and move fast — read each thing ONCE, don't re-fetch or explore beyond what the steps below ask. The goal is a published, validated page within budget, not an exhaustive survey:
1. Read the SOURCE once (Playwright for a webpage; the da.live MCP/read for a PDF or da.live path). One pass — don't fetch it twice with different tools.
2. GET exactly ONE reference page${reference ? ` (${reference})` : " (a neighbor page or the block library)"} to learn this site's block conventions and editorial look. Do NOT enumerate the whole folder — a single read is enough.
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
  "gaps": []
}
\`\`\`
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
    backend: "opencode",
  };
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
