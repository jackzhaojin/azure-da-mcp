import { describe, it, expect } from "vitest";
import { createToolTracker } from "../../migration-agent/src/backends/opencode-events.ts";

// The opencode SSE tap's rules, fed the real `message.part.updated` tool-part
// shapes. v2.9.2 keyed notes on `id:status` and read the input only from the
// first `running` update — on Cloudflare that update arrives before the input
// is populated, so notes said `K3 → webfetch` with no target and NO reads were
// recorded (block library evidence silently empty). v2.9.3 keys on the part.
describe("opencode tool-event tracker", () => {
  const collect = () => {
    const notes: string[] = [];
    const tracker = createToolTracker({ model: "K3", onProgress: (n) => notes.push(n) });
    return { notes, tracker };
  };
  const part = (id: string, tool: string, status: string, input?: unknown, extra: Record<string, unknown> = {}) => ({
    id,
    type: "tool",
    tool,
    sessionID: "ses_1",
    state: { status, input, ...extra },
  });

  it("captures a read target that only appears on a LATER update (the Cloudflare ordering), noting the tool once with it", () => {
    const { notes, tracker } = collect();
    tracker.handle(part("p1", "webfetch", "pending", {}));
    tracker.handle(part("p1", "webfetch", "running", {})); // input not yet populated
    tracker.handle(part("p1", "webfetch", "running", { url: "https://site/ai-content/blocks/hero" }));
    tracker.handle(part("p1", "webfetch", "completed", { url: "https://site/ai-content/blocks/hero" }, { output: "…" }));
    expect(tracker.summary.reads).toEqual(["https://site/ai-content/blocks/hero"]);
    expect(notes).toEqual(["K3 → webfetch https://site/ai-content/blocks/hero"]);
    expect(tracker.summary.toolsFired.has("webfetch")).toBe(true);
  });

  it("notes a read tool at completion even when no update ever carried a target", () => {
    const { notes, tracker } = collect();
    tracker.handle(part("p2", "dalive_get_dalive_content", "running", {}));
    expect(notes).toEqual([]); // waiting for the input
    tracker.handle(part("p2", "dalive_get_dalive_content", "completed", {}));
    expect(notes).toEqual(["K3 → dalive_get_dalive_content"]);
    expect(tracker.summary.reads).toEqual([]);
  });

  it("notes non-read tools immediately, once, and counts validations once per part", () => {
    const { notes, tracker } = collect();
    tracker.handle(part("p3", "dalive_create_dalive_content", "running", { path: "/source/o/s/x.html", htmlContent: "<p>" }));
    tracker.handle(part("p3", "dalive_create_dalive_content", "completed", { path: "/source/o/s/x.html", htmlContent: "<p>" }));
    tracker.handle(part("p4", "playwright_browser_take_screenshot", "running", {}));
    tracker.handle(part("p4", "playwright_browser_take_screenshot", "completed", {}));
    tracker.handle(part("p5", "playwright_browser_navigate", "running", { url: "https://site/preview" }));
    expect(notes).toEqual(["K3 → dalive_create_dalive_content", "K3 → playwright_browser_take_screenshot", "K3 → playwright_browser_navigate https://site/preview"]);
    expect(tracker.summary.validations).toBe(2);
    expect(tracker.summary.reads).toEqual(["https://site/preview"]);
  });

  it("detects the skill once and records tool errors once", () => {
    const { notes, tracker } = collect();
    tracker.handle(part("s1", "skill", "running", { name: "da-live-author-playwright" }));
    tracker.handle(part("s1", "skill", "completed", { name: "da-live-author-playwright" }));
    tracker.handle(part("e1", "playwright_browser_navigate", "running", { url: "https://site/x" }));
    tracker.handle(part("e1", "playwright_browser_navigate", "error", { url: "https://site/x" }, { error: "Chromium sandboxing failed" }));
    tracker.handle(part("e1", "playwright_browser_navigate", "error", { url: "https://site/x" }, { error: "Chromium sandboxing failed" }));
    expect(tracker.summary.skillFired).toBe(true);
    expect(tracker.summary.errors).toEqual(["playwright_browser_navigate: Chromium sandboxing failed"]);
    expect(notes).toEqual(["K3 → skill da-live-author-playwright", "K3 → playwright_browser_navigate https://site/x", "K3 ✗ playwright_browser_navigate: Chromium sandboxing failed"]);
  });

  it("ignores non-tool parts and other sessions' parts are the caller's job (tracker is per session)", () => {
    const { notes, tracker } = collect();
    tracker.handle({ id: "t1", type: "text" });
    expect(notes).toEqual([]);
  });
});
