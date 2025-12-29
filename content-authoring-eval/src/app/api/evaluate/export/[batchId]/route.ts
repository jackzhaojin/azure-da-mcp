/**
 * PHASE 27: Export Batch Results API Route
 *
 * GET /api/evaluate/export/:batchId
 * Download batch evaluation results as JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { batchStorage } from '@/lib/batch-storage';

const logger = createLogger('api');

interface RouteParams {
  params: Promise<{
    batchId: string;
  }>;
}

/**
 * GET /api/evaluate/export/:batchId
 * Export batch evaluation results
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { batchId } = await params;
  logger.requestStart('GET', `/api/evaluate/export/${batchId}`);

  try {
    // Phase 27: Retrieve batch results from storage
    const results = batchStorage.getResults(batchId);

    if (!results) {
      logger.warn('Batch results not found', { batchId });

      return NextResponse.json(
        {
          success: false,
          error: 'Batch results not found',
          message: `No results found for batch ID: ${batchId}. The batch may not exist or evaluation may not be complete.`,
          batchId,
        },
        { status: 404 }
      );
    }

    logger.info('Batch results retrieved successfully', {
      batchId,
      totalPages: results.totalPages,
    });

    // Return results with Content-Disposition header for download
    const filename = `batch-${batchId}-results.json`;
    const response = NextResponse.json(results, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/json',
      },
    });

    return response;
  } catch (error) {
    logger.error('Export failed', error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Export failed',
      },
      { status: 500 }
    );
  }
}
