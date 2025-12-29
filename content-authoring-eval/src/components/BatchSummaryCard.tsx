/**
 * PHASE 29: Batch Summary Card Component
 *
 * Displays overall batch statistics when evaluation completes
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageEvaluationState } from '@/hooks/useBatchEvaluationStream';
import { CheckCircle, TrendingUp, BarChart3, Clock } from 'lucide-react';

interface BatchSummaryCardProps {
  pageStates: Map<string, PageEvaluationState>;
  batchId: string;
  startedAt: number; // timestamp
  completedAt: number; // timestamp
}

/**
 * Get grade distribution
 */
function getGradeDistribution(pages: PageEvaluationState[]): Record<string, number> {
  const distribution = {
    Excellent: 0,
    Good: 0,
    Acceptable: 0,
    'Needs Improvement': 0,
    Critical: 0,
  };

  for (const page of pages) {
    if (page.status === 'done' && page.scores.overall !== undefined) {
      const score = page.scores.overall;
      if (score >= 90) distribution.Excellent++;
      else if (score >= 75) distribution.Good++;
      else if (score >= 60) distribution.Acceptable++;
      else if (score >= 40) distribution['Needs Improvement']++;
      else distribution.Critical++;
    }
  }

  return distribution;
}

/**
 * Calculate average overall score
 */
function calculateAverageScore(pages: PageEvaluationState[]): number {
  const completedPages = pages.filter((p) => p.status === 'done' && p.scores.overall !== undefined);
  if (completedPages.length === 0) return 0;

  const totalScore = completedPages.reduce((sum, p) => sum + (p.scores.overall || 0), 0);
  return Math.round(totalScore / completedPages.length);
}

/**
 * Format duration
 */
function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

/**
 * Batch Summary Card Component
 */
export function BatchSummaryCard({
  pageStates,
  batchId,
  startedAt,
  completedAt,
}: BatchSummaryCardProps) {
  const pages = Array.from(pageStates.values());
  const totalPages = pages.length;
  const completedPages = pages.filter((p) => p.status === 'done').length;
  const errorPages = pages.filter((p) => p.status === 'error').length;
  const averageScore = calculateAverageScore(pages);
  const gradeDistribution = getGradeDistribution(pages);
  const evaluationTime = formatDuration(completedAt - startedAt);

  return (
    <Card className="bg-green-50 border-green-200">
      <CardHeader>
        <div className="flex items-center gap-3">
          <CheckCircle className="h-6 w-6 text-green-600" />
          <div>
            <CardTitle className="text-green-900">Batch Evaluation Complete</CardTitle>
            <CardDescription className="text-green-700">
              All {totalPages} pages have been evaluated
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Overall Statistics */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-green-900">
              <BarChart3 className="h-4 w-4" />
              Overall Statistics
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Pages:</span>
                <Badge variant="outline">{totalPages}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Completed:</span>
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  {completedPages}
                </Badge>
              </div>
              {errorPages > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Errors:</span>
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    {errorPages}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Average Score:</span>
                <span className="font-semibold text-green-900">{averageScore}/100</span>
              </div>
            </div>
          </div>

          {/* Grade Distribution */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-green-900">
              <TrendingUp className="h-4 w-4" />
              Grade Distribution
            </div>
            <div className="space-y-2">
              {Object.entries(gradeDistribution)
                .filter(([, count]) => count > 0)
                .map(([grade, count]) => (
                  <div key={grade} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{grade}:</span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
              {Object.values(gradeDistribution).every((count) => count === 0) && (
                <p className="text-sm text-gray-500 italic">No completed pages</p>
              )}
            </div>
          </div>

          {/* Evaluation Time */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-green-900">
              <Clock className="h-4 w-4" />
              Evaluation Time
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Time:</span>
                <span className="font-semibold text-green-900">{evaluationTime}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Per Page (avg):</span>
                <span className="font-mono text-sm text-gray-700">
                  {completedPages > 0
                    ? formatDuration(Math.floor((completedAt - startedAt) / completedPages))
                    : 'N/A'}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-2 border-t pt-2">
                <p>Batch ID: <span className="font-mono">{batchId}</span></p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
