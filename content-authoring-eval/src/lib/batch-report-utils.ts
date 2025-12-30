/**
 * PHASE 32: Batch Report Conversion Utilities
 * Helper functions to convert page states to BatchEvaluationReport
 */

import { PageEvaluationState, BatchPageResult, BatchEvaluationReport, DimensionResult } from '@/types/evaluation';
import { SYSTEM_VERSION } from '@/lib/constants';

/**
 * Convert PageEvaluationState to BatchPageResult
 */
export function convertToPageResult(pageState: PageEvaluationState): BatchPageResult {
  // Calculate overall score (average of completed dimensions)
  const scores = Object.values(pageState.scores).filter((s): s is number => s !== undefined);
  const overallScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  // Determine overall grade
  const overallGrade = getGradeFromScore(overallScore);

  // Convert dimension results
  const dimensions: BatchPageResult['dimensions'] = {
    structure: convertDimensionResult(pageState, 'structure'),
    accessibility: convertDimensionResult(pageState, 'accessibility'),
    content: convertDimensionResult(pageState, 'content'),
    visual: convertDimensionResult(pageState, 'visual'),
  };

  return {
    pageId: pageState.pageId,
    title: pageState.title,
    overallScore,
    overallGrade,
    dimensions,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Convert individual dimension from PageEvaluationState
 */
function convertDimensionResult(
  pageState: PageEvaluationState,
  dimension: 'structure' | 'accessibility' | 'content' | 'visual'
): DimensionResult {
  const score = pageState.scores[dimension] ?? 0;
  const findings = pageState.findings[dimension] || [];

  return {
    score,
    grade: getGradeFromScore(score),
    findings,
  };
}

/**
 * Get grade from score (Title Case to match BatchPageResult type)
 */
function getGradeFromScore(score: number): 'Excellent' | 'Good' | 'Acceptable' | 'Needs Improvement' | 'Critical' {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Acceptable';
  if (score >= 40) return 'Needs Improvement';
  return 'Critical';
}

/**
 * Convert to lowercase grade for BatchEvaluationReport.summary
 */
function toLowercaseGrade(grade: 'Excellent' | 'Good' | 'Acceptable' | 'Needs Improvement' | 'Critical'): 'excellent' | 'good' | 'acceptable' | 'needs-improvement' | 'critical' {
  const map = {
    'Excellent': 'excellent' as const,
    'Good': 'good' as const,
    'Acceptable': 'acceptable' as const,
    'Needs Improvement': 'needs-improvement' as const,
    'Critical': 'critical' as const,
  };
  return map[grade];
}

/**
 * Calculate batch summary from all page states
 */
export function calculateBatchSummary(pageStates: Map<string, PageEvaluationState>) {
  const allPages = Array.from(pageStates.values());
  const totalPages = allPages.length;

  // Count successful vs failed pages
  const successfulPages = allPages.filter((p) => p.status === 'done').length;
  const failedPages = allPages.filter((p) => p.status === 'error').length;

  // Calculate average score
  const pageScores = allPages.map((page) => {
    const scores = Object.values(page.scores).filter((s): s is number => s !== undefined);
    return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  });

  const averageScore = pageScores.length > 0
    ? pageScores.reduce((a, b) => a + b, 0) / pageScores.length
    : 0;

  // Calculate score distribution
  const scoreDistribution = {
    excellent: pageScores.filter((s) => s >= 90).length,
    good: pageScores.filter((s) => s >= 75 && s < 90).length,
    acceptable: pageScores.filter((s) => s >= 60 && s < 75).length,
    needsImprovement: pageScores.filter((s) => s >= 40 && s < 60).length,
    critical: pageScores.filter((s) => s < 40).length,
  };

  const grade = getGradeFromScore(averageScore);

  return {
    totalPages,
    successfulPages,
    failedPages,
    averageScore,
    grade: toLowercaseGrade(grade), // Convert to lowercase for summary
    scoreDistribution,
  };
}

/**
 * Convert pageStates Map to BatchEvaluationReport
 */
export function convertToBatchReport(
  batchId: string,
  pageStates: Map<string, PageEvaluationState>,
  startedAt: number,
  completedAt: number
): BatchEvaluationReport {
  const results = Array.from(pageStates.values()).map(convertToPageResult);
  const summary = calculateBatchSummary(pageStates);

  return {
    id: batchId,
    type: 'batch',
    batchId,
    summary,
    results,
    metadata: {
      createdAt: new Date(startedAt).toISOString(),
      completedAt: new Date(completedAt).toISOString(),
      durationMs: completedAt - startedAt,
      version: SYSTEM_VERSION,
    },
  };
}
