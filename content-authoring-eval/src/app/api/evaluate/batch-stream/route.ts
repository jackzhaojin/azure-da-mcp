/**
 * PHASE 28-30: Batch Evaluation with SSE Streaming API Route
 *
 * GET /api/evaluate/batch-stream?batchId={batchId}
 * Start batch evaluation with Server-Sent Events (SSE) for real-time progress
 *
 * NOTE: EventSource API (used by client) only supports GET requests, so we use GET instead of POST
 *
 * PHASE 30 Enhancements:
 * - Timeout detection (5 min per page max)
 * - Retry logic with exponential backoff (3 attempts)
 * - Graceful error handling for invalid URLs
 * - Network interruption recovery
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { batchStorage } from '@/lib/batch-storage';
import { runEvaluation, ProgressCallback } from '@/lib/evaluator';
import {
  BatchEvaluationEvent,
  BatchEvaluationOutput,
  BatchPageResult,
  DimensionResult,
  AgentResult,
  EvaluationReport,
} from '@/types/evaluation';

const logger = createLogger('api');

/**
 * Configuration constants for edge case handling
 */
const PAGE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max per page
const MAX_RETRIES = 3; // Retry failed pages up to 3 times
const RETRY_DELAY_MS = 2000; // Initial retry delay (exponential backoff)

/**
 * Convert score to grade
 */
function scoreToGrade(score: number): 'Excellent' | 'Good' | 'Acceptable' | 'Needs Improvement' | 'Critical' {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Acceptable';
  if (score >= 40) return 'Needs Improvement';
  return 'Critical';
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run evaluation with timeout
 */
async function runEvaluationWithTimeout(
  request: { pdfPath?: string; expectedUrl?: string; migratedUrl: string },
  onProgress: ProgressCallback,
  timeoutMs: number
): Promise<EvaluationReport> {
  return Promise.race([
    runEvaluation(request, onProgress),
    new Promise<EvaluationReport>((_, reject) =>
      setTimeout(() => reject(new Error(`Page evaluation timeout after ${timeoutMs / 1000}s`)), timeoutMs)
    ),
  ]);
}

/**
 * Run evaluation with retry logic and exponential backoff
 */
async function runEvaluationWithRetry(
  request: { pdfPath?: string; expectedUrl?: string; migratedUrl: string },
  onProgress: ProgressCallback,
  maxRetries: number = MAX_RETRIES
): Promise<EvaluationReport> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info('Attempting evaluation', { attempt, maxRetries, url: request.migratedUrl });

      // Run with timeout
      const result = await runEvaluationWithTimeout(request, onProgress, PAGE_TIMEOUT_MS);

      logger.info('Evaluation successful', { attempt, url: request.migratedUrl });
      return result;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn('Evaluation attempt failed', {
        attempt,
        maxRetries,
        error: lastError.message,
        url: request.migratedUrl,
      });

      // If not the last attempt, wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delayMs = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
        logger.info('Retrying after delay', { delayMs, attempt: attempt + 1 });
        await sleep(delayMs);
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Evaluation failed after all retries');
}

/**
 * Process batch evaluation with SSE streaming
 */
