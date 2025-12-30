/**
 * PHASE 31: Deterministic Accessibility Agent (Stub for Pure MCP Architecture)
 *
 * DEPRECATED: Direct Playwright browser launching removed to eliminate Docker bloat.
 * Use the agentic agent (analyzeAccessibilityWithClaude) which uses Playwright MCP instead.
 *
 * This stub returns empty results to allow fallback to agentic-only mode.
 */

// PHASE 31: Removed direct playwright import
// import { chromium } from 'playwright';
// import { readFileSync } from 'fs';
// import { join } from 'path';
import { createLogger, Timer } from '@/lib/logger';
import type {
  AccessibilityMetrics,
  AxeViolation,
  AxeResults,
} from './types';

const logger = createLogger('deterministic');

/**
 * PHASE 31: Stub function - returns empty axe results
 *
 * Rationale: Removing direct chromium.launch() to allow Docker to use ONLY @playwright/mcp browsers.
 * The agentic agent will perform accessibility analysis via MCP snapshot + WCAG knowledge.
 */
export async function scanAccessibility(url: string): Promise<AxeResults> {
  const timer = new Timer();
  logger.warn('PHASE 31: Deterministic axe-core scan DISABLED - using agentic-only mode', { url });
  logger.info('Returning empty accessibility results (agentic agent will handle analysis)', { url });

  // PHASE 31: Return empty results structure
  // The agentic agent (analyzeAccessibilityWithClaude) will perform the actual analysis
  logger.operationComplete('Accessibility scan (stub)', timer.elapsed(), {
    violations: 0,
    passes: 0,
    incomplete: 0,
    note: 'Deterministic scan disabled in Phase 31 - use agentic mode',
  });

  return {
    url,
    timestamp: new Date().toISOString(),
    violations: [] as AxeViolation[],
    passes: [],
    incomplete: [],
    inapplicable: [],
  };
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
