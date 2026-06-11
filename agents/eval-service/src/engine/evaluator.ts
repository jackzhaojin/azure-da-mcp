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
import { hasAgentAuth } from '@/lib/agent-auth';
import { withBrowserPermit } from '../browser/semaphore'; // browser semaphore (PRD part-2) — added during extraction

const logger = createLogger('agent');

/**
 * Classify a failed agentic pass for the dimension result: expected degradation
 * (no Claude auth → 'deterministic-only') vs a real failure that silently
 * downgraded scoring ('deterministic-fallback'). The notice finding makes the
 * degradation visible in the persisted report instead of being swallowed.
 */
function describeAgenticFailure(
  dimension: 'structure' | 'accessibility' | 'content' | 'visual',
  error: unknown
): { mode: 'deterministic-only' | 'deterministic-fallback'; modeReason: string; notice: Finding } {
  const message = error instanceof Error ? error.message : String(error);
  const mode = hasAgentAuth() ? 'deterministic-fallback' : 'deterministic-only';
  if (mode === 'deterministic-fallback') {
    logger.warn(`Agentic ${dimension} analysis failed — deterministic fallback`, { dimension, error: message });
  } else {
    logger.info(`Agentic ${dimension} analysis skipped — no Claude auth configured`, { dimension });
  }
  const notice: Finding =
    mode === 'deterministic-only'
      ? {
          dimension,
          severity: 'info',
          issue: 'Agentic analysis skipped: no Claude auth configured — score is deterministic-only',
          recommendation: 'Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY to enable semantic scoring',
        }
      : {
          dimension,
          severity: 'info',
          issue: `Agentic analysis failed — score is deterministic-only: ${message}`,
          recommendation: 'Investigate the agentic failure; deterministic scoring is a coarser instrument',
        };
  return { mode, modeReason: message, notice };
}

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
  /** Set when the dimension was not applicable (e.g. content with no source). */
  skipped?: string;
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
              mode: 'agentic',
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
        } catch (agenticError) {
          const { mode, modeReason, notice } = describeAgenticFailure('structure', agenticError);
          result = {
            dimension: 'structure',
            score: calculateDeterministicStructureScore(deterministic),
            findings: [notice],
            metadata: {
              mode,
              modeReason,
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
              mode: 'agentic',
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
        } catch (agenticError) {
          const { mode, modeReason, notice } = describeAgenticFailure('accessibility', agenticError);
          result = {
            dimension: 'accessibility',
            score: deterministic.score,
            findings: [
              ...deterministic.violations.map(v => ({
                dimension: 'accessibility' as const,
                severity: mapAxeSeverity(v.impact),
                issue: v.description,
                recommendation: `Fix ${v.id}: ${v.help}`,
                details: { ruleId: v.id, helpUrl: v.helpUrl },
              })),
              notice,
            ],
            metadata: {
              mode,
              modeReason,
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

        // No source reference → the dimension is NOT APPLICABLE. It must be
        // excluded from the overall score (weights renormalize), not counted
        // as 0 at 25% weight — a sourceless eval of a perfect page used to
        // land at overall ~66 purely because of this.
        if (!sourceUrl) {
          logger.info('Content dimension skipped: no source reference provided');
          if (onProgress && completedCountRef) {
            completedCountRef.value += 1;
            onProgress({
              type: 'agent-complete',
              dimension,
              progress: calculateProgress(completedCountRef.value, 4),
            });
          }
          return {
            dimension,
            result: null,
            error: null,
            duration: timer.elapsed(),
            skipped: 'no source reference provided — content fidelity is not applicable',
          };
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
                mode: 'agentic',
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
          } catch (agenticError) {
            const { mode, modeReason, notice } = describeAgenticFailure('content', agenticError);
            result = {
              dimension: 'content',
              score: deterministic.score,
              findings: [
                {
                  dimension: 'content' as const,
                  severity: deterministic.score < 50 ? 'critical' : deterministic.score < 70 ? 'serious' : 'moderate',
                  issue: `Content similarity: ${deterministic.diff.similarityScore}% (word-overlap metric — paraphrased migrations score low without the agentic pass)`,
                  recommendation: `Review ${deterministic.diff.missing.length} missing sentences and ${deterministic.diff.extra.length} extra sentences`,
                },
                notice,
              ],
              metadata: {
                mode,
                modeReason,
                deterministic: {
                  executedAt: new Date().toISOString(),
                  durationMs: timer.elapsed(),
                  toolsUsed: ['unpdf', 'cheerio'],
                },
              },
            };
          }
        } catch (error) {
          // Content analysis itself failed (fetch/parse) — measurement failure,
          // not a quality verdict. Propagate so the dimension is excluded and
          // recorded as failed, instead of scoring 0 at 25% weight.
          logger.error('Content analysis failed', error as Error, { dimension });
          throw error;
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
              mode: 'agentic',
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
        } catch (agenticError) {
          const { mode, modeReason, notice } = describeAgenticFailure('visual', agenticError);
          result = {
            dimension: 'visual',
            score: deterministic.score,
            findings: [notice],
            metadata: {
              mode,
              modeReason,
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

  const skippedDimensions: Array<{ dimension: AgentExecutionResult['dimension']; reason: string }> = [];
  const failedDimensions: Array<{ dimension: AgentExecutionResult['dimension']; message: string }> = [];
  for (const agentResult of agentResults) {
    if (agentResult.result) {
      results[agentResult.dimension] = agentResult.result;
    } else if (agentResult.skipped) {
      skippedDimensions.push({ dimension: agentResult.dimension, reason: agentResult.skipped });
    } else if (agentResult.error) {
      failedDimensions.push({ dimension: agentResult.dimension, message: agentResult.error.message });
    }
  }

  // Aggregate all findings
  const allFindings: Finding[] = [];
  for (const result of Object.values(results)) {
    if (result) {
      allFindings.push(...result.findings);
    }
  }
  // Excluded dimensions must stay visible in the report — a dimension that
  // vanished without a trace is indistinguishable from one that was never run.
  for (const s of skippedDimensions) {
    allFindings.push({
      dimension: s.dimension,
      severity: 'info',
      issue: `${s.dimension} dimension skipped: ${s.reason}`,
      recommendation: 'Provide a sourceLocation (PDF or webpage) to enable this dimension',
    });
  }
  for (const f of failedDimensions) {
    allFindings.push({
      dimension: f.dimension,
      severity: 'serious',
      issue: `${f.dimension} evaluation failed: ${f.message}`,
      recommendation: 'Dimension excluded from the overall score; remaining dimensions were renormalized',
    });
  }

  // Calculate overall score and grade
  const overallScore = calculateOverallScore(results);
  const grade = calculateGrade(overallScore);
  const passedDimensions = Object.values(results).filter(r => r.score >= 75).length;
  // Applicable dimensions only — a skipped (not-applicable) dimension isn't
  // part of the denominator; a FAILED one is (it should have produced a score).
  const totalDimensions = 4 - skippedDimensions.length;

  const completedAt = new Date().toISOString();
  const durationMs = timer.elapsed();

  logger.info('Evaluation summary', {
    overallScore,
    grade,
    passedDimensions,
    totalDimensions,
    skipped: skippedDimensions.map(s => s.dimension),
    failed: failedDimensions.map(f => f.dimension),
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
      totalDimensions,
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
