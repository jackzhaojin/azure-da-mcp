/**
 * API Endpoint: /api/evaluate/accessibility
 *
 * Performs accessibility analysis using axe-core (deterministic) and Claude Agent SDK (agentic).
 * Version 2.0.0: Added agentic analysis with user-impact prioritization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger, Timer } from '@/lib/logger';
import {
  analyzeAccessibility,
  analyzeAccessibilityWithClaude,
  compareAccessibility,
  comparePDFToHTMLAccessibility,
  fetchAndExtractPDFAccessibility,
} from '@/lib/agents/accessibility';
import type { AccessibilityComparison } from '@/lib/agents/accessibility';

const logger = createLogger('api');

/**
 * GET /api/evaluate/accessibility
 * Health check endpoint
 */
export async function GET() {
  logger.requestStart('GET', '/api/evaluate/accessibility');

  const response = {
    status: 'ok',
    version: '2.0.0',
    agent: 'accessibility',
    capabilities: {
      deterministic: true,
      agentic: !!process.env.CLAUDE_CODE_OAUTH_TOKEN,
    },
  };

  logger.requestComplete('GET', '/api/evaluate/accessibility', 200, 0);
  return NextResponse.json(response);
}

/**
 * POST /api/evaluate/accessibility
 * Analyze accessibility of a webpage
 *
 * Request body:
 * {
 *   "migratedUrl": "https://example.com",
 *   "sourceUrl": "https://source.example.com/original" (optional, HTML source),
 *   "pdfUrl": "https://cdn.example.com/document.pdf" (optional, PDF source),
 *   "mode": "full" | "deterministic" (optional, default: "full" if OAuth token present)
 * }
 */
export async function POST(request: NextRequest) {
  const timer = new Timer();
  logger.requestStart('POST', '/api/evaluate/accessibility');

  try {
    const body = await request.json();
    logger.debug('Request body parsed', { url: body.migratedUrl, mode: body.mode });

    // Validate request
    if (!body.migratedUrl || typeof body.migratedUrl !== 'string') {
      logger.warn('Validation failed: migratedUrl is required');
      return NextResponse.json(
        { error: 'migratedUrl is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.migratedUrl);
    } catch {
      logger.warn('Validation failed: Invalid URL format', { url: body.migratedUrl });
      return NextResponse.json(
        { error: 'migratedUrl must be a valid HTTP/HTTPS URL' },
        { status: 400 }
      );
    }

    // Determine mode: full (deterministic + agentic) or deterministic-only
    const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const requestedMode = body.mode || (hasOAuthToken ? 'full' : 'deterministic');
    const mode = requestedMode === 'full' && hasOAuthToken ? 'full' : 'deterministic';

    logger.info('Accessibility analysis mode determined', { mode, hasOAuthToken, requestedMode });

    // Run deterministic analysis first
    logger.info('Starting deterministic accessibility analysis', { url: body.migratedUrl });
    const metrics = await analyzeAccessibility(body.migratedUrl);

    logger.operationComplete('Deterministic accessibility analysis', timer.elapsed(), {
      score: metrics.score,
      wcagLevel: metrics.wcagLevel,
      violations: metrics.violationCounts.total,
    });

    // PHASE 37: Determine source type and compare
    let sourceComparison: AccessibilityComparison | null = null;
    let sourceType: 'html' | 'pdf' | 'none' = 'none';

    if (body.sourceUrl) {
      // HTML source comparison
      sourceType = 'html';
      logger.info('Running HTML source accessibility comparison', { sourceUrl: body.sourceUrl });
      const sourceMetrics = await analyzeAccessibility(body.sourceUrl);
      sourceComparison = compareAccessibility(sourceMetrics, metrics);
    } else if (body.pdfUrl) {
      // PDF source comparison
      sourceType = 'pdf';
      logger.info('Running PDF → HTML accessibility comparison', { pdfUrl: body.pdfUrl });
      const pdfInfo = await fetchAndExtractPDFAccessibility(body.pdfUrl);
      sourceComparison = comparePDFToHTMLAccessibility(pdfInfo, metrics);
    }

    // If full mode, run agentic analysis
    if (mode === 'full') {
      try {
        logger.info('Starting agentic accessibility analysis', { url: body.migratedUrl });
        const agenticTimer = new Timer();

        const result = await analyzeAccessibilityWithClaude(body.migratedUrl, metrics);

        logger.operationComplete('Agentic accessibility analysis', agenticTimer.elapsed(), {
          finalScore: result.finalScore,
          grade: result.grade,
          findings: result.agentic.findings.length,
          quickWins: result.agentic.quickWins.length,
          majorIssues: result.agentic.majorIssues.length,
        });

        // Return full analysis result
        const response = {
          ...result,
          mode: 'full',
          sourceType, // PHASE 37
          sourceComparison, // PHASE 37
          metadata: {
            deterministic: {
              executedAt: metrics.timestamp,
              durationMs: timer.elapsed(),
              toolsUsed: ['axe-core', 'playwright'],
            },
            agentic: {
              executedAt: result.timestamp,
              durationMs: agenticTimer.elapsed(),
              model: 'claude-haiku-4-5-20250929',
            },
          },
        };

        logger.requestComplete('POST', '/api/evaluate/accessibility', 200, timer.elapsed());
        return NextResponse.json(response);
      } catch (agenticError) {
        logger.warn('Agentic analysis failed, falling back to deterministic-only', {
          error: agenticError instanceof Error ? agenticError.message : String(agenticError),
        });
        // Fall through to deterministic-only response
      }
    }

    // Return deterministic-only result
    const response = {
      url: metrics.url,
      timestamp: metrics.timestamp,
      violations: metrics.violations,
      violationCounts: metrics.violationCounts,
      passes: metrics.passes,
      incomplete: metrics.incomplete,
      inapplicable: metrics.inapplicable,
      score: metrics.score,
      wcagLevel: metrics.wcagLevel,
      mode: 'deterministic',
      sourceType, // PHASE 37
      sourceComparison, // PHASE 37
      metadata: {
        executedAt: metrics.timestamp,
        durationMs: timer.elapsed(),
        toolsUsed: ['axe-core', 'playwright'],
      },
    };

    logger.requestComplete('POST', '/api/evaluate/accessibility', 200, timer.elapsed());
    return NextResponse.json(response);
  } catch (error) {
    logger.error('Accessibility analysis failed', error as Error, {
      duration: timer.elapsed(),
    });

    return NextResponse.json(
      {
        error: 'Failed to analyze accessibility',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
