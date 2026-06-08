/**
 * Evaluation Orchestrator
 *
 * Orchestrates all 4 agents (structure, accessibility, content, visual) in parallel
 * using Promise.all and aggregates results into a complete EvaluationReport.
 */

import { EvaluationRequest, EvaluationReport, Finding, AgentResult } from '@/types/evaluation';
import { analyzeStructureWithClaude, analyzeStructure } from '@/lib/agents/structure';
import { analyzeAccessibilityWithClaude, analyzeAccessibility } from '@/lib/agents/accessibility';
import { analyzeContentWithClaude, analyzeContent } from '@/lib/agents/content';
import { analyzeVisualWithClaude, analyzeVisual } from '@/lib/agents/visual';
import { SYSTEM_VERSION, DIMENSION_WEIGHTS } from '@/lib/constants';
import { createLogger, Timer } from '@/lib/logger';
import { withBrowserPermit } from '../browser/semaphore'; // browser semaphore (PRD part-2) — added during extraction

const logger = createLogger('agent');

/**
 * Progress callback for SSE streaming
 */
export type ProgressCallback = (event: {
  type: 'agent-start' | 'agent-complete' | 'evaluation-complete' | 'error';
  dimension?: 'structure' | 'accessibility' | 'content' | 'visual';
  progress?: number; // 0-100
  result?: AgentResult;
  report?: EvaluationReport;
  error?: string;
}) => void;

/**
 * Individual agent result with execution metadata
 */
interface AgentExecutionResult {
  dimension: 'structure' | 'accessibility' | 'content' | 'visual';
  result: AgentResult | null;
  error: Error | null;
  duration: number;
}

/**
 * Run a single agent with error handling and progress reporting
 */
