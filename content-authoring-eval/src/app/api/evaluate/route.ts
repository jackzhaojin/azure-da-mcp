import { NextRequest, NextResponse } from 'next/server';
import { EvaluationRequest } from '@/types/evaluation';
import { runEvaluation } from '@/lib/evaluator';
import { SYSTEM_VERSION } from '@/lib/constants';
import { createLogger, Timer } from '@/lib/logger';

const logger = createLogger('api');

/**
 * POST /api/evaluate
 *
 * Main evaluation endpoint - orchestrates all 4 agents in parallel
 * Phase 12: Complete orchestration with parallel agent execution
 */
export async function POST(request: NextRequest) {
  const timer = new Timer();
  logger.requestStart('POST', '/api/evaluate');

  try {
    const body: EvaluationRequest = await request.json();
    logger.debug('Request body parsed', {
      url: body.migratedUrl,
      hasPdf: !!body.pdfPath,
      hasExpectedUrl: !!body.expectedUrl,
    });

    // Validate request
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
      logger.warn('Validation failed: Invalid migratedUrl format');
      return NextResponse.json(
        { error: 'migratedUrl must be a valid URL' },
        { status: 400 }
      );
    }

    // Run evaluation with all 4 agents in parallel
    logger.info('Starting evaluation orchestration', {
      url: body.migratedUrl,
      agents: 4,
    });

    const report = await runEvaluation(body);

    logger.info('Evaluation complete', {
      id: report.id,
      overallScore: report.summary.overallScore,
      grade: report.summary.grade,
      passedDimensions: report.summary.passedDimensions,
      totalFindings: report.findings.length,
      totalDuration: timer.elapsed(),
    });

    logger.requestComplete('POST', '/api/evaluate', 200, timer.elapsed());
    return NextResponse.json(report);
  } catch (error) {
    logger.error(
      'Evaluation failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        url: request.url,
        duration: timer.elapsed(),
      }
    );
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evaluate
 *
 * Health check endpoint
 */
export async function GET() {
  logger.debug('Health check requested');
  return NextResponse.json({
    status: 'ok',
    version: SYSTEM_VERSION,
    message: 'Evaluation API ready - Phase 12 orchestration enabled',
    agents: {
      structure: 'enabled',
      accessibility: 'enabled',
      content: 'enabled (requires pdfPath)',
      visual: 'enabled',
    },
  });
}
