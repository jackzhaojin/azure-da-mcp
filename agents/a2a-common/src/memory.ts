import { createLogger } from "./logging.ts";
import { DaliveError, daliveMcpUrl, getDaliveContent, saveDaliveContent } from "./dalive.ts";

/**
 * Agent memory — a human-readable da.live page the mesh READS before every
 * migration and WRITES to after every evaluated run (the v1 "agent-memory"
 * idea, restored for v2: "lives in DA-Live, readable, not a black box; humans
 * edit it directly; gets richer with every run").
 *
 * The page is an ordinary da.live document (`/ai-content/memory` on the demo
 * site): a human-authored preamble (pointers such as the block library URL,
 * standing rules) followed by one appended section per run — a dated heading,
 * a score line, and 0-3 "Rule:" bullets the reflection step distilled from
 * the eval findings + the migrator's own lessons. Append-only: agents never
 * rewrite what a human (or an earlier run) wrote.
 */

const log = createLogger("memory");

/** `/source/{owner}/{site}/{pagePath}.html` for a site-relative page path like `ai-content/memory`. */
export function memorySourcePath(owner: string, site: string, pagePath: string): string {
  const clean = pagePath.replace(/^\/+|\/+$/g, "").replace(/\.html$/i, "");
  return `/source/${owner}/${site}/${clean}.html`;
}

/** The da.live edit URL humans open, derived from a `/source/...html` path. */
export function memoryEditUrl(sourcePath: string): string {
  return `https://da.live/edit#/${sourcePath.replace(/^\/source\//, "").replace(/\.html$/i, "")}`;
}

// ── HTML → prompt text ────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/**
 * Convert a da.live document into readable markdown-ish text for a prompt:
 * headings → `#`, list items → `-`, links → `text (href)`, sections → `---`.
 * Regex-based on purpose (no DOM dependency in a2a-common); da.live's saved
 * HTML is simple and regular enough for this.
 */
