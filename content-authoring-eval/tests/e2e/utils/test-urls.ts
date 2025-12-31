/**
 * Real test URLs - these must be stable, public, and representative
 */

export const TEST_URLS = {
  // Simple stable page for testing (Adobe URL has HTTP/2 protocol issues with Playwright)
  migratedHtml: 'https://example.com',

  // Simple stable source for comparison
  sourceHtml: 'https://www.w3.org/',

  // Real public PDF (use a direct link that won't redirect)
  sourcePdf: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',

  // Alternative PDF (smaller, faster)
  sourcePdfSmall: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',

  // Simple page for fast tests
  simple: 'https://example.com',
};

export const TEST_CONFIG = {
  // Timeouts
  deterministicTimeout: 30000,  // 30s
  agenticTimeout: 120000,       // 2 minutes

  // Expected score ranges (sanity checks)
  minValidScore: 0,
  maxValidScore: 100,

  // Minimum findings for agentic (proves it ran)
  minAgenticFindings: 0, // Some pages may have 0 issues
};
