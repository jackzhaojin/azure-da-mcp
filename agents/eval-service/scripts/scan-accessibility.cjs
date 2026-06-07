#!/usr/bin/env node
/**
 * Accessibility scan script using Playwright + axe-core
 * Usage: node scripts/scan-accessibility.js <url>
 *
 * Returns axe-core results as JSON to stdout
 */

const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

async function scanAccessibility() {
  const url = process.argv[2];

  if (!url) {
    console.error('Usage: node scan-accessibility.js <url>');
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();

    // Navigate to URL
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Run accessibility scan using AxeBuilder
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    // Format results to match our schema
    const results = {
      url,
      timestamp: new Date().toISOString(),
      violations: accessibilityScanResults.violations.map(v => ({
        id: v.id,
        impact: v.impact || 'minor',
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map(n => ({
          html: n.html,
          impact: n.impact || 'minor',
          target: n.target,
          failureSummary: n.failureSummary || '',
        })),
      })),
      passes: accessibilityScanResults.passes.map(p => ({
        id: p.id,
        description: p.description,
        help: p.help,
        helpUrl: p.helpUrl,
        tags: p.tags,
      })),
      incomplete: accessibilityScanResults.incomplete.map(i => ({
        id: i.id,
        description: i.description,
        help: i.help,
        helpUrl: i.helpUrl,
        tags: i.tags,
      })),
      inapplicable: accessibilityScanResults.inapplicable.map(i => ({
        id: i.id,
        description: i.description,
        help: i.help,
        helpUrl: i.helpUrl,
        tags: i.tags,
      })),
    };

    // Output JSON to stdout
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(`Accessibility scan failed: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

scanAccessibility();
