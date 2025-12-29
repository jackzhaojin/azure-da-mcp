/**
 * PHASE 29: Overall Progress Bar Component
 *
 * Displays batch evaluation progress with completion percentage and time estimates
 */

'use client';

import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { PageEvaluationState } from '@/hooks/useBatchEvaluationStream';
import { Clock, CheckCircle } from 'lucide-react';

interface BatchProgressBarProps {
  pageStates: Map<string, PageEvaluationState>;
  isComplete: boolean;
}

/**
 * Calculate estimated time remaining
 */
function estimateTimeRemaining(
  totalPages: number,
  completedPages: number,
  elapsedSeconds: number
): string {
  if (completedPages === 0) {
    return 'Calculating...';
  }

  const averageSecondsPerPage = elapsedSeconds / completedPages;
  const remainingPages = totalPages - completedPages;
  const remainingSeconds = Math.ceil(averageSecondsPerPage * remainingPages);

  if (remainingSeconds < 60) {
    return `~${remainingSeconds}s`;
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return seconds > 0 ? `~${minutes}m ${seconds}s` : `~${minutes}m`;
}

/**
 * Batch Progress Bar Component
 */
export function BatchProgressBar({ pageStates, isComplete }: BatchProgressBarProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime] = useState<number>(Date.now());

  const pages = Array.from(pageStates.values());
  const totalPages = pages.length;
  const completedPages = pages.filter((p) => p.status === 'done' || p.status === 'error').length;
  const progressPercentage = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;

  // Update elapsed time every second
  useEffect(() => {
    if (isComplete) return;

    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isComplete, startTime]);

  const estimatedTimeRemaining = !isComplete
    ? estimateTimeRemaining(totalPages, completedPages, elapsedSeconds)
    : null;

  return (
    <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">
            {isComplete ? (
              <span className="flex items-center gap-2 text-green-700">
                <CheckCircle className="h-4 w-4" />
                Evaluation Complete
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Evaluating {totalPages} pages...
              </span>
            )}
          </span>
          <span className="text-gray-600">
            {completedPages}/{totalPages} complete ({progressPercentage}%)
          </span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      {/* Time estimate */}
      {!isComplete && estimatedTimeRemaining && completedPages > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Estimated time remaining: {estimatedTimeRemaining}</span>
          <span>Elapsed: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s</span>
        </div>
      )}

      {/* Completion message */}
      {isComplete && (
        <div className="text-xs text-gray-500 text-center">
          Total evaluation time: {Math.floor(elapsedSeconds / 60)}m {elapsedSeconds % 60}s
        </div>
      )}
    </div>
  );
}
