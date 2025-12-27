import { NextRequest, NextResponse } from 'next/server';
import { EvaluationRequest, EvaluationReport, Finding } from '@/types/evaluation';
import { SYSTEM_VERSION } from '@/lib/constants';
import { analyzeStructure, analyzeStructureWithClaude, StructureMetrics } from '@/lib/agents/structure';

/**
 * Calculate deterministic-only score from structure metrics
 */
function calculateDeterministicScore(metrics: StructureMetrics): number {
  let score = 100;

  // Deduct points for missing meta tags
  if (!metrics.metaTags.title) score -= 5;
  if (!metrics.metaTags.description) score -= 5;
  if (!metrics.metaTags.viewport) score -= 3;

  // Deduct points for heading issues
  if (metrics.headingHierarchy.h1Count === 0) score -= 10;
  if (metrics.headingHierarchy.h1Count > 1) score -= 5;
  if (!metrics.headingHierarchy.hasProperNesting) score -= 8;

  // Deduct points for missing semantic elements
  if (!metrics.documentStructure.hasMain) score -= 10;
  if (!metrics.documentStructure.hasHeader) score -= 5;
  if (!metrics.documentStructure.hasNav) score -= 3;

  return Math.max(0, score);
}

/**
 * Map score to grade
 */
function getGradeFromScore(score: number): 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical' {
  if (score >= 90) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'acceptable';
  if (score >= 30) return 'needs-improvement';
  return 'critical';
}

/**
 * POST /api/evaluate
 *
 * Main evaluation endpoint
 * Currently calls Structure Agent only (Phases 4-5)
 * Will orchestrate all 4 agents in Phase 12
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body: EvaluationRequest = await request.json();

    // Validate request
    if (!body.migratedUrl) {
      return NextResponse.json(
        { error: 'migratedUrl is required' },
        { status: 400 }
      );
    }

    // Call Structure Agent (Phases 4-5)
    const agentStartTime = Date.now();

    // Step 1: Get deterministic metrics
    const migratedStructure = await analyzeStructure(body.migratedUrl);
    const deterministicDuration = Date.now() - agentStartTime;

    // Step 2: Try agentic analysis, fallback to deterministic-only if no API key
    let finalScore: number;
    let grade: 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical';
    let findings: Finding[] = [];
    let agenticMetadata: { executedAt: string; durationMs: number; model: string } | undefined = undefined;

    try {
      const agenticStartTime = Date.now();
      const structureResult = await analyzeStructureWithClaude(
        body.migratedUrl,
        migratedStructure
      );
      const agenticDuration = Date.now() - agenticStartTime;

      finalScore = structureResult.finalScore;
      grade = structureResult.grade;
      findings = structureResult.agentic.findings;
      agenticMetadata = {
        executedAt: structureResult.timestamp,
        durationMs: agenticDuration,
        model: 'claude-sonnet-4-5-20250929',
      };
    } catch (error) {
      // Fallback to deterministic-only scoring if API key missing
      console.warn('Agentic analysis failed, using deterministic-only mode:', error instanceof Error ? error.message : 'Unknown error');

      // Calculate deterministic score (simplified)
      const deterministicScore = calculateDeterministicScore(migratedStructure);
      finalScore = deterministicScore;
      grade = getGradeFromScore(deterministicScore);
      findings = [];
    }

    // Calculate overall score (only structure for now)
    const overallScore = finalScore;
    const passedDimensions = finalScore >= 70 ? 1 : 0;

    // Build evaluation report
    const report: EvaluationReport = {
      id: `eval-${Date.now()}`,
      request: body,
      summary: {
        overallScore,
        grade,
        passedDimensions,
        totalDimensions: 4,
      },
      results: {
        structure: {
          dimension: 'structure',
          score: finalScore,
          findings,
          metadata: {
            deterministic: {
              executedAt: new Date().toISOString(),
              durationMs: deterministicDuration,
              toolsUsed: ['cheerio'],
            },
            agentic: agenticMetadata,
          },
        },
        // Placeholders for Phase 6-11
        accessibility: {
          dimension: 'accessibility',
          score: 0,
          findings: [],
          metadata: {
            deterministic: {
              executedAt: new Date().toISOString(),
              durationMs: 0,
              toolsUsed: [],
            },
          },
        },
        content: {
          dimension: 'content',
          score: 0,
          findings: [],
          metadata: {
            deterministic: {
              executedAt: new Date().toISOString(),
              durationMs: 0,
              toolsUsed: [],
            },
          },
        },
        visual: {
          dimension: 'visual',
          score: 0,
          findings: [],
          metadata: {
            deterministic: {
              executedAt: new Date().toISOString(),
              durationMs: 0,
              toolsUsed: [],
            },
          },
        },
      },
      findings,
      metadata: {
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        version: SYSTEM_VERSION,
      },
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error('Error in /api/evaluate:', error);
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
  return NextResponse.json({
    status: 'ok',
    version: SYSTEM_VERSION,
    message: 'Evaluation API is ready (placeholder)',
  });
}
