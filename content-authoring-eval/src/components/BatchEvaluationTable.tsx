/**
 * PHASE 28: Real-time Batch Evaluation Table Component
 *
 * ShadCN table with live progress indicators and color-coded scores
 */

'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageEvaluationState } from '@/hooks/useBatchEvaluationStream';
import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

interface BatchEvaluationTableProps {
  pageStates: Map<string, PageEvaluationState>;
}

/**
 * Get color class for score
 */
function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600 font-semibold'; // Excellent
  if (score >= 75) return 'text-blue-600 font-semibold'; // Good
  if (score >= 60) return 'text-yellow-600 font-semibold'; // Acceptable
  if (score >= 40) return 'text-orange-600 font-semibold'; // Needs Improvement
  return 'text-red-600 font-semibold'; // Critical
}

/**
 * Get grade badge variant for overall score
 */
function getGradeBadge(score: number): JSX.Element {
  if (score >= 90) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        Excellent
      </Badge>
    );
  }
  if (score >= 75) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        Good
      </Badge>
    );
  }
  if (score >= 60) {
    return (
      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
        Acceptable
      </Badge>
    );
  }
  if (score >= 40) {
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
        Needs Improvement
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
      Critical
    </Badge>
  );
}

/**
 * Render dimension cell with spinner, score, or placeholder
 */
function DimensionCell({ status, score }: { status: string; score?: number }) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        <span className="text-gray-400 text-sm">Evaluating...</span>
      </div>
    );
  }

  if (status === 'completed' && score !== undefined) {
    return <span className={getScoreColor(score)}>{score}</span>;
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-1 text-red-600">
        <XCircle className="h-4 w-4" />
        <span className="text-sm">Error</span>
      </div>
    );
  }

  // Pending
  return <span className="text-gray-400">-</span>;
}

/**
 * Render status badge
 */
function StatusBadge({ status, error }: { status: string; error?: string }) {
  switch (status) {
    case 'queued':
      return (
        <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
          <Clock className="h-3 w-3 mr-1" />
          Queued
        </Badge>
      );

    case 'running':
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 animate-pulse">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Running
        </Badge>
      );

    case 'done':
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Done
        </Badge>
      );

    case 'error':
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200" title={error}>
          <XCircle className="h-3 w-3 mr-1" />
          Error
        </Badge>
      );

    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

/**
 * Render overall score cell
 */
function OverallScoreCell({ status, score }: { status: string; score?: number }) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      </div>
    );
  }

  if (status === 'done' && score !== undefined) {
    return (
      <div className="flex items-center gap-2">
        <span className={getScoreColor(score)}>{score}</span>
        {getGradeBadge(score)}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-1 text-red-600">
        <XCircle className="h-4 w-4" />
      </div>
    );
  }

  // Queued
  return <span className="text-gray-400">-</span>;
}

/**
 * Batch Evaluation Table Component
 */
export function BatchEvaluationTable({ pageStates }: BatchEvaluationTableProps) {
  const pages = Array.from(pageStates.values());

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-[30%]">Page Title</TableHead>
            <TableHead className="w-[15%]">Status</TableHead>
            <TableHead className="w-[11%] text-center">Structure</TableHead>
            <TableHead className="w-[11%] text-center">Accessibility</TableHead>
            <TableHead className="w-[11%] text-center">Content</TableHead>
            <TableHead className="w-[11%] text-center">Visual</TableHead>
            <TableHead className="w-[11%] text-center">Overall</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map((page) => (
            <TableRow key={page.pageId}>
              {/* Page Title */}
              <TableCell className="font-medium">
                <div className="truncate max-w-xs" title={page.title}>
                  {page.title}
                </div>
              </TableCell>

              {/* Status Badge */}
              <TableCell>
                <StatusBadge status={page.status} error={page.error} />
              </TableCell>

              {/* Structure Score */}
              <TableCell className="text-center">
                <DimensionCell status={page.dimensions.structure} score={page.scores.structure} />
              </TableCell>

              {/* Accessibility Score */}
              <TableCell className="text-center">
                <DimensionCell
                  status={page.dimensions.accessibility}
                  score={page.scores.accessibility}
                />
              </TableCell>

              {/* Content Score */}
              <TableCell className="text-center">
                <DimensionCell status={page.dimensions.content} score={page.scores.content} />
              </TableCell>

              {/* Visual Score */}
              <TableCell className="text-center">
                <DimensionCell status={page.dimensions.visual} score={page.scores.visual} />
              </TableCell>

              {/* Overall Score */}
              <TableCell className="text-center">
                <OverallScoreCell status={page.status} score={page.scores.overall} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {pages.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No pages to display</p>
        </div>
      )}
    </div>
  );
}
