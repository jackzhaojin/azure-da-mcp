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
    blockLibraryUrl: `${AEM_BASE}/ai-content/blocks/`,
    neighborPageUrl: `${AEM_BASE}/ai-content/stories/chasing-sunsets`,
    pattern: "article",
  },
};

/** The profile for a site, or an empty profile (generic behavior) for unknown sites. */
export function getSiteProfile(site?: string): SiteProfile {
  return (site && PROFILES[site]) || {};
}
