/**
 * Robustly extract a JSON object/array from an LLM response.
 *
 * Claude (and every other model) will sometimes return valid JSON wrapped in
 * prose or markdown — `Based on the analysis:\n\n{…}`, or a ```json fence. The
 * eval agentic parsers historically handled ONLY a ```json fence or a body that
 * was already pure JSON, so a prose preamble made `JSON.parse` throw and the
 * dimension silently fell back to deterministic-only scoring.
 *
 * Observed in the wild (v2.1 hardening, 2026-06-14): on a real page Claude
 * prefixed its accessibility JSON with "Based on t…", the parse failed, and the
 * dimension scored **0** via deterministic fallback — dragging an otherwise-good
 * page to 58. The `mode: deterministic-fallback` recording from the earlier
 * sprint made it visible; this makes it stop happening.
 *
 * Strategy (each step preserves the previous behavior, only adds tolerance):
 *   1. a ```json … ``` (or bare ``` … ```) fence — the original behavior,
 *   2. a body that already starts with `{`/`[` — the original behavior,
 *   3. NEW: slice the first balanced top-level `{…}` or `[…]` out of prose,
 *      brace-counting with string-literal awareness so braces inside string
 *      values don't miscount.
 *
 * Returns the raw candidate string (trimmed). The caller still `JSON.parse`s and
 * validates the shape — this only improves the odds that parse succeeds.
 */
export function extractJsonText(raw: string): string {
  const text = (raw ?? "").trim();

  // 1. fenced code block (```json … ``` or bare ``` … ```)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) return fence[1].trim();

  // 2. already pure JSON
  if (text.startsWith("{") || text.startsWith("[")) return text;

  // 3. prose-wrapped — slice the first balanced top-level object/array
  return sliceBalancedJson(text) ?? text;
}

/** First balanced top-level `{…}`/`[…]` in `text`, or null if none is balanced. */
function sliceBalancedJson(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unbalanced — let the caller try the whole string and report honestly
}
