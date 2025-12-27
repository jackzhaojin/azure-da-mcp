/**
 * Structure Agent - Deterministic Analysis
 * HTML parsing and structure extraction using Cheerio
 */

import * as cheerio from 'cheerio';
import { createLogger, Timer } from '@/lib/logger';
import type {
  MetaTags,
  HeadingNode,
  HeadingHierarchy,
  DocumentStructure,
  LinkAnalysis,
  ContentBlocks,
  StructureMetrics,
  StructureComparison,
} from './types';

const logger = createLogger('deterministic');

/**
 * Fetch HTML content from URL
 */
async function fetchHTML(url: string): Promise<string> {
  const timer = new Timer();
  logger.debug('Fetching HTML', { url });

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    logger.operationComplete('HTML fetch', timer.elapsed(), {
      url,
      htmlLength: html.length,
      statusCode: response.status,
    });
    return html;
  } catch (error) {
    logger.error('HTML fetch failed', error instanceof Error ? error : new Error(String(error)), { url });
    throw error;
  }
}

/**
 * Extract meta tags from HTML document
 */
export function extractMetaTags($: cheerio.CheerioAPI): MetaTags {
  return {
    title: $('title').first().text().trim() || null,
    description: $('meta[name="description"]').attr('content') || null,
    keywords: $('meta[name="keywords"]').attr('content') || null,
    ogTitle: $('meta[property="og:title"]').attr('content') || null,
    ogDescription: $('meta[property="og:description"]').attr('content') || null,
    ogImage: $('meta[property="og:image"]').attr('content') || null,
    ogType: $('meta[property="og:type"]').attr('content') || null,
    twitterCard: $('meta[name="twitter:card"]').attr('content') || null,
    twitterTitle: $('meta[name="twitter:title"]').attr('content') || null,
    twitterDescription: $('meta[name="twitter:description"]').attr('content') || null,
    twitterImage: $('meta[name="twitter:image"]').attr('content') || null,
    canonical: $('link[rel="canonical"]').attr('href') || null,
    robots: $('meta[name="robots"]').attr('content') || null,
    viewport: $('meta[name="viewport"]').attr('content') || null,
    charset: $('meta[charset]').attr('charset') || $('meta[http-equiv="Content-Type"]').attr('content') || null,
  };
}

/**
 * Extract heading hierarchy from HTML document
 */
export function extractHeadingHierarchy($: cheerio.CheerioAPI): HeadingHierarchy {
  const headings: HeadingNode[] = [];
  const issues: string[] = [];

  // Extract all headings (h1-h6)
  $('h1, h2, h3, h4, h5, h6').each((_, element) => {
    const $el = $(element);
    const tagName = element.tagName.toLowerCase();
    const level = parseInt(tagName.substring(1), 10);
    const text = $el.text().trim();
    const id = $el.attr('id') || null;

    headings.push({ level, text, id });
  });

  // Count H1s
  const h1Count = headings.filter((h) => h.level === 1).length;
  const hasH1 = h1Count > 0;

  // Check for multiple H1s
  if (h1Count > 1) {
    issues.push(`Multiple H1 tags found (${h1Count}). Best practice: use exactly one H1 per page.`);
  } else if (h1Count === 0) {
    issues.push('No H1 tag found. Every page should have exactly one H1.');
  }

  // Check for proper nesting (no level skipping)
  let hasProperNesting = true;
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1];
    const curr = headings[i];

    // If heading level jumps more than 1 (e.g., H2 → H4), it's improper nesting
    if (curr.level > prev.level + 1) {
      hasProperNesting = false;
      issues.push(`Heading hierarchy skip: H${prev.level} → H${curr.level} (skipped H${prev.level + 1})`);
    }
  }

  return {
    headings,
    hasH1,
    h1Count,
    hasProperNesting,
    issues,
  };
}

/**
 * Extract document structure elements
 */
export function extractDocumentStructure($: cheerio.CheerioAPI): DocumentStructure {
  return {
    hasHeader: $('header').length > 0,
    hasNav: $('nav').length > 0,
    hasMain: $('main').length > 0,
    hasFooter: $('footer').length > 0,
    hasAside: $('aside').length > 0,
    sectionCount: $('section').length,
    articleCount: $('article').length,
    formCount: $('form').length,
  };
}

