import type { MigrationRunPayload, MigrationUsage } from "./backends/types.ts";

/**
 * Evidence of what a migration actually read (v2.9.2). The backends observe
 * every read-type tool call (webfetch / da.live GET / Playwright navigate /
 * file read) with its target, and this module classifies those targets against
 * the run's payload: the source, the reference page, the block-library index,
 * individual block pages (which blocks were looked at), the memory page. It is
 * deterministic evidence — the model's own `memoryApplied` /
 * `referencesConsulted` report fields are the softer, self-reported half.
 */

/** Tools whose input names something that was READ; the input key that holds the target. */
const READ_TOOL_TARGET_KEYS: Array<[RegExp, string[]]> = [
  [/webfetch|web_fetch|fetch/i, ["url", "uri", "href"]],
  [/dalive_get_dalive_content|get_dalive_content|dalive_list_dalive_content/i, ["path", "url"]],
  [/playwright.*browser_navigate|browser_navigate/i, ["url"]],
  [/^read$|mcp__.*read|readfile|read_file/i, ["filePath", "file_path", "path"]],
];

/** The read target of a tool call, or undefined when the tool is not a read (or has no target). */
export function readTarget(tool: string, input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const rec = input as Record<string, unknown>;
  for (const [re, keys] of READ_TOOL_TARGET_KEYS) {
    if (!re.test(tool)) continue;
    for (const k of keys) {
      const v = rec[k];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 500);
    }
  }
  return undefined;
}

function pathOf(u: string): string {
  try {
    return new URL(u).pathname;
  } catch {
    return u;
  }
}

/** Normalize a URL/path for comparison: lowercase, no `.plain.html`/`.html`, no `/index`, no trailing slash. */
function norm(u: string): string {
  return pathOf(u)
    .toLowerCase()
    .replace(/\.plain\.html$/, "")
    .replace(/\.html$/, "")
    .replace(/\/index$/, "")
    .replace(/\/+$/, "");
}

/** `/source/{owner}/{site}/x/y.html` → `/x/y` (so da.live GETs compare with aem.page URLs). */
function stripSourcePrefix(p: string, payload: MigrationRunPayload): string {
  const prefix = `/source/${payload.owner}/${payload.site}`.toLowerCase();
  return p.startsWith(prefix) ? p.slice(prefix.length) : p;
}

export type ReadKind = keyof MigrationUsage["reads"];

/** Classify one read target against the run's payload. Returns the kind and, for a block page, its slug. */
export function classifyRead(target: string, payload: MigrationRunPayload): { kind: ReadKind; block?: string } {
  const t = stripSourcePrefix(norm(target), payload);
  if (payload.memoryPath && t === stripSourcePrefix(norm(payload.memoryPath), payload)) return { kind: "memory" };
  if (payload.blockLibraryUrl) {
    const lib = norm(payload.blockLibraryUrl); // e.g. /ai-content/blocks
    if (t === lib) return { kind: "blockLibraryIndex" };
    if (t.startsWith(`${lib}/`)) {
      const slug = t.slice(lib.length + 1).split("/")[0];
      return { kind: "blockPages", block: slug };
    }
  }
  if (payload.neighborPageUrl && t === norm(payload.neighborPageUrl)) return { kind: "referencePage" };
  if (payload.sourceLocation && (t === norm(payload.sourceLocation) || target.trim() === payload.sourceLocation.trim())) return { kind: "source" };
  return { kind: "other" };
}

export function emptyUsage(): MigrationUsage {
  return {
    reads: { source: 0, referencePage: 0, blockLibraryIndex: 0, blockPages: 0, memory: 0, other: 0 },
    blocksLookedAt: [],
    urls: [],
    memoryApplied: [],
    referencesConsulted: [],
  };
}

/** Build the usage summary from every observed read target (+ the model's self-reports). */
export function buildUsage(
  targets: string[],
  payload: MigrationRunPayload,
  selfReported: { memoryApplied?: string[]; referencesConsulted?: string[] } = {}
): MigrationUsage {
  const usage = emptyUsage();
  const seen = new Set<string>();
  for (const target of targets) {
    const { kind, block } = classifyRead(target, payload);
    usage.reads[kind]++;
    if (block && !usage.blocksLookedAt.includes(block)) usage.blocksLookedAt.push(block);
    // Local scratch files (skill docs, Playwright snapshots/screenshots) count as
    // "other" reads but are noise in the evidence list — keep urls to web + da.live.
    const isLocalFile = target.startsWith("/") && !target.startsWith("/source/");
    const key = norm(target);
    if (!isLocalFile && !seen.has(key) && usage.urls.length < 40) {
      seen.add(key);
      usage.urls.push(target.slice(0, 300));
    }
  }
  usage.memoryApplied = selfReported.memoryApplied ?? [];
  usage.referencesConsulted = selfReported.referencesConsulted ?? [];
  return usage;
}

/** One-line human summary for progress notes / logs, e.g. "block library: index + 3 block page(s) (hero, stats, author-bio) · reference page ✓ · memory: applied 2 rule(s)". */
export function describeUsage(usage: MigrationUsage): string {
  const parts: string[] = [];
  const lib: string[] = [];
  if (usage.reads.blockLibraryIndex) lib.push("index");
  if (usage.reads.blockPages) lib.push(`${usage.reads.blockPages} block page read${usage.reads.blockPages === 1 ? "" : "s"} (${usage.blocksLookedAt.join(", ")})`);
  parts.push(lib.length ? `block library: ${lib.join(" + ")}` : "block library: not read");
  parts.push(usage.reads.referencePage ? "reference page ✓" : "reference page: not read");
  parts.push(`memory: applied ${usage.memoryApplied.length} rule${usage.memoryApplied.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
