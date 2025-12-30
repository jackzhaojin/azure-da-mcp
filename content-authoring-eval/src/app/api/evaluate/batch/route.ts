/**
 * Batch Evaluation API Route
 *
 * Handles batch processing of multiple evaluations.
 * Processes evaluations sequentially with progress tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger, Timer } from '@/lib/logger';
import { runEvaluation } from '@/lib/evaluator';
import { EvaluationRequest, EvaluationReport, Severity } from '@/types/evaluation';

const logger = createLogger('api');

/**
 * Batch request containing multiple evaluation requests
 */
interface BatchEvaluationRequest {
  evaluations: EvaluationRequest[];
}

/**
 * Batch result containing individual reports and summary
 */
interface BatchEvaluationResult {
  batchId: string;
  totalEvaluations: number;
  completedEvaluations: number;
  failedEvaluations: number;
  reports: EvaluationReport[];
  summary: {
    averageScore: number;
    passedCount: number;
    failedCount: number;
    totalFindings: number;
    commonIssues: Array<{
      issue: string;
      count: number;
      severity: Severity;
    }>;
  };
  metadata: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
  };
}

/**
 * GET /api/evaluate/batch
 * Health check endpoint
 */
export async function GET() {
  logger.info('Batch API health check');

  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/evaluate/batch',
    method: 'POST',
    description: 'Batch evaluation endpoint for processing multiple URLs sequentially',
    usage: {
      request: {
        evaluations: [
          { migratedUrl: 'https://example.com/page1', pdfPath: 'https://example.com/pdf1.pdf' },
          { migratedUrl: 'https://example.com/page2', pdfPath: 'https://example.com/pdf2.pdf' },
        ],
      },
      response: {
        batchId: 'batch-1234567890',
        reports: ['Array of EvaluationReport objects'],
        summary: 'Aggregate statistics',
      },
    },
  });
}

/**
 * POST /api/evaluate/batch
 * Run batch evaluation
 */
export async function POST(request: NextRequest) {
  const timer = new Timer();
  logger.requestStart('POST', '/api/evaluate/batch');

  try {
    // Parse request body
    const body = (await request.json()) as BatchEvaluationRequest;

    if (!body.evaluations || !Array.isArray(body.evaluations)) {
      logger.warn('Invalid batch request: evaluations array is required');
      return NextResponse.json(
        { error: 'Request must include evaluations array' },
        { status: 400 }
      );
    }

    if (body.evaluations.length === 0) {
      logger.warn('Invalid batch request: evaluations array is empty');
      return NextResponse.json({ error: 'Evaluations array cannot be empty' }, { status: 400 });
    }

    if (body.evaluations.length > 50) {
      logger.warn('Invalid batch request: too many evaluations', {
        count: body.evaluations.length,
        max: 50,
      });
      return NextResponse.json(
        { error: 'Maximum 50 evaluations per batch allowed' },
        { status: 400 }
      );
    }

    const batchId = `batch-${Date.now()}`;
    const startTime = new Date().toISOString();

    logger.info('Starting batch evaluation', {
      batchId,
      totalEvaluations: body.evaluations.length,
    });

    // Process evaluations sequentially
    const reports: EvaluationReport[] = [];
    let completedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < body.evaluations.length; i++) {
      const evalRequest = body.evaluations[i];
      const evalTimer = new Timer();

      logger.info(`Processing evaluation ${i + 1}/${body.evaluations.length}`, {
        url: evalRequest.migratedUrl,
      });

      try {
        // Validate request
        if (!evalRequest.migratedUrl) {
          throw new Error('migratedUrl is required');
        }

        // Run evaluation
        const report = await runEvaluation(evalRequest);
        reports.push(report);
        completedCount++;

        logger.operationComplete(
          `Evaluation ${i + 1}/${body.evaluations.length}`,
          evalTimer.elapsed(),
          {
            url: evalRequest.migratedUrl,
            score: report.summary.overallScore,
            grade: report.summary.grade,
          }
        );
      } catch (error) {
        failedCount++;
        logger.error(`Evaluation ${i + 1} failed`, error instanceof Error ? error : new Error(String(error)), {
          url: evalRequest.migratedUrl,
          duration: evalTimer.elapsed(),
        });

        // Create error report
        const errorReport: EvaluationReport = {
          id: `eval-error-${Date.now()}-${i}`,
          type: 'single', // PHASE 32: Discriminator for unified storage
          request: evalRequest,
          summary: {
            overallScore: 0,
            grade: 'critical',
            passedDimensions: 0,
            totalDimensions: 4,
          },
          results: {
            structure: {
              dimension: 'structure',
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
          findings: [
            {
              dimension: 'structure',
              severity: 'critical',
              issue: 'Evaluation failed',
              recommendation: error instanceof Error ? error.message : 'Unknown error',
              details: {},
            },
          ],
          metadata: {
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: evalTimer.elapsed(),
            version: '1.0.0',
          },
        };

        reports.push(errorReport);
      }
    }

    // Generate batch summary
    const averageScore =
      reports.reduce((sum, r) => sum + r.summary.overallScore, 0) / reports.length;
    const passedCount = reports.filter((r) => r.summary.grade !== 'critical').length;
    const totalFindings = reports.reduce((sum, r) => sum + r.findings.length, 0);

    // Find common issues (issues appearing in multiple reports)
    const issueMap = new Map<string, { count: number; severity: Severity }>();

    reports.forEach((report) => {
      report.findings.forEach((finding) => {
        const key = finding.issue;
        const existing = issueMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          issueMap.set(key, { count: 1, severity: finding.severity });
        }
      });
    });

    const commonIssues = Array.from(issueMap.entries())
      .filter(([, data]) => data.count > 1) // Only issues appearing in multiple reports
      .map(([issue, data]) => ({
        issue,
        count: data.count,
        severity: data.severity,
      }))
      .sort((a, b) => b.count - a.count) // Sort by frequency
      .slice(0, 10); // Top 10 common issues

    const completedAt = new Date().toISOString();
    const durationMs = timer.elapsed();

    const result: BatchEvaluationResult = {
      batchId,
      totalEvaluations: body.evaluations.length,
      completedEvaluations: completedCount,
      failedEvaluations: failedCount,
      reports,
      summary: {
        averageScore: Math.round(averageScore),
        passedCount,
        failedCount: reports.length - passedCount,
        totalFindings,
        commonIssues,
      },
      metadata: {
        startedAt: startTime,
        completedAt,
        durationMs,
      },
    };

    logger.info('Batch evaluation complete', {
      batchId,
      totalEvaluations: body.evaluations.length,
      completed: completedCount,
      failed: failedCount,
      averageScore: result.summary.averageScore,
      totalFindings,
      duration: durationMs,
    });

    logger.requestComplete('POST', '/api/evaluate/batch', 200, durationMs);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Batch evaluation failed', error instanceof Error ? error : new Error(String(error)), { duration: timer.elapsed() });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Batch evaluation failed',
      },
      { status: 500 }
    );
  }
}
