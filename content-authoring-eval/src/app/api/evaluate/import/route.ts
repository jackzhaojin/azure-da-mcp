/**
 * PHASE 26: Import Batch JSON API Route
 *
 * POST /api/evaluate/import
 * Validates and stores imported batch JSON for evaluation
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { safeValidateBatchInput } from '@/lib/validation/batch-schema';

const logger = createLogger('api');

/**
 * POST /api/evaluate/import
 * Validate imported batch JSON
 */
export async function POST(request: NextRequest) {
  logger.requestStart('POST', '/api/evaluate/import');

  try {
    // Parse request body
    const body = await request.json();

    // Validate using Zod schema
    const validation = safeValidateBatchInput(body);

    if (!validation.success) {
      logger.warn('Batch validation failed', {
        errors: validation.error.issues,
      });

      return NextResponse.json(
        {
          success: false,
          error: 'Invalid batch format',
          details: validation.error.issues.map((err) => ({
            path: err.path.map(String).join('.'),
            message: err.message,
          })),
        },
        { status: 400 }
      );
    }

    const batchData = validation.data;

    logger.info('Batch validation successful', {
      batchId: batchData.batchId,
      pageCount: batchData.pages.length,
    });

    // In Phase 26, we just validate and return
    // In Phase 27-28, this would store the batch for processing
    return NextResponse.json({
      success: true,
      batchId: batchData.batchId,
      pageCount: batchData.pages.length,
      message: 'Batch validated successfully. Ready for evaluation.',
    });
  } catch (error) {
    logger.error('Import failed', error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Import failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/evaluate/import
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/evaluate/import',
    method: 'POST',
    description: 'Validate and import batch evaluation JSON',
    usage: {
      request: {
        batchId: 'migration-2025-01-15',
        pages: [
          {
            id: 'page-001',
            title: 'Homepage',
            pdfUrl: 'https://example.com/pdf/homepage.pdf',
            webUrl: 'https://www.example.com/',
          },
        ],
      },
      response: {
        success: true,
        batchId: 'migration-2025-01-15',
        pageCount: 1,
        message: 'Batch validated successfully',
      },
    },
  });
}
