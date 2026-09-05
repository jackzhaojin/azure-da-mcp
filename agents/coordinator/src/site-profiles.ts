/**
 * Per-target-site profiles — the single place the coordinator learns how to write
 * for a given da.live site. A profile lets the SAME generic mesh produce
 * site-appropriate content: the editorial lane + voice fed to content-gen, and
 * the target folder + reference corpus + prompt pattern fed to the migration
 * agent. Sites without a profile fall back to the generic defaults (current
 * behavior preserved), so adding a site is purely additive.
 *
 * IA convention (adapt-to-2026-demo): `/ai-content` is the hand-built,
 * best-practice REFERENCE corpus (block showcases + canonical stories) the
 * migrator LEARNS from — never written to. AI-generated drafts land in a
 * separate `/ai-articles` tree so they never pollute the reference material.
 */
export interface SiteProfile {
  /** Editorial lane for content.ideate when the run carries no explicit topic (daily loop). */
  lane?: string;
  /** Site voice/concept injected into content-gen (the cleanest lever for on-brand copy). */
  siteBrief?: string;
  /** Page type hint for content-gen. */
  pageType?: string;
  /** Legacy-source styling for the synthetic source the migrator transforms. */
  legacyStyle?: "clean" | "dated" | "messy";
  /** Migration target folder for GENERATED drafts (verbatim, clean URL) — kept out of the reference corpus. */
  contentFolder?: string;
  /** Reference corpus the migrator GETs to learn block conventions (read-only best-practice). */
  blockLibraryUrl?: string;
  /** Canonical exemplar page the migrator mimics for look + block shapes. */
  neighborPageUrl?: string;
  /** Migration prompt variant. */
  pattern?: "article" | "generic";
  /**
   * Standing guiding principles for every migration to this site — appended to
   * the migration prompt. A per-run `payload.guidance` is merged AFTER this
   * (both apply); principles the agent can't satisfy land in the report's gaps.
   */
  migrationGuidance?: string;
  /**
   * Site-relative page path of the agent-MEMORY page (e.g. `ai-content/memory`)
   * — a human-readable da.live document the migration agent reads before every
   * run and the eval agent (eval.reflect) appends a dated lessons entry to after
   * every scored run. Humans edit it directly in da.live. Unset = no memory loop.
   */
  memoryPath?: string;
}

const AEM_BASE = "https://main--adapt-to-2026-demo--jackzhaojin.aem.page";

const PROFILES: Record<string, SiteProfile> = {
  // The adaptTo() Sept-2026 demo site: a serif "Wilderness Journal" of
  // first-person backcountry stories. Generated articles must look like the
  // hand-built /ai-content/stories/chasing-sunsets recipe.
  "adapt-to-2026-demo": {
    lane: "wilderness-journal",
    siteBrief:
      "The Wilderness Journal — first-person backcountry storytelling: long walks, high places, gear tested in the field, the quiet between summits. Voice: literary, specific, unhurried, expert. Author persona: Alex Rivers, backcountry guide & photographer, Sierra Nevada.",
    pageType: "article",
    legacyStyle: "clean",
    contentFolder: "ai-articles",
    // The Wilderness Path block library: an index page linking ONE showcase
    // page per block (hero, columns, quote, gallery, cards, stats, table,
    // accordion, newsletter, author-bio) — the canonical definition of every
    // block the migrator may use.
    blockLibraryUrl: `${AEM_BASE}/ai-content/blocks/`,
    neighborPageUrl: `${AEM_BASE}/ai-content/stories/chasing-sunsets`,
    pattern: "article",
    // Agent memory (v2.9): https://da.live/edit#/jackzhaojin/adapt-to-2026-demo/ai-content/memory
    // Lives in the reference tree on purpose — it is curated, human-editable
    // context, not generated content. Read before each migration, appended
    // to after each scored run.
    memoryPath: "ai-content/memory",
    // Issue #13: low-res source images were carried over as-is (e.g. a 600×400
    // hero). EDS optimizes DOWN, never up — the uploaded original is the ceiling.
    migrationGuidance:
      "Image quality: before using an image (especially the hero), check its actual resolution ONCE (Playwright naturalWidth, or the image URL). " +
      "If the best copy is narrower than ~1200px, make ONE quick attempt to find a higher-res variant of the SAME image (srcset, og:image meta, a thumbnail's full-size link target). " +
      'Use the best you find — never drop the image. If only a low-res copy exists, keep it and record the resolution in the final report\'s gaps (e.g. "hero image only 600×400 — needs a higher-res replacement").',
  },
};

/** The profile for a site, or an empty profile (generic behavior) for unknown sites. */
export function getSiteProfile(site?: string): SiteProfile {
  return (site && PROFILES[site]) || {};
}
