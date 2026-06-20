/**
 * Robustly extract a JSON object/array from an LLM response.
 *
 * Claude will sometimes wrap valid JSON in prose or a ```json fence
 * ("Here's the brief:\n\n{…}"). A naive JSON.parse throws on that. This mirrors
 * eval-service's extractor (kept local — cross-workspace `.ts` imports don't
 * survive the bundlers): try a fence, then pure JSON, then slice the first
 * balanced top-level object/array out of the prose. The caller still parses +
 * validates; this only improves the odds parse succeeds.
 */
export function extractJsonText(raw: string): string {
  const text = (raw ?? "").trim();

  // 1. fenced code block (```json … ``` or bare ``` … ```)
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) return sanitizeJson(fence[1].trim());

  // 2. already pure JSON
  if (text.startsWith("{") || text.startsWith("[")) return sanitizeJson(text);

  // 3. prose-wrapped — slice the first balanced top-level object/array
  return sanitizeJson(sliceBalancedJson(text) ?? text);
}

/**
 * Fix a recurring AI JSON typo before parse: `"key":= value` → `"key": value`
 * (the model occasionally emits `:=`). Ported from the v1.0 blog generator's
 * contentGenerator sanitizer — cheap insurance against an otherwise-valid brief
 * failing JSON.parse and dropping to the template fallback.
 */
export function sanitizeJson(s: string): string {
  return s.replace(/":\s*=/g, '":');
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
  return null;
}
