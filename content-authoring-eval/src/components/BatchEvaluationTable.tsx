/**
 * PHASE 29: Enhanced Real-time Batch Evaluation Table Component
 *
 * Features:
 * - Tooltips with score explanations
 * - Expandable row details showing findings
 * - Row animations on state changes
 * - Smooth transitions
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PageEvaluationState } from '@/hooks/useBatchEvaluationStream';
import { Loader2, CheckCircle, XCircle, Clock, ChevronDown, AlertTriangle } from 'lucide-react';
import { Dimension, Finding } from '@/types/evaluation';

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
 * Get grade text for score
 */
function getGradeText(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Acceptable';
  if (score >= 40) return 'Needs Improvement';
  return 'Critical';
}

/**
 * Get grade description for tooltip
 */
function getGradeDescription(score: number): string {
  if (score >= 90) return 'Exceeds original quality';
  if (score >= 75) return 'Matches original, minor issues';
  if (score >= 60) return 'Functional, some issues';
  if (score >= 40) return 'Significant issues';
  return 'Not production-ready';
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
 * Get severity badge
 */
function getSeverityBadge(severity: string): JSX.Element {
  switch (severity) {
    case 'critical':
      return <Badge variant="destructive" className="text-xs">Critical</Badge>;
    case 'serious':
      return <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700">Serious</Badge>;
    case 'moderate':
      return <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700">Moderate</Badge>;
    case 'minor':
      return <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">Minor</Badge>;
    case 'info':
      return <Badge variant="outline" className="text-xs">Info</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{severity}</Badge>;
  }
}

/**
 * Render dimension cell with spinner, score, or placeholder (with tooltip)
 */
function DimensionCell({ status, score, findings }: {
  status: string;
  score?: number;
  dimension: Dimension;
  findings: Finding[];
}) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-2 justify-center transition-all duration-300 ease-out">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        <span className="text-gray-400 text-sm">Evaluating...</span>
      </div>
    );
  }

  if (status === 'completed' && score !== undefined) {
    const gradeText = getGradeText(score);
    const gradeDesc = getGradeDescription(score);
    const findingCount = findings.length;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help transition-all duration-300 ease-out animate-in fade-in-50 zoom-in-95">
              <span className={getScoreColor(score)}>{score}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              <p className="font-semibold">{score} - {gradeText}</p>
              <p className="text-xs">{gradeDesc}</p>
              {findingCount > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {findingCount} finding{findingCount > 1 ? 's' : ''} - click row to expand
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (status === 'error') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-red-600 justify-center cursor-help">
              <XCircle className="h-4 w-4" />
              <span className="text-sm">Error</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Evaluation failed for this dimension</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 transition-all duration-300 ease-out animate-in fade-in-50">
          <CheckCircle className="h-3 w-3 mr-1" />
          Done
        </Badge>
      );

    case 'error':
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 cursor-help">
                <XCircle className="h-3 w-3 mr-1" />
                Error
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs max-w-xs">{error || 'Evaluation failed'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );

    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

/**
 * Render overall score cell with tooltip
 */
function OverallScoreCell({ status, score }: { status: string; score?: number }) {
  if (status === 'running') {
    return (
      <div className="flex items-center gap-2 justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      </div>
    );
  }

  if (status === 'done' && score !== undefined) {
    const gradeText = getGradeText(score);
    const gradeDesc = getGradeDescription(score);

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 justify-center cursor-help transition-all duration-500 ease-out animate-in fade-in-50 zoom-in-95">
              <span className={getScoreColor(score)}>{score}</span>
              {getGradeBadge(score)}
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1">
              <p className="font-semibold">{score} - {gradeText}</p>
              <p className="text-xs">{gradeDesc}</p>
              <p className="text-xs text-gray-400 mt-1">
                Weighted average of all dimensions
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-1 text-red-600 justify-center">
        <XCircle className="h-4 w-4" />
      </div>
    );
  }

  // Queued
  return <span className="text-gray-400">-</span>;
}

/**
 * Render findings list for a dimension
 */