async function runAgent(
  dimension: 'structure' | 'accessibility' | 'content' | 'visual',
  request: EvaluationRequest,
  onProgress?: ProgressCallback,
  completedCountRef?: { value: number }
): Promise<AgentExecutionResult> {
  const timer = new Timer();
  logger.info(`Starting ${dimension} agent`, { dimension });

  if (onProgress) {
    onProgress({ type: 'agent-start', dimension });
  }

  try {
    let result: AgentResult;

    switch (dimension) {
      case 'structure': {
        // Always run deterministic analysis first
        const deterministic = await analyzeStructure(request.migratedUrl);

        // Try agentic if OAuth token available
        try {
          const fullResult = await withBrowserPermit(() => analyzeStructureWithClaude(request.migratedUrl, deterministic));

          // Combine findings and strengths
          const combinedFindings = [
            ...fullResult.agentic.findings,
            // Add strengths as positive findings
            ...(fullResult.agentic.strengths || []).map(strength => ({
              dimension: 'structure' as const,
              severity: 'info' as const,
              issue: `✨ ${strength}`,
              recommendation: 'This is a positive aspect - maintain this quality',
            })),
          ];

          result = {
            dimension: 'structure',
            score: fullResult.finalScore,
            findings: combinedFindings,
            metadata: {
              deterministic: {
                executedAt: fullResult.timestamp,
                durationMs: timer.elapsed(),
                toolsUsed: ['cheerio'],
              },
              agentic: {
                executedAt: fullResult.timestamp,
                durationMs: 0, // Included in total
                model: 'claude-sonnet-4-6',
              },
            },
          };
        } catch {
          // Fallback to deterministic-only
          result = {
            dimension: 'structure',
            score: calculateDeterministicStructureScore(deterministic),
            findings: [],
            metadata: {
              deterministic: {
                executedAt: new Date().toISOString(),
                durationMs: timer.elapsed(),
                toolsUsed: ['cheerio'],
              },
            },
          };
        }
        break;
      }

      case 'accessibility': {
        // Always run deterministic analysis first
        const deterministic = await analyzeAccessibility(request.migratedUrl);

        // Try agentic if OAuth token available
        try {
          const fullResult = await withBrowserPermit(() => analyzeAccessibilityWithClaude(request.migratedUrl, deterministic));

          // Combine findings and strengths
          const combinedFindings = [
            ...fullResult.agentic.findings.map(f => ({
              dimension: 'accessibility' as const,
              severity: f.severity,
              issue: f.issue,
              recommendation: f.recommendation,
              details: { impact: f.impact, priority: f.priority, ruleId: f.ruleId },
            })),
            // Add strengths as positive findings
            ...(fullResult.agentic.strengths || []).map(strength => ({
              dimension: 'accessibility' as const,
              severity: 'info' as const,
              issue: `✨ ${strength}`,
              recommendation: 'This is a positive aspect - maintain this quality',
            })),
          ];

          result = {
            dimension: 'accessibility',
            score: fullResult.finalScore,
            findings: combinedFindings,
            metadata: {
              deterministic: {
                executedAt: fullResult.timestamp,
                durationMs: timer.elapsed(),
                toolsUsed: ['playwright', 'axe-core'],
              },
              agentic: {
                executedAt: fullResult.timestamp,
                durationMs: 0,
                model: 'claude-sonnet-4-6',
              },
            },
          };
        } catch {
          // Fallback to deterministic-only
          result = {
            dimension: 'accessibility',
            score: deterministic.score,
            findings: deterministic.violations.map(v => ({
              dimension: 'accessibility' as const,
              severity: mapAxeSeverity(v.impact),
              issue: v.description,
              recommendation: `Fix ${v.id}: ${v.help}`,
              details: { ruleId: v.id, helpUrl: v.helpUrl },
            })),
            metadata: {
              deterministic: {
                executedAt: new Date().toISOString(),
                durationMs: timer.elapsed(),
                toolsUsed: ['playwright', 'axe-core'],
              },
            },
          };
        }
        break;
      }

      case 'content': {
        // Determine source URL (PDF or HTML)
        const sourceUrl = request.pdfPath || request.expectedUrl;

        // Skip if no source reference provided
        if (!sourceUrl) {
          logger.warn('Content agent skipped: No source reference provided');
          result = {
            dimension: 'content',
            score: 0,
            findings: [{
              dimension: 'content',
              severity: 'info',
              issue: 'No source reference provided for content comparison',
              recommendation: 'Provide a PDF URL or HTML source URL to enable content fidelity analysis',
            }],
            metadata: {
              deterministic: {
                executedAt: new Date().toISOString(),
                durationMs: 0,
                toolsUsed: [],
              },
            },
          };
          break;
        }

        // Auto-detect source type (PDF vs HTML)
        const sourceType = sourceUrl.toLowerCase().endsWith('.pdf') ? 'pdf' : 'html';
        logger.info('Content agent source type detected', { sourceType, sourceUrl });

        // Try to run content analysis
        try {
          const deterministic = await analyzeContent(sourceUrl, request.migratedUrl);

          // Try agentic if OAuth token available
          try {
            const fullResult = await withBrowserPermit(() => analyzeContentWithClaude(sourceUrl, request.migratedUrl, deterministic, sourceType));

            // Combine findings and strengths
            const combinedFindings = [
              ...(fullResult.agentic?.findings || []).map(f => ({
                dimension: 'content' as const,
                severity: f.severity,
                issue: f.issue,
                recommendation: f.recommendation,
                details: { type: f.type, snippet: f.snippet },
              })),
              // Add strengths as positive findings
              ...(fullResult.agentic?.strengths || []).map(strength => ({
                dimension: 'content' as const,
                severity: 'info' as const,
                issue: `✨ ${strength}`,
                recommendation: 'This is a positive aspect - maintain this quality',
              })),
            ];

            result = {
              dimension: 'content',
              score: fullResult.finalScore,
              findings: combinedFindings,
              metadata: {
                deterministic: {
                  executedAt: fullResult.timestamp,
                  durationMs: timer.elapsed(),
                  toolsUsed: ['unpdf', 'cheerio'],
                },
                agentic: {
                  executedAt: fullResult.timestamp,
                  durationMs: 0,
                  model: 'claude-sonnet-4-6',
                },
              },
            };
          } catch {
            // Fallback to deterministic-only
            result = {
              dimension: 'content',
              score: deterministic.score,
              findings: [{
                dimension: 'content' as const,
                severity: deterministic.score < 50 ? 'critical' : deterministic.score < 70 ? 'serious' : 'moderate',
                issue: `Content similarity: ${deterministic.diff.similarityScore}%`,
                recommendation: `Review ${deterministic.diff.missing.length} missing sentences and ${deterministic.diff.extra.length} extra sentences`,
              }],
              metadata: {
                deterministic: {
                  executedAt: new Date().toISOString(),
                  durationMs: timer.elapsed(),
                  toolsUsed: ['unpdf', 'cheerio'],
                },
              },
            };
          }
        } catch (error) {
          // Content analysis failed (e.g., PDF parsing issue)
          logger.error('Content analysis failed', error as Error, { dimension });
          result = {
            dimension: 'content',
            score: 0,
            findings: [{
              dimension: 'content',
              severity: 'critical',
              issue: 'Content analysis failed',
              recommendation: error instanceof Error ? error.message : 'Unknown error occurred',
            }],
            metadata: {
              deterministic: {
                executedAt: new Date().toISOString(),
                durationMs: timer.elapsed(),
                toolsUsed: [],
              },
            },
          };
        }
        break;
      }

      case 'visual': {
        // Always run deterministic analysis first with source info
        const deterministic = await analyzeVisual(request.migratedUrl, {
          sourceUrl: request.expectedUrl, // HTML source for comparison
          pdfPath: request.pdfPath, // PDF source for comparison
        });

        // Try agentic if OAuth token available
        try {
          // Visual agent's agentic function only returns AgenticAnalysisResult, not full VisualAnalysisResult
          const agenticResult = await withBrowserPermit(() => analyzeVisualWithClaude(deterministic));

          // Calculate final score using the helper function
          const { calculateFinalScore } = await import('@/lib/agents/visual/agentic');
          const finalScore = calculateFinalScore(agenticResult.score, deterministic.score);

          // Combine findings and strengths
          const combinedFindings = [
            ...agenticResult.findings.map((f) => ({
              dimension: 'visual' as const,
              severity: f.severity,
              issue: f.issue,
              recommendation: f.recommendation,
              details: { type: f.type, location: f.location },
            })),
            // Add strengths as positive findings
            ...(agenticResult.strengths || []).map(strength => ({
              dimension: 'visual' as const,
              severity: 'info' as const,
              issue: `✨ ${strength}`,
              recommendation: 'This is a positive aspect - maintain this quality',
            })),
          ];

          result = {
            dimension: 'visual',
            score: finalScore,
            findings: combinedFindings,
            metadata: {
              deterministic: {
                executedAt: deterministic.metadata.executedAt,
                durationMs: timer.elapsed(),
                toolsUsed: ['playwright', 'pixelmatch', 'pngjs'],
              },
              agentic: {
                executedAt: new Date().toISOString(),
                durationMs: 0,
                model: 'claude-sonnet-4-6',
              },
              screenshot: {
                path: deterministic.screenshot.path,
                absolutePath: deterministic.screenshot.absolutePath,
              },
            },
          };
        } catch (error) {
          // PHASE 34: Log warning instead of silent fallback
          logger.warn('Agentic visual analysis failed, using deterministic fallback', {
            error: (error as Error).message,
            dimension: 'visual',
            fallbackScore: deterministic.score,
          });

          // Fallback to deterministic-only
          result = {
            dimension: 'visual',
            score: deterministic.score,
            findings: [],
            metadata: {
              deterministic: {
                executedAt: new Date().toISOString(),
                durationMs: timer.elapsed(),
                toolsUsed: ['playwright', 'pixelmatch', 'pngjs'],
              },
              screenshot: {
                path: deterministic.screenshot.path,
                absolutePath: deterministic.screenshot.absolutePath,
              },
            },
          };
        }
        break;
      }
    }

    const duration = timer.elapsed();
    logger.operationComplete(`${dimension} agent`, duration, {
      score: result.score,
      findingsCount: result.findings.length,
    });

    if (onProgress && completedCountRef) {
      completedCountRef.value += 1;
      onProgress({
        type: 'agent-complete',
        dimension,
        result,
        progress: calculateProgress(completedCountRef.value, 4),
      });
    }

    return { dimension, result, error: null, duration };
  } catch (error) {
    const duration = timer.elapsed();
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`${dimension} agent failed`, err, { dimension, duration });

    if (onProgress) {
      onProgress({
        type: 'error',
        dimension,
        error: err.message,
      });
    }

    return { dimension, result: null, error: err, duration };
  }
}