export function htmlToMemoryText(html: string): string {
  let s = html;
  // keep only <main> when present
  const main = s.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (main) s = main[1];
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const t = text.replace(/<[^>]+>/g, "").trim();
    return t && t !== href ? `${t} (${href})` : href;
  });
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, text) => `\n${"#".repeat(Number(lvl))} ${text.replace(/<[^>]+>/g, "").trim()}\n`);
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => `- ${text.replace(/<[^>]+>/g, "").trim()}\n`);
  // a da.live section = a top-level <div> under <main>; separate them visibly
  // (must run BEFORE the generic closing-tag pass strips the </div>)
  s = s.replace(/<\/div>\s*<div>/gi, "\n---\n");
  s = s.replace(/<\/(p|div|ul|ol|table|tr)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Number of run entries (dated <h3> headings) on the page. */
export function countMemoryEntries(html: string): number {
  return (html.match(/<h3[^>]*>\s*\d{4}-\d{2}-\d{2}/g) ?? []).length;
}

/**
 * Bound what goes into a prompt: the human preamble at the top must survive
 * (that's where pointers and standing rules live), and the newest entries are
 * the most relevant, so a long page keeps its head + tail and elides the middle.
 */
export function memoryPromptExcerpt(text: string, maxChars = 7000): string {
  if (text.length <= maxChars) return text;
  const head = Math.min(2500, Math.floor(maxChars * 0.35));
  const tail = maxChars - head;
  return `${text.slice(0, head).trimEnd()}\n\n[... older memory entries omitted (${text.length - maxChars} chars) — newest below ...]\n\n${text.slice(-tail).trimStart()}`;
}

// ── read ──────────────────────────────────────────────────────────────────

export interface MemorySnapshot {
  /** The `/source/...html` path that was read. */
  path: string;
  editUrl: string;
  html: string;
  /** Prompt-ready text (full page, not yet excerpted). */
  text: string;
  chars: number;
  entries: number;
  lastModified?: string;
  /** True when the page does not exist yet (first run) — html/text are empty. */
  missing: boolean;
}

/**
 * Read the memory page. Returns null when memory is disabled in this process
 * (no `DALIVE_MCP_URL`); throws on transport/auth errors so callers can decide
 * whether that is fatal (it never is for a migration — memory is a bonus).
 */
export async function readMemory(sourcePath: string): Promise<MemorySnapshot | null> {
  if (!daliveMcpUrl()) return null;
  try {
    const { htmlContent, lastModified } = await getDaliveContent(sourcePath);
    const text = htmlToMemoryText(htmlContent);
    return {
      path: sourcePath,
      editUrl: memoryEditUrl(sourcePath),
      html: htmlContent,
      text,
      chars: text.length,
      entries: countMemoryEntries(htmlContent),
      lastModified,
      missing: false,
    };
  } catch (err) {
    if (err instanceof DaliveError && err.notFound) {
      return { path: sourcePath, editUrl: memoryEditUrl(sourcePath), html: "", text: "", chars: 0, entries: 0, missing: true };
    }
    throw err;
  }
}

// ── write (append-only) ───────────────────────────────────────────────────

export interface MemoryEntry {
  /** ISO date (YYYY-MM-DD) shown in the heading. */
  date: string;
  /** Short run identifier (first 8 chars of the run id). */
  runId: string;
  /** What was migrated — the page slug or topic. */
  title: string;
  /** Backend/model tag, e.g. "K3 via opencode". */
  via?: string;
  /** e.g. "Score 82 (structure 90 · accessibility 85 · content 80 · visual 72) · migration PASS 90%". */
  scoreLine?: string;
  links?: Array<{ text: string; href: string }>;
  /** One-sentence reflection on how the run went. */
  summary?: string;
  /** 0-n generalizable rules; rendered as "Rule: …" bullets. */
  lessons: string[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The section HTML for one run entry (a da.live section = one top-level <div>). */
export function renderMemoryEntry(e: MemoryEntry): string {
  const heading = `${e.date} · Run ${e.runId} · ${e.title}${e.via ? ` (${e.via})` : ""}`;
  const meta: string[] = [];
  if (e.scoreLine) meta.push(esc(e.scoreLine));
  for (const l of e.links ?? []) meta.push(`<a href="${esc(l.href)}">${esc(l.text)}</a>`);
  const lessons = e.lessons.length
    ? `<ul>${e.lessons.map((l) => `<li>Rule: ${esc(l)}</li>`).join("")}</ul>`
    : "<p><em>No new rules — the standing rules held for this run.</em></p>";
  return [
    "<div>",
    `<h3>${esc(heading)}</h3>`,
    meta.length ? `<p>${meta.join(" · ")}</p>` : "",
    e.summary ? `<p><em>${esc(e.summary)}</em></p>` : "",
    lessons,
    "</div>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A fresh, empty da.live document body. */
export const EMPTY_MEMORY_HTML = "\n<body>\n  <header></header>\n  <main></main>\n  <footer></footer>\n</body>\n";

/**
 * Append one entry as a new section at the END of <main>, leaving every
 * existing byte in place (human edits and earlier entries are never rewritten).
 */
export function appendMemoryEntry(html: string, entry: MemoryEntry): string {
  const base = html.trim() ? html : EMPTY_MEMORY_HTML;
  const section = renderMemoryEntry(entry);
  if (/<\/main>/i.test(base)) return base.replace(/<\/main>/i, `${section}\n</main>`);
  if (/<\/body>/i.test(base)) return base.replace(/<\/body>/i, `<main>${section}</main>\n</body>`);
  return `${base}\n<main>${section}</main>`;
}

/**
 * Read-modify-write the memory page with a new entry. Re-reads immediately
 * before saving so a concurrent run's entry is not clobbered by a stale copy.
 */
export async function appendMemoryToDalive(sourcePath: string, entry: MemoryEntry): Promise<{ entries: number; chars: number }> {
  const current = (await readMemory(sourcePath)) ?? null;
  if (!current) throw new DaliveError("DALIVE_MCP_URL is not set — cannot write memory");
  const next = appendMemoryEntry(current.html, entry);
  await saveDaliveContent(sourcePath, next);
  const entries = countMemoryEntries(next);
  log.info("memory entry appended", { path: sourcePath, entries, lessons: entry.lessons.length });
  return { entries, chars: htmlToMemoryText(next).length };
}
