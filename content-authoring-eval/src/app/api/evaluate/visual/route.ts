/**
 * Visual Correctness Agent API Endpoint
 *
 * GET  /api/evaluate/visual - Health check
 * POST /api/evaluate/visual - Analyze visual correctness of a webpage
 *
 * Phase 10: Deterministic visual analysis (screenshot capture, image comparison)
 * Phase 11: Agentic visual analysis (Claude multimodal analysis) - TBD
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeVisual } from '@/lib/agents/visual';
import type { VisualAnalysisResult } from '@/lib/agents/visual';
import { createLogger, Timer } from '@/lib/logger';

const logger = createLogger('api');

/**
 * GET /api/evaluate/visual
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: '1.0.0',
    agent: 'visual',
    capabilities: {
      deterministic: true,
      agentic: false, // Phase 11
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

    logger.info('Starting deterministic visual analysis', {
      url: body.migratedUrl,
      hasBaseline: !!body.baselineImagePath,
      viewport,
    });

    // Perform deterministic visual analysis
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

    // For Phase 10, we only have deterministic analysis
    // Phase 11 will add agentic analysis with Claude multimodal
    const result: VisualAnalysisResult = {
      url: body.migratedUrl,
      baselineUrl: body.baselineImagePath,
      deterministic,
      finalScore: deterministic.score,
      grade: calculateGrade(deterministic.score),
      timestamp: new Date().toISOString(),
      mode: 'deterministic',
      metadata: {
        deterministic: deterministic.metadata,
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

/**
 * Calculate grade from score
 */
function calculateGrade(score: number): string {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'acceptable';
  if (score >= 40) return 'needs-improvement';
  return 'critical';
}