/**
 * Calculate progress percentage based on number of completed agents
 */
function calculateProgress(completedCount: number, totalCount: number): number {
  return Math.round((completedCount / totalCount) * 100);
}

/**
 * Map axe-core impact levels to our severity scale
 */
function mapAxeSeverity(impact: string): 'critical' | 'serious' | 'moderate' | 'minor' {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'serious';
    case 'moderate':
      return 'moderate';
    default:
      return 'minor';
  }
}

/**
 * Calculate deterministic-only structure score (fallback)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateDeterministicStructureScore(metrics: any): number {
  let score = 100;

  // Meta tags
  if (!metrics.metaTags?.title) score -= 10;
  if (!metrics.metaTags?.description) score -= 8;
  if (!metrics.metaTags?.viewport) score -= 5;
  if (!metrics.metaTags?.ogTitle) score -= 7;

  // Heading hierarchy
  if (metrics.headingHierarchy?.h1Count === 0) score -= 15;
  if (metrics.headingHierarchy?.h1Count > 1) score -= 10;
  if (!metrics.headingHierarchy?.hasProperNesting) score -= 5;

  // Document structure
  if (!metrics.documentStructure?.hasMain) score -= 8;
  if (!metrics.documentStructure?.hasHeader) score -= 4;
  if (!metrics.documentStructure?.hasFooter) score -= 4;
  if (!metrics.documentStructure?.hasNav) score -= 4;

  // Links
  const brokenAnchors = metrics.linkAnalysis?.brokenAnchors || 0;
  const linksWithoutText = metrics.linkAnalysis?.linksWithoutText || 0;
  score -= Math.min(brokenAnchors * 5, 10);
  score -= Math.min(linksWithoutText * 3, 10);

  return Math.max(0, score);
}

/**
 * Calculate overall weighted score from all dimension scores
 */
