/**
 * PHASE 27: Test endpoint to create mock batch results
 * FOR TESTING ONLY - Remove in production
 */

import { NextRequest, NextResponse } from 'next/server';
import { storeMockBatchResults } from '@/lib/test-batch-results';
import { createLogger } from '@/lib/logger';

const logger = createLogger('api');

/**
 * POST /api/test/mock-results
 * Create mock batch results for testing export
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, pageCount = 5 } = body;

    if (!batchId) {
      return NextResponse.json(
        { success: false, error: 'batchId is required' },
        { status: 400 }
      );
    }

    storeMockBatchResults(batchId, pageCount);

    logger.info('Mock results created', { batchId, pageCount });

    return NextResponse.json({
      success: true,
      message: `Mock results created for batch ${batchId} with ${pageCount} pages`,
      batchId,
      pageCount,
    });
  } catch (error) {
    logger.error('Failed to create mock results', error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create mock results',
      },
      { status: 500 }
    );
  }
}
