import type { MigrationBackend, MigrationRunPayload, MigrationResult, BackendContext } from "./types.ts";

/**
 * Claude Agent SDK backend — scaffold (lands at M3 per PRD part-5).
 * Will drive the da-live-author-playwright skill flow: read source → author
 * blocks into da.live via the DA Admin API → preview-publish → Playwright
 * validation loop (≤ maxRefinementIterations).
 */
export const sdkBackend: MigrationBackend = {
  name: "sdk",

  assertConfigured() {
    if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !process.env.ANTHROPIC_API_KEY) {
      throw new Error("sdk backend not configured: needs CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY");
    }
    throw new Error("sdk backend: implementation lands at M3 (PRD part-5). Use backend:'dryrun' meanwhile.");
  },

  async run(_payload: MigrationRunPayload, _ctx: BackendContext): Promise<MigrationResult> {
    throw new Error("sdk backend: not implemented until M3");
  },
};