/**
 * Analyze links in the document
 */
export function analyzeLinkStructure($: cheerio.CheerioAPI, baseUrl: string): LinkAnalysis {
  const links = $('a');
  let totalLinks = 0;
  let internalLinks = 0;
  let externalLinks = 0;
  let brokenAnchors = 0;
  let linksWithoutText = 0;

  links.each((_, element) => {
    const $link = $(element);
    const href = $link.attr('href');
    const text = $link.text().trim();

    totalLinks++;

    // Check for links without text
    if (!text && !$link.find('img').length) {
      linksWithoutText++;
    }

    if (!href) {
      brokenAnchors++;
      return;
    }

    // Determine internal vs external
    if (href.startsWith('#')) {
      // Anchor link
      internalLinks++;
    } else if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
      // Relative link - internal
      internalLinks++;
    } else if (href.startsWith('http://') || href.startsWith('https://')) {
      // Absolute link - check if same domain
      try {
        const linkUrl = new URL(href);
        const pageUrl = new URL(baseUrl);

        if (linkUrl.hostname === pageUrl.hostname) {
          internalLinks++;
        } else {
          externalLinks++;
        }
      } catch {
        // Invalid URL
        brokenAnchors++;
      }
    } else {
      // Other protocols (mailto:, tel:, etc.) - count as internal
      internalLinks++;
    }
  });

  return {
    totalLinks,
    internalLinks,
    externalLinks,
    brokenAnchors,
    linksWithoutText,
  };
}

/**
 * Extract content blocks (header, nav, main, footer, aside)
 */
export function extractContentBlocks($: cheerio.CheerioAPI): ContentBlocks {
  return {
    header: $('header').first().html() || null,
    nav: $('nav').first().html() || null,
    main: $('main').first().html() || null,
    footer: $('footer').first().html() || null,
    aside: $('aside').first().html() || null,
  };
}

/**
 * Analyze HTML structure and extract all metrics
 */
export async function analyzeStructure(url: string): Promise<StructureMetrics> {
  const timer = new Timer();
  logger.info('Starting structure analysis', { url });

  try {
    // Fetch HTML
    const html = await fetchHTML(url);

    // Load HTML into Cheerio
    const $ = cheerio.load(html);
    logger.debug('HTML loaded into Cheerio', { htmlLength: html.length });

    // Extract all metrics
    const metaTags = extractMetaTags($);
    logger.debug('Meta tags extracted', { hasTitle: !!metaTags.title, hasDescription: !!metaTags.description });

    const headingHierarchy = extractHeadingHierarchy($);
    logger.debug('Heading hierarchy extracted', {
      headingCount: headingHierarchy.headings.length,
      h1Count: headingHierarchy.h1Count,
      hasProperNesting: headingHierarchy.hasProperNesting,
      issueCount: headingHierarchy.issues.length,
    });

    const documentStructure = extractDocumentStructure($);
    logger.debug('Document structure extracted', {
      hasMain: documentStructure.hasMain,
      hasHeader: documentStructure.hasHeader,
      hasFooter: documentStructure.hasFooter,
    });

    const linkAnalysis = analyzeLinkStructure($, url);
    logger.debug('Link analysis complete', {
      totalLinks: linkAnalysis.totalLinks,
      internalLinks: linkAnalysis.internalLinks,
      externalLinks: linkAnalysis.externalLinks,
      brokenAnchors: linkAnalysis.brokenAnchors,
    });

    const contentBlocks = extractContentBlocks($);
    logger.debug('Content blocks extracted');

    // Calculate lengths
    const rawHtmlLength = html.length;
    const textContentLength = $('body').text().trim().length;

    const result: StructureMetrics = {
      metaTags,
      headingHierarchy,
      documentStructure,
      linkAnalysis,
      contentBlocks,
      rawHtmlLength,
      textContentLength,
    };

    logger.operationComplete('Structure analysis', timer.elapsed(), {
      url,
      h1Count: headingHierarchy.h1Count,
      hasMain: documentStructure.hasMain,
      totalLinks: linkAnalysis.totalLinks,
    });

    return result;
  } catch (error) {
    logger.error('Structure analysis failed', error instanceof Error ? error : new Error(String(error)), {
      url,
      duration: timer.elapsed(),
    });
    throw error;
  }
}

