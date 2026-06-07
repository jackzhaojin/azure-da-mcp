import type { MigrationBackend, MigrationRunPayload, MigrationResult } from "./types.ts";

/**
 * Dry-run backend: simulates a migration with the real artifact contract and
 * realistic timing/progress, no da.live writes. Deterministic per pageSlug so
 * fan-out variance tests behave predictably. Keeps the closed loop buildable
 * before the real backends land (makecom needs the tunnel, sdk lands at M3).
 */
export const dryrunBackend: MigrationBackend = {
  name: "dryrun",

  assertConfigured() {
    /* always available */
  },

  async run(payload: MigrationRunPayload, onProgress): Promise<MigrationResult> {
    const folder = `migration-batch-dryrun${payload.folderPostfix ? `-${payload.folderPostfix}` : ""}`;
    const base = `${payload.owner}/${payload.site}/${folder}/${payload.pageSlug}`;

    onProgress(`dryrun: analyzing source (${payload.sourceType}) ${payload.sourceLocation}`);
    await new Promise((r) => setTimeout(r, 400));
    onProgress("dryrun: authoring page into da.live (simulated)");
    await new Promise((r) => setTimeout(r, 400));
    onProgress("dryrun: validating preview (simulated, 1 iteration)");
    await new Promise((r) => setTimeout(r, 200));

    // deterministic pseudo-confidence from the slug so repeated runs agree
    let hash = 0;
    for (const c of payload.pageSlug) hash = (hash * 31 + c.charCodeAt(0)) % 1000;
    const confidence = 80 + (hash % 18); // 80–97

    return {
      pageUrl: `https://da.live/edit#/${base}`,
      previewUrl: `https://main--${payload.site}--${payload.owner}.aem.page/${folder}/${payload.pageSlug}`,
      status: confidence >= 85 ? "PASS" : "NEEDS-REFINEMENT",
      confidence,
      blocksUsed: ["hero", "cards", "columns"],
      refinementIterations: 1,
      gaps: confidence >= 85 ? [] : ["dryrun: simulated low-confidence gap"],
      backend: "dryrun",
    };
  },
};
