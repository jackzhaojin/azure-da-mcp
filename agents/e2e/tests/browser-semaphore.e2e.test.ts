import { describe, it, expect } from "vitest";
import { withBrowserPermit, browserSemaphoreStats } from "../../eval-service/src/browser/semaphore.ts";

// The critical resource constraint (PRD part-2): no matter how many evals/dimensions
// fan out, live Chromiums never exceed BROWSER_PERMITS (default 3). This drives the
// real module with 10 concurrent acquisitions — no mocks.
describe("browser semaphore", () => {
  it("caps concurrency at 3 permits across 10 parallel acquisitions", async () => {
    let live = 0;
    let maxLive = 0;

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        withBrowserPermit(async () => {
          live++;
          maxLive = Math.max(maxLive, live);
          await new Promise((r) => setTimeout(r, 40));
          live--;
          return i;
        })
      )
    );

    expect(results).toHaveLength(10); // nothing starved or dropped
    expect(maxLive).toBe(3); // saturated, never exceeded
    const stats = browserSemaphoreStats();
    expect(stats.maxObserved).toBe(3);
    expect(stats.inUse).toBe(0); // all permits returned
    expect(stats.waiting).toBe(0);
  });

  it("releases the permit when the wrapped fn throws", async () => {
    await expect(
      withBrowserPermit(async () => {
        throw new Error("browser crashed");
      })
    ).rejects.toThrow("browser crashed");
    expect(browserSemaphoreStats().inUse).toBe(0);
  });
});
