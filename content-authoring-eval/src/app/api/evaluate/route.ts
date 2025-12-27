import { NextRequest, NextResponse } from 'next/server';
import { EvaluationRequest, EvaluationReport } from '@/types/evaluation';
import { SYSTEM_VERSION } from '@/lib/constants';

/**
 * POST /api/evaluate
 *
 * Main evaluation endpoint (placeholder for Phase 12)
 * Will orchestrate all 4 agents in parallel
 */
export async function POST(request: NextRequest) {
  try {
    const body: EvaluationRequest = await request.json();

    // Validate request
    if (!body.migratedUrl) {
      return NextResponse.json(
        { error: 'migratedUrl is required' },
        { status: 400 }
      );
    }

    // Placeholder response
    // In Phase 12, this will call the orchestrator
    const placeholderReport: EvaluationReport = {
      id: `eval-${Date.now()}`,
      request: body,
      summary: {
        overallScore: 0,
        grade: 'critical',
        passedDimensions: 0,
        totalDimensions: 4,
      },
      results: {},
      findings: [],
      metadata: {
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        version: SYSTEM_VERSION,
      },
    };

    return NextResponse.json(placeholderReport);
  } catch (error) {
    console.error('Error in /api/evaluate:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
  return NextResponse.json({
    status: 'ok',
    version: SYSTEM_VERSION,
    message: 'Evaluation API is ready (placeholder)',
  });
}
