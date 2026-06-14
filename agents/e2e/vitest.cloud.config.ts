import { defineConfig } from "vitest/config";

// Cloud tier: the DEPLOYED mesh on Cloudflare Containers (content-factory*.jackzhaojin.com).
// No servers are spawned — tests drive the public hostnames over the real A2A
// protocol with the mesh token, and assert store state via /store/runs (no
// direct sqlite/D1 access). Cold starts + real Kimi turns → long timeouts.
// Gated: skips without A2A_MESH_TOKEN (and the Kimi file without DALIVE_TEST_*).
export default defineConfig({
  test: {
    include: ["tests-cloud/**/*.cloud.test.ts"],
    testTimeout: 1_500_000, // 25 min — a K2.6 migration turn alone can take 10-20
    hookTimeout: 120_000,
    retry: 0,
    fileParallelism: false,
  },
});
