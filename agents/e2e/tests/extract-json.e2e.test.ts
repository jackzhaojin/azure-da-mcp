import { describe, it, expect } from "vitest";
// Real function, no mocks — pins the eval engine's tolerant JSON extraction that
// was hardened in the v2.1 sprint after a real page scored accessibility=0
// because Claude prefixed its JSON with prose ("Based on t…") and the old
// fenced-or-pure parser threw. Imported across the workspace boundary by path
// (the `@/lib/*` alias only resolves inside eval-service).
import { extractJsonText } from "../../eval-service/src/engine/extract-json.ts";

const OBJ = { score: 87, findings: [], summary: "ok", quickWins: [], majorIssues: [] };

describe("extractJsonText — tolerant LLM JSON extraction", () => {
  it("passes through a pure JSON body unchanged", () => {
    const raw = JSON.stringify(OBJ);
    expect(JSON.parse(extractJsonText(raw))).toEqual(OBJ);
  });

  it("unwraps a ```json fenced block", () => {
    const raw = "Here you go:\n```json\n" + JSON.stringify(OBJ) + "\n```\nThanks!";
    expect(JSON.parse(extractJsonText(raw))).toEqual(OBJ);
  });

  it("unwraps a bare ``` fence", () => {
    const raw = "```\n" + JSON.stringify(OBJ) + "\n```";
    expect(JSON.parse(extractJsonText(raw))).toEqual(OBJ);
  });

  it("THE REGRESSION: recovers JSON behind a prose preamble (the accessibility=0 bug)", () => {
    const raw = 'Based on the accessibility scan, here is my analysis:\n\n' + JSON.stringify(OBJ);
    expect(JSON.parse(extractJsonText(raw))).toEqual(OBJ);
  });

  it("does not miscount braces that appear inside string values", () => {
    const tricky = { summary: "use the {selector} like a } here", score: 50, findings: [], quickWins: [], majorIssues: [] };
    const raw = "Sure! " + JSON.stringify(tricky) + "\n\nLet me know if you need more.";
    expect(JSON.parse(extractJsonText(raw))).toEqual(tricky);
  });

  it("handles a top-level array behind prose", () => {
    const raw = "The findings are:\n[ {\"a\":1}, {\"b\":2} ]";
    expect(JSON.parse(extractJsonText(raw))).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("returns the original (to fail honestly) when there is no JSON at all", () => {
    const raw = "I could not complete the analysis.";
    // no { or [ to slice → returns the prose; the caller's JSON.parse throws and
    // the dimension records deterministic-fallback with a real reason
    expect(extractJsonText(raw)).toBe(raw);
    expect(() => JSON.parse(extractJsonText(raw))).toThrow();
  });
});