function calculateOverallScore(results: {
  structure?: AgentResult;
  accessibility?: AgentResult;
  content?: AgentResult;
  visual?: AgentResult;
}): number {
  let totalScore = 0;
  let totalWeight = 0;

  if (results.structure) {
    totalScore += results.structure.score * DIMENSION_WEIGHTS.structure;
    totalWeight += DIMENSION_WEIGHTS.structure;
  }

  if (results.accessibility) {
    totalScore += results.accessibility.score * DIMENSION_WEIGHTS.accessibility;
    totalWeight += DIMENSION_WEIGHTS.accessibility;
  }

  if (results.content) {
    totalScore += results.content.score * DIMENSION_WEIGHTS.content;
    totalWeight += DIMENSION_WEIGHTS.content;
  }

  if (results.visual) {
    totalScore += results.visual.score * DIMENSION_WEIGHTS.visual;
    totalWeight += DIMENSION_WEIGHTS.visual;
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
}

/**
 * Map overall score to grade
 */
function calculateGrade(score: number): 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'acceptable';
  if (score >= 40) return 'needs-improvement';
  return 'critical';
}

/**
 * Main orchestrator function - runs all 4 agents in parallel
 */
export async function runEvaluation(
  request: EvaluationRequest,
  onProgress?: ProgressCallback
): Promise<EvaluationReport> {
  const timer = new Timer();
  const createdAt = new Date().toISOString();

  logger.info('Starting parallel agent execution', {
    url: request.migratedUrl,
    hasPdf: !!request.pdfPath,
    agents: 4,
  });

  // Track completed agents count for accurate progress calculation
  const completedCountRef = { value: 0 };

  // Run all 4 agents in parallel
  const agentPromises = [
    runAgent('structure', request, onProgress, completedCountRef),
    runAgent('accessibility', request, onProgress, completedCountRef),
    runAgent('content', request, onProgress, completedCountRef),
    runAgent('visual', request, onProgress, completedCountRef),
  ];

  const agentResults = await Promise.all(agentPromises);

  logger.info('All agents complete', {
    totalDuration: timer.elapsed(),
    successCount: agentResults.filter(r => r.result !== null).length,
    failureCount: agentResults.filter(r => r.error !== null).length,
  });

  // Build results object
  const results: {
    structure?: AgentResult;
    accessibility?: AgentResult;
    content?: AgentResult;
    visual?: AgentResult;
  } = {};

  for (const agentResult of agentResults) {
    if (agentResult.result) {
      results[agentResult.dimension] = agentResult.result;
    }
  }

  // Aggregate all findings
  const allFindings: Finding[] = [];
  for (const result of Object.values(results)) {
    if (result) {
      allFindings.push(...result.findings);
    }
  }

  // Calculate overall score and grade
  const overallScore = calculateOverallScore(results);
  const grade = calculateGrade(overallScore);
  const passedDimensions = Object.values(results).filter(r => r.score >= 75).length;

  const completedAt = new Date().toISOString();
  const durationMs = timer.elapsed();

  logger.info('Evaluation summary', {
    overallScore,
    grade,
    passedDimensions,
    totalDimensions: 4,
    totalFindings: allFindings.length,
    durationMs,
  });

  // Build evaluation report
  const report: EvaluationReport = {
    id: `eval-${Date.now()}`,
    type: 'single', // PHASE 32: Discriminator for unified storage
    request,
    summary: {
      overallScore,
      grade,
      passedDimensions,
      totalDimensions: 4,
    },
    results,
    findings: allFindings,
    metadata: {
      createdAt,
      completedAt,
      durationMs,
      version: SYSTEM_VERSION,
    },
  };

  if (onProgress) {
    onProgress({
      type: 'evaluation-complete',
      progress: 100,
      report,
    });
  }

  return report;
}
