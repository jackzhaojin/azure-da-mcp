import { describe, it, expect } from "vitest";
import { readTarget, classifyRead, buildUsage, describeUsage } from "../../migration-agent/src/usage.ts";
import { parseMigrationReport, parseSelfReports, migrationTargets } from "../../migration-agent/src/backends/opencode-prompt.ts";
import type { MigrationRunPayload } from "../../migration-agent/src/backends/types.ts";

// Evidence of block-library / reference / memory use (v2.9.2): the backends
// observe read-type tool calls and classify their targets against the payload.
const AEM = "https://main--adapt-to-2026-demo--jackzhaojin.aem.page";
const payload: MigrationRunPayload = {
  sourceType: "webpage",
  sourceLocation: "https://pub-ae7a7d0dbe1049c69ae60848bc58bfbf.r2.dev/sources/abc.html",
  site: "adapt-to-2026-demo",
  owner: "jackzhaojin",
  pageSlug: "probe",
  folder: "ai-articles",
  blockLibraryUrl: `${AEM}/ai-content/blocks/`,
  neighborPageUrl: `${AEM}/ai-content/stories/chasing-sunsets`,
  memoryPath: "/source/jackzhaojin/adapt-to-2026-demo/ai-content/memory.html",
  pattern: "article",
};

describe("migration usage evidence", () => {
  it("extracts the read target from the tools that read things (and nothing from writes)", () => {
    expect(readTarget("webfetch", { url: `${AEM}/ai-content/blocks/hero`, format: "markdown" })).toBe(`${AEM}/ai-content/blocks/hero`);
    expect(readTarget("dalive_get_dalive_content", { path: "/source/jackzhaojin/adapt-to-2026-demo/ai-content/blocks/stats.html" })).toBe(
      "/source/jackzhaojin/adapt-to-2026-demo/ai-content/blocks/stats.html"
    );
    expect(readTarget("playwright_browser_navigate", { url: `${AEM}/ai-articles/probe` })).toBe(`${AEM}/ai-articles/probe`);
    expect(readTarget("read", { filePath: "/tmp/x.md" })).toBe("/tmp/x.md");
    expect(readTarget("dalive_create_dalive_content", { path: "/source/x/y.html", htmlContent: "<p>" })).toBeUndefined();
    expect(readTarget("dalive_save_dalive_content", { path: "/source/x/y.html" })).toBeUndefined();
    expect(readTarget("webfetch", "not-an-object")).toBeUndefined();
  });

  it("classifies targets: block library index, block pages (by slug), reference page, memory, source — via URL or da.live source path", () => {
    expect(classifyRead(`${AEM}/ai-content/blocks/`, payload)).toEqual({ kind: "blockLibraryIndex" });
    expect(classifyRead(`${AEM}/ai-content/blocks/index.plain.html`, payload)).toEqual({ kind: "blockLibraryIndex" });
    expect(classifyRead(`${AEM}/ai-content/blocks/hero`, payload)).toEqual({ kind: "blockPages", block: "hero" });
    expect(classifyRead(`${AEM}/ai-content/blocks/author-bio.plain.html`, payload)).toEqual({ kind: "blockPages", block: "author-bio" });
    expect(classifyRead("/source/jackzhaojin/adapt-to-2026-demo/ai-content/blocks/stats.html", payload)).toEqual({ kind: "blockPages", block: "stats" });
    expect(classifyRead(`${AEM}/ai-content/stories/chasing-sunsets`, payload)).toEqual({ kind: "referencePage" });
    expect(classifyRead("/source/jackzhaojin/adapt-to-2026-demo/ai-content/stories/chasing-sunsets.html", payload)).toEqual({ kind: "referencePage" });
    expect(classifyRead("/source/jackzhaojin/adapt-to-2026-demo/ai-content/memory.html", payload)).toEqual({ kind: "memory" });
    expect(classifyRead(payload.sourceLocation, payload)).toEqual({ kind: "source" });
    expect(classifyRead(`${AEM}/ai-articles/probe`, payload)).toEqual({ kind: "other" });
    // no library configured → nothing is a block page
    expect(classifyRead(`${AEM}/ai-content/blocks/hero`, { ...payload, blockLibraryUrl: undefined })).toEqual({ kind: "other" });
  });

  it("builds the usage summary: counts, distinct blocks in order, deduped urls, self-reports; and describes it in one line", () => {
    const usage = buildUsage(
      [
        payload.sourceLocation,
        `${AEM}/ai-content/stories/chasing-sunsets`,
        `${AEM}/ai-content/blocks/`,
        `${AEM}/ai-content/blocks/hero`,
        `${AEM}/ai-content/blocks/stats`,
        `${AEM}/ai-content/blocks/hero.plain.html`, // same block twice → one slug, one url
        `${AEM}/ai-articles/probe`,
        "/Users/x/.playwright-mcp/opencode-migration/page-1.yml", // local scratch read: counted, not listed
      ],
      payload,
      { memoryApplied: ["Add og:type: article."], referencesConsulted: [`${AEM}/ai-content/blocks/hero`] }
    );
    expect(usage.reads).toEqual({ source: 1, referencePage: 1, blockLibraryIndex: 1, blockPages: 3, memory: 0, other: 2 });
    expect(usage.blocksLookedAt).toEqual(["hero", "stats"]);
    expect(usage.urls.length).toBe(6);
    expect(usage.urls.some((u) => u.includes(".playwright-mcp"))).toBe(false);
    expect(usage.memoryApplied).toEqual(["Add og:type: article."]);
    expect(describeUsage(usage)).toBe("block library: index + 3 block page reads (hero, stats) · reference page ✓ · memory: applied 1 rule");
    expect(describeUsage(buildUsage([], payload))).toBe("block library: not read · reference page: not read · memory: applied 0 rules");
  });

  it("parses the model's self-reports out of the FINAL_REPORT (and tolerates their absence)", () => {
    const text = `Done.\n\nFINAL_REPORT:\n\`\`\`json\n${JSON.stringify({
      status: "PASS",
      confidence: 90,
      blocksUsed: ["hero"],
      lessons: ["Keep the byline in the hero."],
      memoryApplied: ["Put og:type: article in metadata", "Put og:type: article in metadata", 42, ""],
      referencesConsulted: [`${AEM}/ai-content/blocks/hero`],
    })}\n\`\`\``;
    const targets = migrationTargets(payload);
    const result = parseMigrationReport(text, payload, targets);
    expect(result.lessons).toEqual(["Keep the byline in the hero."]);
    const self = parseSelfReports(text);
    expect(self.memoryApplied).toEqual(["Put og:type: article in metadata", "42"]); // deduped, stringified, blanks dropped
    expect(self.referencesConsulted).toEqual([`${AEM}/ai-content/blocks/hero`]);
    expect(parseSelfReports("no report at all")).toEqual({ memoryApplied: [], referencesConsulted: [] });
  });
});
