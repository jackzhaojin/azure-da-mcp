import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.e2e.test.ts"],
    // Real servers + real protocol: generous timeouts, no retries (flake = a finding)
    testTimeout: 30_000,
    hookTimeout: 30_000,
    retry: 0,
  },
});