async function processBatchWithStreaming(
  batchId: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder
) {
  try {
    // Get batch data from storage
    const batch = batchStorage.getBatch(batchId);
    if (!batch) {
      throw new Error('Batch not found in storage');
    }

    const startedAt = new Date().toISOString();
    const results: BatchPageResult[] = [];

    logger.info('Starting batch evaluation', {
      batchId,
      pageCount: batch.pages.length,
    });

    // Process pages sequentially (could be parallelized with concurrency limit)
    for (const page of batch.pages) {
      try {
        // Emit page:queued event
        const queuedEvent: BatchEvaluationEvent = {
          type: 'page:queued',
          batchId,
          pageId: page.id,
          timestamp: new Date().toISOString(),
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(queuedEvent)}\n\n`));

        // Emit page:started event
        const startedEvent: BatchEvaluationEvent = {
          type: 'page:started',
          batchId,
          pageId: page.id,
          timestamp: new Date().toISOString(),
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(startedEvent)}\n\n`));

        // Run evaluation for this page with retry and timeout
        const evaluationRequest = {
          pdfPath: page.sourceType === 'pdf' ? page.sourceUrl : undefined,
          expectedUrl: page.sourceType === 'html' ? page.sourceUrl : undefined,
          migratedUrl: page.webUrl,
        };

        const report = await runEvaluationWithRetry(evaluationRequest, (progressEvent) => {
          // Emit dimension events
          if (progressEvent.type === 'agent-start' && progressEvent.dimension) {
            const event: BatchEvaluationEvent = {
              type: 'dimension:started',
              batchId,
              pageId: page.id,
              dimension: progressEvent.dimension,
              status: 'running',
              timestamp: new Date().toISOString(),
            };
            writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => {
              // Ignore write errors (client disconnected)
            });
          } else if (progressEvent.type === 'agent-complete' && progressEvent.dimension && progressEvent.result) {
            const event: BatchEvaluationEvent = {
              type: 'dimension:completed',
              batchId,
              pageId: page.id,
              dimension: progressEvent.dimension,
              status: 'completed',
              score: progressEvent.result.score,
              findings: progressEvent.result.findings,
              timestamp: new Date().toISOString(),
            };
            writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)).catch(() => {
              // Ignore write errors (client disconnected)
            });
          }
        });

        // Build dimension results
        const dimensions: BatchPageResult['dimensions'] = {
          structure: buildDimensionResult(report.results.structure),
          accessibility: buildDimensionResult(report.results.accessibility),
          content: buildDimensionResult(report.results.content),
          visual: buildDimensionResult(report.results.visual),
        };

        // Create page result
        const pageResult: BatchPageResult = {
          pageId: page.id,
          title: page.title,
          overallScore: report.summary.overallScore,
          overallGrade: scoreToGrade(report.summary.overallScore),
          dimensions,
          evaluatedAt: report.metadata.completedAt,
        };

        results.push(pageResult);

        // Emit page:completed event
        const completedEvent: BatchEvaluationEvent = {
          type: 'page:completed',
          batchId,
          pageId: page.id,
          score: pageResult.overallScore,
          timestamp: new Date().toISOString(),
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(completedEvent)}\n\n`));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Evaluation failed';
        const isTimeout = errorMessage.includes('timeout');
        const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ENOTFOUND');
        const isInvalidUrl = errorMessage.includes('404') || errorMessage.includes('Invalid URL');

        logger.error('Page evaluation failed after retries', error instanceof Error ? error : new Error(String(error)), {
          batchId,
          pageId: page.id,
          isTimeout,
          isNetworkError,
          isInvalidUrl,
        });

        // Provide user-friendly error message
        let friendlyError = errorMessage;
        if (isTimeout) {
          friendlyError = `Evaluation timeout - Page took longer than ${PAGE_TIMEOUT_MS / 1000}s to evaluate. This may indicate an invalid URL or extremely large page.`;
        } else if (isInvalidUrl) {
          friendlyError = `Invalid URL - The PDF or web URL returned a 404 or could not be accessed. Please verify the URLs are correct.`;
        } else if (isNetworkError) {
          friendlyError = `Network error - Failed to reach the URL after ${MAX_RETRIES} attempts. Check your internet connection or verify the URL is accessible.`;
        }

        // Emit page:error event
        const errorEvent: BatchEvaluationEvent = {
          type: 'page:error',
          batchId,
          pageId: page.id,
          error: friendlyError,
          timestamp: new Date().toISOString(),
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));

        // Continue with next page (don't let one failure stop the batch)
        logger.info('Continuing to next page after error', { batchId, pageId: page.id });
      }
    }

    // Create final output
    const output: BatchEvaluationOutput = {
      batchId,
      startedAt,
      completedAt: new Date().toISOString(),
      totalPages: batch.pages.length,
      results,
    };

    // Store results
    batchStorage.storeResults(batchId, output);

    // Emit batch:completed event
    const batchCompletedEvent: BatchEvaluationEvent = {
      type: 'batch:completed',
      batchId,
      pageId: '', // Not relevant for batch event
      timestamp: new Date().toISOString(),
    };
    await writer.write(encoder.encode(`data: ${JSON.stringify(batchCompletedEvent)}\n\n`));

    logger.info('Batch evaluation complete', {
      batchId,
      successCount: results.length,
    });

  } catch (error) {
    logger.error('Batch streaming failed', error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    await writer.close();
  }
}

/**
 * Build dimension result from agent result
 */
function buildDimensionResult(agentResult: AgentResult | undefined): DimensionResult {
  if (!agentResult) {
    return {
      score: 0,
      grade: 'Critical',
      findings: [],
    };
  }

  return {
    score: agentResult.score,
    grade: scoreToGrade(agentResult.score),
    findings: agentResult.findings,
  };
}

/**
 * POST /api/evaluate/batch-stream?batchId={batchId}
 * Start batch evaluation with SSE streaming
 */
export async function POST(request: NextRequest) {
  logger.requestStart('POST', '/api/evaluate/batch-stream');

  try {
    // Get batchId from query params
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing batchId query parameter',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if batch exists
    if (!batchStorage.hasBatch(batchId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Batch not found',
          message: `Batch with ID "${batchId}" not found. Please import a batch first.`,
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Starting SSE batch evaluation', { batchId });

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start processing in background
    processBatchWithStreaming(batchId, writer, encoder).catch((error) => {
      logger.error('Batch streaming failed', error instanceof Error ? error : new Error(String(error)));
    });

    // Return SSE response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    logger.error('Batch stream failed', error instanceof Error ? error : new Error(String(error)));

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Batch stream failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/evaluate/batch-stream?batchId={batchId}
 * Start batch evaluation with SSE streaming (EventSource only supports GET)
 */
export async function GET(request: NextRequest) {
  logger.requestStart('GET', '/api/evaluate/batch-stream');

  try {
    // Get batchId from query params
    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing batchId query parameter',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if batch exists
    if (!batchStorage.hasBatch(batchId)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Batch not found',
          message: `Batch with ID "${batchId}" not found. Please import a batch first.`,
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.info('Starting SSE batch evaluation', { batchId });

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start processing in background
    processBatchWithStreaming(batchId, writer, encoder).catch((error) => {
      logger.error('Batch streaming failed', error instanceof Error ? error : new Error(String(error)));
    });

    // Return SSE response
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    logger.error('Batch stream failed', error instanceof Error ? error : new Error(String(error)));

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Batch stream failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