function FindingsList({ findings, dimension }: { findings: Finding[]; dimension: string }) {
  if (findings.length === 0) {
    return (
      <div className="text-sm text-gray-500 italic">
        No findings for {dimension}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {findings.map((finding, index) => (
        <div key={index} className="border-l-2 border-gray-200 pl-3 space-y-1">
          <div className="flex items-start gap-2">
            {getSeverityBadge(finding.severity)}
            <AlertTriangle className="h-4 w-4 text-gray-400 mt-0.5" />
            <p className="text-sm font-medium text-gray-900 flex-1">{finding.issue}</p>
          </div>
          <p className="text-sm text-gray-600 ml-6">{finding.recommendation}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Expandable row details showing all findings
 */
function ExpandableRowDetails({ page }: { page: PageEvaluationState }) {
  const allFindings = [
    ...page.findings.structure,
    ...page.findings.accessibility,
    ...page.findings.content,
    ...page.findings.visual,
  ];

  if (page.status !== 'done' || allFindings.length === 0) {
    return null;
  }

  return (
    <TableRow className="bg-gray-50">
      <TableCell colSpan={7} className="p-0">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="findings" className="border-none">
            <AccordionTrigger className="px-6 py-3 hover:no-underline hover:bg-gray-100">
              <div className="flex items-center gap-2">
                <ChevronDown className="h-4 w-4" />
                <span className="text-sm font-medium">View All Findings ({allFindings.length})</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Structure Findings */}
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-gray-700">
                    Structure {page.scores.structure && `(${page.scores.structure})`}
                  </h4>
                  <FindingsList findings={page.findings.structure} dimension="structure" />
                </div>

                {/* Accessibility Findings */}
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-gray-700">
                    Accessibility {page.scores.accessibility && `(${page.scores.accessibility})`}
                  </h4>
                  <FindingsList findings={page.findings.accessibility} dimension="accessibility" />
                </div>

                {/* Content Findings */}
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-gray-700">
                    Content {page.scores.content && `(${page.scores.content})`}
                  </h4>
                  <FindingsList findings={page.findings.content} dimension="content" />
                </div>

                {/* Visual Findings */}
                <div>
                  <h4 className="font-semibold text-sm mb-3 text-gray-700">
                    Visual {page.scores.visual && `(${page.scores.visual})`}
                  </h4>
                  <FindingsList findings={page.findings.visual} dimension="visual" />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </TableCell>
    </TableRow>
  );
}

/**
 * Table row with animation on status change
 */
function AnimatedTableRow({ page }: { page: PageEvaluationState }) {
  // Determine row background based on status
  const getRowClassName = () => {
    if (page.status === 'running') {
      return 'bg-blue-50/30 transition-colors duration-300';
    }
    if (page.status === 'done') {
      return 'hover:bg-gray-50 transition-colors duration-300';
    }
    return 'hover:bg-gray-50 transition-colors duration-300';
  };

  return (
    <>
      <TableRow className={getRowClassName()}>
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
          <DimensionCell
            status={page.dimensions.structure}
            score={page.scores.structure}
            dimension="structure"
            findings={page.findings.structure}
          />
        </TableCell>

        {/* Accessibility Score */}
        <TableCell className="text-center">
          <DimensionCell
            status={page.dimensions.accessibility}
            score={page.scores.accessibility}
            dimension="accessibility"
            findings={page.findings.accessibility}
          />
        </TableCell>

        {/* Content Score */}
        <TableCell className="text-center">
          <DimensionCell
            status={page.dimensions.content}
            score={page.scores.content}
            dimension="content"
            findings={page.findings.content}
          />
        </TableCell>

        {/* Visual Score */}
        <TableCell className="text-center">
          <DimensionCell
            status={page.dimensions.visual}
            score={page.scores.visual}
            dimension="visual"
            findings={page.findings.visual}
          />
        </TableCell>

        {/* Overall Score */}
        <TableCell className="text-center">
          <OverallScoreCell status={page.status} score={page.scores.overall} />
        </TableCell>
      </TableRow>

      {/* Expandable row details */}
      <ExpandableRowDetails page={page} />
    </>
  );
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
            <AnimatedTableRow key={page.pageId} page={page} />
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
