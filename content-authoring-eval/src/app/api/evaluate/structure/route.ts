/**
 * Structure Evaluation API Route
 * POST /api/evaluate/structure
 *
 * Supports two modes:
 * 1. Deterministic-only: { migratedUrl, mode: 'deterministic' }
 * 2. Full (deterministic + agentic): { migratedUrl, mode: 'full' } (default)
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeStructure, compareStructure, analyzeStructureWithClaude } from '@/lib/agents/structure';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Structure Agent API is ready (deterministic + agentic)',
    version: '2.0.0',
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { migratedUrl, expectedUrl, mode = 'full' } = body;

    // Validate required fields
    if (!migratedUrl) {
      return NextResponse.json(
        { error: 'migratedUrl is required' },
        { status: 400 }
      );
    }

    // Analyze migrated page structure (deterministic)
    const migratedStructure = await analyzeStructure(migratedUrl);

    // Deterministic-only mode (for testing)
    if (mode === 'deterministic') {
      let comparison = null;
      if (expectedUrl) {
        const expectedStructure = await analyzeStructure(expectedUrl);
        comparison = compareStructure(expectedStructure, migratedStructure);
      }

      return NextResponse.json({
        mode: 'deterministic',
        migratedUrl,
        expectedUrl: expectedUrl || null,
        structure: migratedStructure,
        comparison,
        timestamp: new Date().toISOString(),
      });
    }

    // Full mode: deterministic + agentic (default)
    const fullAnalysis = await analyzeStructureWithClaude(migratedUrl, migratedStructure);

    return NextResponse.json({
      mode: 'full',
      ...fullAnalysis,
    });
  } catch (error) {
    console.error('Structure analysis error:', error);

    return NextResponse.json(
      {
        error: 'Structure analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
