/**
 * Content Fidelity Agent API Endpoint
 *
 * Provides content fidelity analysis comparing PDF source against migrated webpage.
 * Supports dual mode: full (deterministic + agentic) and deterministic-only.
 *
 * Version: 2.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeContent, analyzeContentWithClaude } from '@/lib/agents/content';
import { createLogger, Timer } from '@/lib/logger';
import type { ContentAnalysisResult } from '@/lib/agents/content/types';

const logger = createLogger('api');

/**
 * Calculate grade from score
 */
function calculateGrade(score: number): ContentAnalysisResult['grade'] {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'acceptable';
  if (score >= 40) return 'needs-improvement';
  return 'critical';
}

/**
 * GET /api/evaluate/content
 * Health check endpoint
 */
export async function GET() {
  const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;

  return NextResponse.json({
    status: 'ok',
    version: '2.0.0',
    agent: 'content',
    capabilities: {
      deterministic: true,
      agentic: hasOAuthToken,
    },
  });
}

/**
 * POST /api/evaluate/content
 * Analyze content fidelity between source (PDF or HTML) and migrated webpage
 *
 * Request body:
 * {
 *   "pdfUrl": "https://example.com/document.pdf" (for PDF→HTML),
 *   "sourceUrl": "https://example.com/original" (for HTML→HTML),
 *   "migratedUrl": "https://example.com/page"
 * }
 */
export async function POST(request: NextRequest) {
  const timer = new Timer();
  logger.requestStart('POST', '/api/evaluate/content');

  try {
    const body = await request.json();
    logger.debug('Request body parsed', {
      pdfUrl: body.pdfUrl,
      sourceUrl: body.sourceUrl,
      migratedUrl: body.migratedUrl
    });

    // Validate required fields - need either pdfUrl OR sourceUrl
    const sourceUrl = body.pdfUrl || body.sourceUrl;
    if (!sourceUrl || !body.migratedUrl) {
      logger.warn('Validation failed: missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: (pdfUrl OR sourceUrl) and migratedUrl' },
        { status: 400 }
      );
    }

    // Validate URLs
    try {
      new URL(sourceUrl);
      new URL(body.migratedUrl);
    } catch (error) {
      logger.warn('Validation failed: invalid URLs', { error });
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Determine source type based on URL
    const isPDF = sourceUrl.toLowerCase().endsWith('.pdf');
    const sourceType: 'pdf' | 'html' = isPDF ? 'pdf' : 'html';
    logger.info('Source type detected', { sourceType, sourceUrl });

    // Detect mode based on OAuth token and query parameter
    const mode = body.mode || (process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'full' : 'deterministic');
    logger.info('Analysis mode detected', { mode, hasToken: !!process.env.CLAUDE_CODE_OAUTH_TOKEN });

    // Step 1: Perform deterministic content analysis
    const deterministicTimer = new Timer();
    logger.info(`Starting deterministic content analysis (${sourceType.toUpperCase()}→HTML)`, {
      sourceUrl,
      migratedUrl: body.migratedUrl,
      sourceType,
    });

    const deterministicMetrics = await analyzeContent(sourceUrl, body.migratedUrl);

    logger.operationComplete('Deterministic content analysis', deterministicTimer.elapsed(), {
      score: deterministicMetrics.score,
      similarityScore: deterministicMetrics.diff.similarityScore,
    });

    // Step 2: If full mode, add agentic analysis
    if (mode === 'full' && process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      const agenticTimer = new Timer();
      logger.info('Starting agentic content analysis (Claude Agent SDK)');

      try {
        const fullResult = await analyzeContentWithClaude(
          sourceUrl,
          body.migratedUrl,
          deterministicMetrics,
          sourceType
        );

        logger.operationComplete('Agentic content analysis', agenticTimer.elapsed(), {
          agenticScore: fullResult.agentic?.score,
          finalScore: fullResult.finalScore,
          grade: fullResult.grade,
        });

        logger.requestComplete('POST', '/api/evaluate/content', 200, timer.elapsed());

        return NextResponse.json(fullResult);
      } catch (error) {
        // Fallback to deterministic-only on agentic error
        logger.warn('Agentic analysis failed, using deterministic-only mode', {
          error: (error as Error).message,
          duration: agenticTimer.elapsed(),
        });

        // Return deterministic result with fallback mode flag
        const fallbackResult = {
          pdfUrl: sourceUrl, // Keep field name for backward compatibility
          migratedUrl: body.migratedUrl,
          deterministic: deterministicMetrics,
          finalScore: deterministicMetrics.score,
          grade: calculateGrade(deterministicMetrics.score),
          timestamp: new Date().toISOString(),
          mode: 'deterministic' as const,
          metadata: {
            deterministic: deterministicMetrics.metadata,
          },
        };

        logger.requestComplete('POST', '/api/evaluate/content', 200, timer.elapsed());

        return NextResponse.json(fallbackResult);
      }
    }

    // Deterministic-only mode
    logger.info('Using deterministic-only mode');

    const result = {
      pdfUrl: sourceUrl, // Keep field name for backward compatibility
      migratedUrl: body.migratedUrl,
      deterministic: deterministicMetrics,
      finalScore: deterministicMetrics.score,
      grade: calculateGrade(deterministicMetrics.score),
      timestamp: new Date().toISOString(),
      mode: 'deterministic' as const,
      metadata: {
        deterministic: deterministicMetrics.metadata,
      },
    };

    logger.requestComplete('POST', '/api/evaluate/content', 200, timer.elapsed());

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Content analysis failed', error as Error, { duration: timer.elapsed() });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.requestComplete('POST', '/api/evaluate/content', 500, timer.elapsed());

    return NextResponse.json(
      { error: 'Content analysis failed', details: errorMessage },
      { status: 500 }
    );
  }
}
