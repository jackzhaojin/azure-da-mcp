import { NextRequest } from 'next/server';
import { EvaluationRequest } from '@/types/evaluation';
import { runEvaluation, ProgressCallback } from '@/lib/evaluator';
import { createLogger, Timer } from '@/lib/logger';

const logger = createLogger('api');

/**
 * POST /api/evaluate/stream
 *
 * Server-Sent Events (SSE) streaming endpoint for real-time evaluation progress
 *
 * Event types:
 * - agent-start: Agent begins execution
 * - agent-complete: Agent finishes with result
 * - evaluation-complete: All agents finished, final report ready
 * - error: Error occurred during evaluation
 */
export async function POST(request: NextRequest) {
  const timer = new Timer();
  logger.requestStart('POST', '/api/evaluate/stream');

  try {
    const body: EvaluationRequest = await request.json();
    logger.debug('SSE stream request parsed', {
      url: body.migratedUrl,
      hasPdf: !!body.pdfPath,
    });

    // Validate request
    if (!body.migratedUrl) {
      logger.warn('Validation failed: migratedUrl is required');
      return new Response(
        JSON.stringify({ error: 'migratedUrl is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Validate URL format
    try {
      new URL(body.migratedUrl);
    } catch {
      logger.warn('Validation failed: Invalid migratedUrl format');
      return new Response(
        JSON.stringify({ error: 'migratedUrl must be a valid URL' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Progress callback sends SSE events
        const onProgress: ProgressCallback = (event) => {
          const sseEvent = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseEvent));
          logger.debug('SSE event sent', { type: event.type, dimension: event.dimension });
        };

        try {
          logger.info('Starting SSE evaluation stream', {
            url: body.migratedUrl,
            agents: 4,
          });

          // Run evaluation with progress callbacks
          await runEvaluation(body, onProgress);

          logger.info('SSE stream complete', {
            totalDuration: timer.elapsed(),
          });
        } catch (error) {
          logger.error(
            'SSE stream error',
            error instanceof Error ? error : new Error(String(error)),
            { duration: timer.elapsed() }
          );

          // Send error event
          const errorEvent = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          const sseEvent = `data: ${JSON.stringify(errorEvent)}\n\n`;
          controller.enqueue(encoder.encode(sseEvent));
        } finally {
          controller.close();
          logger.requestComplete('POST', '/api/evaluate/stream', 200, timer.elapsed());
        }
      },
    });

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    logger.error(
      'SSE stream initialization failed',
      error instanceof Error ? error : new Error(String(error)),
      { duration: timer.elapsed() }
    );

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/evaluate/stream
 *
 * Health check for SSE endpoint
 */
export async function GET() {
  logger.debug('SSE health check requested');
  return new Response(
    JSON.stringify({
      status: 'ok',
      endpoint: '/api/evaluate/stream',
      method: 'POST',
      description: 'Server-Sent Events streaming for real-time evaluation progress',
      eventTypes: [
        'agent-start',
        'agent-complete',
        'evaluation-complete',
        'error',
      ],
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
