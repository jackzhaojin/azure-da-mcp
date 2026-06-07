import { defineConfig } from "vitest/config";

// Soak tier: the M4 DoD's "10x run completes unattended" — full mesh, real eval
// engine, 10 branches through the closed loop. Run on demand: npm run test:soak
export default defineConfig({
  test: {
    include: ["tests-soak/**/*.soak.test.ts"],
    testTimeout: 900_000,
    hookTimeout: 120_000,
    retry: 0,
    fileParallelism: false,
  },
});
