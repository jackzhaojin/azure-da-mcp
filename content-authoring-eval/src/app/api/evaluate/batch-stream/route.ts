/**
 * PHASE 28: Batch Evaluation with SSE Streaming API Route
 *
 * POST /api/evaluate/batch-stream?batchId={batchId}
 * Start batch evaluation with Server-Sent Events (SSE) for real-time progress
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { batchStorage } from '@/lib/batch-storage';
import { runEvaluation } from '@/lib/evaluator';
import {
  BatchEvaluationEvent,
  BatchEvaluationOutput,
  BatchPageResult,
  DimensionResult,
  AgentResult,
} from '@/types/evaluation';

const logger = createLogger('api');

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

        // Run evaluation for this page
        const evaluationRequest = {
          pdfPath: page.pdfUrl,
          migratedUrl: page.webUrl,
        };

        const report = await runEvaluation(evaluationRequest, (progressEvent) => {
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
        logger.error('Page evaluation failed', error instanceof Error ? error : new Error(String(error)), {
          batchId,
          pageId: page.id,
        });

        // Emit page:error event
        const errorEvent: BatchEvaluationEvent = {
          type: 'page:error',
          batchId,
          pageId: page.id,
          error: error instanceof Error ? error.message : 'Evaluation failed',
          timestamp: new Date().toISOString(),
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
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
 * GET /api/evaluate/batch-stream
 * Health check endpoint
 */
export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      endpoint: '/api/evaluate/batch-stream',
      method: 'POST',
      description: 'Start batch evaluation with SSE streaming for real-time progress',
      usage: {
        request: {
          method: 'POST',
          url: '/api/evaluate/batch-stream?batchId={batchId}',
          note: 'Batch must be imported first via /api/evaluate/import',
        },
        response: {
          streamFormat: 'text/event-stream',
          events: [
            'page:queued',
            'page:started',
            'dimension:started',
            'dimension:completed',
            'page:completed',
            'page:error',
            'batch:completed',
          ],
        },
      },
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
