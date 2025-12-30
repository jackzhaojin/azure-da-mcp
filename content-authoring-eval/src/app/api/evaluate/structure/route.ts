/**
 * Structure Evaluation API Route
 * POST /api/evaluate/structure
 *
 * Supports two modes:
 * 1. Deterministic-only: { migratedUrl, mode: 'deterministic' }
 * 2. Full (deterministic + agentic): { migratedUrl, mode: 'full' } (default)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeStructure,
  compareStructure,
  analyzeStructureWithClaude,
  fetchAndExtractPDFStructure,
  comparePDFToHTML,
} from '@/lib/agents/structure';
import type { StructureSourceType } from '@/lib/agents/structure';
import { createLogger, Timer } from '@/lib/logger';

const logger = createLogger('api');

export async function GET() {
  logger.debug('Structure agent health check');
  return NextResponse.json({
    status: 'ok',
    message: 'Structure Agent API is ready (deterministic + agentic)',
    version: '2.0.0',
  });
}

export async function POST(request: NextRequest) {
  const timer = new Timer();
  logger.requestStart('POST', '/api/evaluate/structure');

  try {
    const body = await request.json();
    const { migratedUrl, expectedUrl, sourceUrl, pdfUrl, mode = 'full' } = body;

    logger.debug('Structure analysis request', { migratedUrl, expectedUrl, sourceUrl, pdfUrl, mode });

    // Validate required fields
    if (!migratedUrl) {
      logger.warn('Validation failed: migratedUrl is required');
      return NextResponse.json(
        { error: 'migratedUrl is required' },
        { status: 400 }
      );
    }

    // Analyze migrated page structure (deterministic)
    logger.info('Running deterministic structure analysis', { url: migratedUrl });
    const migratedStructure = await analyzeStructure(migratedUrl);
    logger.operationComplete('Deterministic analysis', timer.elapsed(), {
      h1Count: migratedStructure.headingHierarchy.h1Count,
      hasMain: migratedStructure.documentStructure.hasMain,
    });

    // Phase 36: Determine source type and run source comparison
    let sourceComparison = null;
    let sourceType: StructureSourceType = 'none';

    if (sourceUrl) {
      // HTML source comparison
      sourceType = 'html';
      logger.info('Running HTML source comparison', { sourceUrl });
      const sourceStructure = await analyzeStructure(sourceUrl);
      sourceComparison = compareStructure(sourceStructure, migratedStructure);
      logger.operationComplete('HTML source comparison', timer.elapsed(), {
        score: sourceComparison.score,
      });
    } else if (pdfUrl) {
      // PDF source comparison
      sourceType = 'pdf';
      logger.info('Running PDF source comparison', { pdfUrl });
      const pdfStructure = await fetchAndExtractPDFStructure(pdfUrl);
      sourceComparison = comparePDFToHTML(pdfStructure, migratedStructure);
      logger.operationComplete('PDF source comparison', timer.elapsed(), {
        score: sourceComparison.score,
      });
    }

    // Deterministic-only mode (for testing)
    if (mode === 'deterministic') {
      let comparison = null;
      if (expectedUrl) {
        logger.info('Running comparison analysis', { expectedUrl });
        const expectedStructure = await analyzeStructure(expectedUrl);
        comparison = compareStructure(expectedStructure, migratedStructure);
        logger.info('Comparison complete', { similarityScore: comparison.score });
      }

      logger.requestComplete('POST', '/api/evaluate/structure', 200, timer.elapsed());
      return NextResponse.json({
        mode: 'deterministic',
        migratedUrl,
        expectedUrl: expectedUrl || null,
        sourceType,
        sourceComparison,
        structure: migratedStructure,
        comparison,
        timestamp: new Date().toISOString(),
      });
    }

    // Full mode: deterministic + agentic (default)
    logger.info('Running full analysis (deterministic + agentic)');
    const fullAnalysis = await analyzeStructureWithClaude(migratedUrl, migratedStructure);
    logger.operationComplete('Full structure analysis', timer.elapsed(), {
      finalScore: fullAnalysis.finalScore,
      grade: fullAnalysis.grade,
    });

    logger.requestComplete('POST', '/api/evaluate/structure', 200, timer.elapsed());
    return NextResponse.json({
      mode: 'full',
      sourceType,
      sourceComparison,
      ...fullAnalysis,
    });
  } catch (error) {
    logger.error('Structure analysis failed', error instanceof Error ? error : new Error(String(error)), {
      duration: timer.elapsed(),
    });

    return NextResponse.json(
      {
        error: 'Structure analysis failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
