/**
 * Deterministic Accessibility Agent
 *
 * Uses axe-core via Playwright to scan webpages for WCAG 2.2 AA violations.
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLogger, Timer } from '@/lib/logger';
import type {
  AccessibilityMetrics,
  AxeViolation,
  AxeResults,
} from './types';

const logger = createLogger('deterministic');

/**
 * Run axe-core accessibility scan on URL
 */
export async function scanAccessibility(url: string): Promise<AxeResults> {
  const timer = new Timer();
  logger.info('Starting accessibility scan', { url });

  let browser;
  try {
    // Launch browser in headless mode
    logger.debug('Launching Playwright browser');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({
      bypassCSP: true, // Allow axe-core to inject JavaScript
    });
    const page = await context.newPage();

    // Navigate to URL
    logger.debug('Navigating to URL', { url });
    await page.goto(url, { waitUntil: 'networkidle' });

    // Inject axe-core into page
    logger.debug('Injecting axe-core into page');
    const axeSource = readFileSync(
      join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'),
      'utf8'
    );
    await page.addScriptTag({
      content: axeSource,
    });

    // Wait for axe-core to be available
    await page.waitForFunction(() => {
      return typeof (window as never)['axe'] !== 'undefined';
    }, { timeout: 5000 });

    // Run axe-core scan with WCAG 2.2 AA rules
    logger.debug('Running axe-core scan');
    const axeResults = await page.evaluate(() => {
      // axe-core should be available as window.axe after script injection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const axe = (window as any).axe;
      if (!axe) {
        throw new Error('axe-core not loaded in page');
      }
      return axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
        resultTypes: ['violations', 'passes', 'incomplete', 'inapplicable'],
      });
    });

    logger.operationComplete('Accessibility scan', timer.elapsed(), {
      violations: axeResults.violations.length,
      passes: axeResults.passes.length,
      incomplete: axeResults.incomplete.length,
    });

    return {
      url,
      timestamp: new Date().toISOString(),
      violations: axeResults.violations as AxeViolation[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      passes: axeResults.passes.map((pass: any) => ({
        id: pass.id,
        description: pass.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: pass.nodes.map((node: any) => ({
          html: node.html,
          target: node.target,
        })),
      })),
      incomplete: axeResults.incomplete as AxeViolation[],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inapplicable: axeResults.inapplicable.map((rule: any) => ({
        id: rule.id,
        description: rule.description,
      })),
    };
  } catch (error) {
    logger.error('Accessibility scan failed', error as Error, {
      url,
      duration: timer.elapsed(),
    });
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      logger.debug('Browser closed');
    }
  }
}

/**
 * Calculate accessibility metrics from axe results
 */
export function calculateMetrics(results: AxeResults): AccessibilityMetrics {
  const timer = new Timer();
  logger.debug('Calculating accessibility metrics', { url: results.url });

  // Count violations by impact
  const violationCounts = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    total: 0,
  };

  results.violations.forEach((violation) => {
    violationCounts.total += violation.nodes.length;
    violation.nodes.forEach((node) => {
      if (node.impact === 'critical') violationCounts.critical++;
      else if (node.impact === 'serious') violationCounts.serious++;
      else if (node.impact === 'moderate') violationCounts.moderate++;
      else if (node.impact === 'minor') violationCounts.minor++;
    });
  });

  // Calculate deterministic score (0-100)
  // Start at 100 and subtract penalty points
  let score = 100;
  score -= violationCounts.critical * 10; // -10 per critical
  score -= violationCounts.serious * 5; // -5 per serious
  score -= violationCounts.moderate * 2; // -2 per moderate
  score -= violationCounts.minor * 1; // -1 per minor
  score = Math.max(0, score); // Floor at 0

  // Determine WCAG compliance level
  let wcagLevel: 'A' | 'AA' | 'AAA' | 'none' = 'none';
  if (violationCounts.total === 0) {
    wcagLevel = 'AA'; // Assume AA if no violations
  } else if (violationCounts.critical === 0 && violationCounts.serious === 0) {
    wcagLevel = 'A'; // Only minor/moderate issues
  }

  logger.debug('Metrics calculated', {
    score,
    wcagLevel,
    violations: violationCounts.total,
    duration: timer.elapsed(),
  });

  return {
    url: results.url,
    timestamp: results.timestamp,
    violations: results.violations,
    violationCounts,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    inapplicable: results.inapplicable.length,
    score,
    wcagLevel,
  };
}

/**
 * Main entry point: Analyze accessibility
 */
export async function analyzeAccessibility(
  url: string
): Promise<AccessibilityMetrics> {
  const timer = new Timer();
  logger.info('Starting deterministic accessibility analysis', { url });

  try {
    const results = await scanAccessibility(url);
    const metrics = calculateMetrics(results);

    logger.operationComplete('Deterministic accessibility analysis', timer.elapsed(), {
      url,
      score: metrics.score,
      wcagLevel: metrics.wcagLevel,
      violations: metrics.violationCounts.total,
    });

    return metrics;
  } catch (error) {
    logger.error('Deterministic accessibility analysis failed', error as Error, {
      url,
      duration: timer.elapsed(),
    });
    throw error;
  }
}