/**
 * Compare two structure metrics and calculate similarity score
 */
export function compareStructure(
  expected: StructureMetrics,
  actual: StructureMetrics
): StructureComparison {
  logger.info('Starting structure comparison');

  const metaTagsDiff = {
    missing: [] as string[],
    extra: [] as string[],
    changed: [] as string[],
  };

  const headingDiff = {
    missingHeadings: [] as string[],
    extraHeadings: [] as string[],
    hierarchyChanged: false,
  };

  const structureDiff = {
    missingElements: [] as string[],
    extraElements: [] as string[],
  };

  // Compare meta tags
  const expectedMeta = expected.metaTags;
  const actualMeta = actual.metaTags;

  Object.keys(expectedMeta).forEach((key) => {
    const typedKey = key as keyof MetaTags;
    const expectedValue = expectedMeta[typedKey];
    const actualValue = actualMeta[typedKey];

    if (expectedValue && !actualValue) {
      metaTagsDiff.missing.push(key);
    } else if (!expectedValue && actualValue) {
      metaTagsDiff.extra.push(key);
    } else if (expectedValue !== actualValue && expectedValue && actualValue) {
      metaTagsDiff.changed.push(key);
    }
  });

  // Compare headings
  const expectedHeadings = expected.headingHierarchy.headings.map((h) => `H${h.level}: ${h.text}`);
  const actualHeadings = actual.headingHierarchy.headings.map((h) => `H${h.level}: ${h.text}`);

  expectedHeadings.forEach((heading) => {
    if (!actualHeadings.includes(heading)) {
      headingDiff.missingHeadings.push(heading);
    }
  });

  actualHeadings.forEach((heading) => {
    if (!expectedHeadings.includes(heading)) {
      headingDiff.extraHeadings.push(heading);
    }
  });

  headingDiff.hierarchyChanged =
    expected.headingHierarchy.hasProperNesting !== actual.headingHierarchy.hasProperNesting;

  // Compare document structure
  const expectedStruct = expected.documentStructure;
  const actualStruct = actual.documentStructure;

  if (expectedStruct.hasHeader && !actualStruct.hasHeader) {
    structureDiff.missingElements.push('header');
  }
  if (expectedStruct.hasNav && !actualStruct.hasNav) {
    structureDiff.missingElements.push('nav');
  }
  if (expectedStruct.hasMain && !actualStruct.hasMain) {
    structureDiff.missingElements.push('main');
  }
  if (expectedStruct.hasFooter && !actualStruct.hasFooter) {
    structureDiff.missingElements.push('footer');
  }
  if (expectedStruct.hasAside && !actualStruct.hasAside) {
    structureDiff.missingElements.push('aside');
  }

  if (!expectedStruct.hasHeader && actualStruct.hasHeader) {
    structureDiff.extraElements.push('header');
  }
  if (!expectedStruct.hasNav && actualStruct.hasNav) {
    structureDiff.extraElements.push('nav');
  }
  if (!expectedStruct.hasMain && actualStruct.hasMain) {
    structureDiff.extraElements.push('main');
  }
  if (!expectedStruct.hasFooter && actualStruct.hasFooter) {
    structureDiff.extraElements.push('footer');
  }
  if (!expectedStruct.hasAside && actualStruct.hasAside) {
    structureDiff.extraElements.push('aside');
  }

  // Calculate similarity score (0-100)
  let score = 100;

  // Penalize missing meta tags (-3 points each)
  score -= metaTagsDiff.missing.length * 3;

  // Penalize changed meta tags (-2 points each)
  score -= metaTagsDiff.changed.length * 2;

  // Penalize missing headings (-5 points each)
  score -= headingDiff.missingHeadings.length * 5;

  // Penalize hierarchy changes (-10 points)
  if (headingDiff.hierarchyChanged) {
    score -= 10;
  }

  // Penalize missing structural elements (-8 points each)
  score -= structureDiff.missingElements.length * 8;

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  logger.info('Structure comparison complete', {
    similarityScore: score,
    missingMetaTags: metaTagsDiff.missing.length,
    missingHeadings: headingDiff.missingHeadings.length,
    missingElements: structureDiff.missingElements.length,
  });

  return {
    metaTagsDiff,
    headingDiff,
    structureDiff,
    score,
  };
}
