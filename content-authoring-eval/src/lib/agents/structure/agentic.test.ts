/**
 * Test file for agentic structure analysis
 * This demonstrates the expected behavior when Claude API is properly configured
 */

import type { StructureMetrics, AgenticAnalysisResult } from './types';

/**
 * Mock structure metrics for testing
 */
export const mockStructureMetrics: StructureMetrics = {
  metaTags: {
    title: 'Example Domain',
    description: null,
    keywords: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    ogType: null,
    twitterCard: null,
    twitterTitle: null,
    twitterDescription: null,
    twitterImage: null,
    canonical: null,
    robots: null,
    viewport: 'width=device-width, initial-scale=1',
    charset: 'utf-8',
  },
  headingHierarchy: {
    headings: [{ level: 1, text: 'Example Domain', id: null }],
    hasH1: true,
    h1Count: 1,
    hasProperNesting: true,
    issues: [],
  },
  documentStructure: {
    hasHeader: false,
    hasNav: false,
    hasMain: false,
    hasFooter: false,
    hasAside: false,
    sectionCount: 0,
    articleCount: 0,
    formCount: 0,
  },
  linkAnalysis: {
    totalLinks: 1,
    internalLinks: 0,
    externalLinks: 1,
    brokenAnchors: 0,
    linksWithoutText: 0,
  },
  contentBlocks: {
    header: null,
    nav: null,
    main: null,
    footer: null,
    aside: null,
  },
  rawHtmlLength: 1256,
  textContentLength: 156,
};

/**
 * Expected Claude response for the mock structure
 */
export const mockClaudeResponse: AgenticAnalysisResult = {
  findings: [
    {
      dimension: 'structure',
      severity: 'serious',
      issue: 'Missing meta description tag',
      recommendation: 'Add a meta description tag with 150-160 characters describing the page content',
      impact: 'SEO: Meta descriptions appear in search results and improve click-through rates. Missing this reduces search visibility.',
    },
    {
      dimension: 'structure',
      severity: 'serious',
      issue: 'Missing Open Graph tags',
      recommendation: 'Add og:title, og:description, og:image, and og:type tags for social media sharing',
      impact: 'Social Media: Without OG tags, shared links will display poorly on Facebook, LinkedIn, and other platforms.',
    },
    {
      dimension: 'structure',
      severity: 'critical',
      issue: 'Missing semantic HTML5 structure',
      recommendation: 'Wrap content in <main> tag, add <header> and <footer> elements for proper document structure',
      impact: 'Accessibility: Screen readers rely on semantic HTML to navigate. SEO: Search engines use semantic structure for content understanding.',
    },
    {
      dimension: 'structure',
      severity: 'moderate',
      issue: 'No navigation element',
      recommendation: 'Add <nav> element with site navigation links',
      impact: 'Accessibility: Users with assistive technology need navigation landmarks. UX: Clear navigation improves usability.',
    },
  ],
  score: 45,
  summary: 'Structure has critical issues: missing semantic HTML5 elements (main, header, footer) and incomplete meta tags. Heading hierarchy is correct but overall SEO and accessibility need significant improvement.',
};

/**
 * Test the scoring calculation
 */
export function testScoringCalculation() {
  // Expected calculation:
  // Deterministic penalties:
  // - Missing description: -8
  // - Missing viewport: 0 (has viewport)
  // - Missing OG tags: -7
  // - No H1 issues: 0
  // - Missing main: -8
  // - Missing header: -4
  // - Missing footer: -4
  // - Missing nav: -4
  // Deterministic score: 100 - 8 - 7 - 8 - 4 - 4 - 4 = 65

  const deterministicScore = 65;
  const agenticScore = 45;

  // Final score: 70% agentic + 30% deterministic
  const finalScore = Math.round(agenticScore * 0.7 + deterministicScore * 0.3);
  // = Math.round(45 * 0.7 + 65 * 0.3)
  // = Math.round(31.5 + 19.5)
  // = 51

  console.log('Deterministic score:', deterministicScore);
  console.log('Agentic score:', agenticScore);
  console.log('Final score:', finalScore);
  console.log('Grade:', finalScore >= 60 ? 'acceptable' : finalScore >= 40 ? 'needs-improvement' : 'critical');

  return finalScore;
}

// Run test if executed directly
if (require.main === module) {
  console.log('Testing scoring calculation...\n');
  testScoringCalculation();
}
