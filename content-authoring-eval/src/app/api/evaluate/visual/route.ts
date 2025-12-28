/**
 * Visual Correctness Agent API Endpoint
 *
 * GET  /api/evaluate/visual - Health check
 * POST /api/evaluate/visual - Analyze visual correctness of a webpage
 *
 * Phase 10: Deterministic visual analysis (screenshot capture, image comparison)
 * Phase 11: Agentic visual analysis (Claude multimodal analysis with vision)
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeVisual, analyzeVisualWithClaude, calculateFinalScore, calculateGrade } from '@/lib/agents/visual';
import type { VisualAnalysisResult } from '@/lib/agents/visual';
import { createLogger, Timer } from '@/lib/logger';

const logger = createLogger('api');

/**
 * GET /api/evaluate/visual
 * Health check endpoint
 */
export async function GET() {
  const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;

  return NextResponse.json({
    status: 'ok',
    version: '2.0.0',
    agent: 'visual',
    capabilities: {
      deterministic: true,
      agentic: hasOAuthToken,
    },
  });
}

/**
 * POST /api/evaluate/visual
 * Analyze visual correctness of a webpage
 *
 * Request body:
 * {
 *   "migratedUrl": "https://example.com",
 *   "baselineImagePath": "/path/to/baseline.png" // optional
 *   "viewport": { "width": 1280, "height": 720 } // optional
 *   "mode": "full" | "deterministic" // optional (default: "full" if OAuth token present)
 * }
 */
export async function POST(request: NextRequest) {
  const timer = new Timer();
  logger.requestStart('POST', '/api/evaluate/visual');

  try {
    const body = await request.json();
    logger.debug('Request body parsed', {
      url: body.migratedUrl,
      hasBaseline: !!body.baselineImagePath,
    });

    // Validate required fields
    if (!body.migratedUrl) {
      logger.warn('Validation failed: migratedUrl is required');
      return NextResponse.json(
        { error: 'migratedUrl is required' },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.migratedUrl);
    } catch {
      logger.warn('Validation failed: Invalid URL format', { url: body.migratedUrl });
      return NextResponse.json(
        { error: 'Invalid migratedUrl format' },
        { status: 400 }
      );
    }

    const viewport = body.viewport || { width: 1280, height: 720 };

    // Determine mode: full (deterministic + agentic) or deterministic-only
    const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const requestedMode = body.mode || 'full';
    const mode = hasOAuthToken && requestedMode === 'full' ? 'full' : 'deterministic';

    logger.info('Visual analysis mode determined', {
      mode,
      hasOAuthToken,
      requestedMode,
    });

    // Perform deterministic visual analysis
    logger.info('Starting deterministic visual analysis', {
      url: body.migratedUrl,
      hasBaseline: !!body.baselineImagePath,
      viewport,
    });

    const deterministicTimer = new Timer();
    const deterministic = await analyzeVisual(
      body.migratedUrl,
      body.baselineImagePath,
      viewport
    );
    logger.operationComplete('Deterministic visual analysis', deterministicTimer.elapsed(), {
      score: deterministic.score,
      screenshotPath: deterministic.screenshot.path,
    });

    // Perform agentic analysis if in full mode
    let agentic;
    let finalScore = deterministic.score;
    let grade = calculateGrade(deterministic.score);

    if (mode === 'full') {
      try {
        logger.info('Starting agentic visual analysis');
        const agenticTimer = new Timer();

        agentic = await analyzeVisualWithClaude(deterministic);

        logger.operationComplete('Agentic visual analysis', agenticTimer.elapsed(), {
          score: agentic.score,
          findingsCount: agentic.findings.length,
        });

        // Calculate weighted final score (70% agentic + 30% deterministic)
        finalScore = calculateFinalScore(agentic.score, deterministic.score);
        grade = calculateGrade(finalScore);

        logger.info('Final score calculated', {
          agenticScore: agentic.score,
          deterministicScore: deterministic.score,
          finalScore,
          grade,
        });
      } catch (agenticError) {
        // Graceful fallback: if agentic fails, use deterministic-only
        logger.warn('Agentic analysis failed, falling back to deterministic-only', {
          error: (agenticError as Error).message,
        });
        // agentic remains undefined, finalScore and grade already set to deterministic values
      }
    }

    const result: VisualAnalysisResult = {
      url: body.migratedUrl,
      baselineUrl: body.baselineImagePath,
      deterministic,
      agentic,
      finalScore,
      grade,
      timestamp: new Date().toISOString(),
      mode: agentic ? 'full' : 'deterministic',
      metadata: {
        deterministic: deterministic.metadata,
        ...(agentic && {
          agentic: {
            executedAt: new Date().toISOString(),
            durationMs: 0, // Timer already logged
            model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
          },
        }),
      },
    };

    logger.requestComplete('POST', '/api/evaluate/visual', 200, timer.elapsed());
    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error;
    logger.error('Visual analysis failed', err, {
      duration: timer.elapsed(),
    });

    logger.requestComplete('POST', '/api/evaluate/visual', 500, timer.elapsed());
    return NextResponse.json(
      {
        error: 'Visual analysis failed',
        message: err.message,
      },
      { status: 500 }
    );
  }
}
