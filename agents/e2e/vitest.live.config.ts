import { defineConfig } from "vitest/config";

// Live tier: real eval engine, real Chromium (Playwright + axe-core + screenshots).
// API keys are stripped by the tests, so agentic analysis falls back to
// deterministic — real browsers, zero API spend, ~2 min.
export default defineConfig({
  test: {
    include: ["tests-live/**/*.live.test.ts"],
    testTimeout: 240_000,
    hookTimeout: 60_000,
    retry: 0,
    fileParallelism: false,
  },
});
