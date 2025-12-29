/**
 * PHASE 27: Test utility to create mock batch results
 * This is for testing the export functionality
 */

import { BatchEvaluationOutput, BatchPageResult, DimensionResult, Finding } from '@/types/evaluation';
import { batchStorage } from './batch-storage';

/**
 * Create mock dimension result
 */
function createMockDimensionResult(score: number): DimensionResult {
  const grade =
    score >= 90 ? 'Excellent' :
    score >= 75 ? 'Good' :
    score >= 60 ? 'Acceptable' :
    score >= 40 ? 'Needs Improvement' :
    'Critical';

  const findings: Finding[] = [
    {
      dimension: 'structure',
      severity: score >= 75 ? 'minor' : 'moderate',
      issue: `Sample issue for score ${score}`,
      recommendation: `Sample recommendation for score ${score}`,
    },
  ];

  return { score, grade, findings };
}

/**
 * Create mock batch results for testing
 */
export function createMockBatchResults(batchId: string, pageCount: number = 5): BatchEvaluationOutput {
  const results: BatchPageResult[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const structureScore = 70 + Math.floor(Math.random() * 25);
    const accessibilityScore = 65 + Math.floor(Math.random() * 30);
    const contentScore = 75 + Math.floor(Math.random() * 20);
    const visualScore = 60 + Math.floor(Math.random() * 35);

    const overallScore = Math.floor(
      (structureScore + accessibilityScore + contentScore + visualScore) / 4
    );

    const overallGrade =
      overallScore >= 90 ? 'Excellent' :
      overallScore >= 75 ? 'Good' :
      overallScore >= 60 ? 'Acceptable' :
      overallScore >= 40 ? 'Needs Improvement' :
      'Critical';

    results.push({
      pageId: `page-${String(i).padStart(3, '0')}`,
      title: `Test Page ${i}`,
      overallScore,
      overallGrade,
      dimensions: {
        structure: createMockDimensionResult(structureScore),
        accessibility: createMockDimensionResult(accessibilityScore),
        content: createMockDimensionResult(contentScore),
        visual: createMockDimensionResult(visualScore),
      },
      evaluatedAt: new Date().toISOString(),
    });
  }

  const output: BatchEvaluationOutput = {
    batchId,
    startedAt: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
    completedAt: new Date().toISOString(),
    totalPages: pageCount,
    results,
  };

  return output;
}

/**
 * Store mock results for testing
 */
export function storeMockBatchResults(batchId: string, pageCount: number = 5): void {
  const results = createMockBatchResults(batchId, pageCount);
  batchStorage.storeResults(batchId, results);
}
