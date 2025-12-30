'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEvaluations } from '@/hooks/useEvaluations';
import { BatchEvaluationTable } from '@/components/BatchEvaluationTable';
import { PageEvaluationState } from '@/types/evaluation';
import { ArrowLeft, Download, Trash2, Calendar, Clock } from 'lucide-react';

/**
 * PHASE 32: Batch Results Detail Page
 * Displays completed batch evaluation with all page results
 */
export default function BatchResultsPage() {
  const params = useParams();
  const { getEvaluation, deleteEvaluation } = useEvaluations();

  const batchId = params.batchId as string;
  const evaluation = getEvaluation(batchId);

  // Convert BatchEvaluationReport to PageEvaluationState[] for table
  const pageStates = useMemo(() => {
    if (!evaluation || evaluation.type !== 'batch') return new Map<string, PageEvaluationState>();

    const states = new Map<string, PageEvaluationState>();

    evaluation.results.forEach((result) => {
      const state: PageEvaluationState = {
        pageId: result.pageId,
        title: result.title,
        status: 'done', // All saved results are complete
        dimensions: {
          structure: 'completed',
          accessibility: 'completed',
          content: 'completed',
          visual: 'completed',
        },
        scores: {
          structure: result.dimensions.structure.score,
          accessibility: result.dimensions.accessibility.score,
          content: result.dimensions.content.score,
          visual: result.dimensions.visual.score,
        },
        findings: {
          structure: result.dimensions.structure.findings,
          accessibility: result.dimensions.accessibility.findings,
          content: result.dimensions.content.findings,
          visual: result.dimensions.visual.findings,
        },
      };

      states.set(result.pageId, state);
    });

    return states;
  }, [evaluation]);

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this batch evaluation? This cannot be undone.')) {
      deleteEvaluation(batchId);
      window.location.href = '/'; // Redirect to dashboard
    }
  };

  const handleExport = () => {
    if (!evaluation || evaluation.type !== 'batch') return;

    const dataStr = JSON.stringify(evaluation, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${evaluation.batchId}-results-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!evaluation) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground mb-4">
                Batch evaluation not found. It may have been deleted.
              </p>
              <Link href="/">
                <Button>Return to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (evaluation.type !== 'batch') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground mb-4">
                This is not a batch evaluation. Redirecting...
              </p>
              <Link href={`/results/${evaluation.id}`}>
                <Button>View Single Evaluation</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const durationSeconds = Math.round(evaluation.metadata.durationMs / 1000);
  const durationMinutes = Math.floor(durationSeconds / 60);
  const durationFormatted = durationMinutes > 0
    ? `${durationMinutes}m ${durationSeconds % 60}s`
    : `${durationSeconds}s`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Batch Evaluation Results</h1>
            <p className="text-muted-foreground mt-2">{evaluation.batchId}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Batch
          </Button>
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Batch Summary</CardTitle>
          <CardDescription>
            Completed {new Date(evaluation.metadata.completedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left column: Basic stats */}
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Pages</p>
                <p className="text-3xl font-bold">{evaluation.summary.totalPages}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Successful</p>
                <p className="text-3xl font-bold text-green-600">{evaluation.summary.successfulPages}</p>
              </div>
              {evaluation.summary.failedPages > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">Failed</p>
                  <p className="text-3xl font-bold text-red-600">{evaluation.summary.failedPages}</p>
                </div>
              )}
            </div>

            {/* Middle column: Score */}
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Average Score</p>
                <p className="text-3xl font-bold">{evaluation.summary.averageScore.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Grade</p>
                <Badge
                  variant="outline"
                  className={`text-lg px-4 py-1 ${
                    evaluation.summary.grade === 'excellent' ? 'bg-green-100 text-green-800 border-green-200' :
                    evaluation.summary.grade === 'good' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                    evaluation.summary.grade === 'acceptable' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                    evaluation.summary.grade === 'needs-improvement' ? 'bg-orange-100 text-orange-800 border-orange-200' :
                    'bg-red-100 text-red-800 border-red-200'
                  }`}
                >
                  {evaluation.summary.grade.toUpperCase()}
                </Badge>
              </div>
            </div>

            {/* Right column: Timing */}
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Started
                </p>
                <p className="text-sm">{new Date(evaluation.metadata.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Duration
                </p>
                <p className="text-sm">{durationFormatted}</p>
              </div>
            </div>
          </div>

          {/* Score Distribution */}
          <div className="mt-6 pt-6 border-t">
            <p className="text-sm text-muted-foreground mb-3">Score Distribution</p>
            <div className="grid grid-cols-5 gap-2">
              <div className="text-center">
                <div className="bg-green-100 text-green-800 rounded p-2">
                  <p className="text-2xl font-bold">{evaluation.summary.scoreDistribution.excellent}</p>
                  <p className="text-xs">Excellent</p>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-blue-100 text-blue-800 rounded p-2">
                  <p className="text-2xl font-bold">{evaluation.summary.scoreDistribution.good}</p>
                  <p className="text-xs">Good</p>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-yellow-100 text-yellow-800 rounded p-2">
                  <p className="text-2xl font-bold">{evaluation.summary.scoreDistribution.acceptable}</p>
                  <p className="text-xs">Acceptable</p>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-orange-100 text-orange-800 rounded p-2">
                  <p className="text-2xl font-bold">{evaluation.summary.scoreDistribution.needsImprovement}</p>
                  <p className="text-xs">Needs Work</p>
                </div>
              </div>
              <div className="text-center">
                <div className="bg-red-100 text-red-800 rounded p-2">
                  <p className="text-2xl font-bold">{evaluation.summary.scoreDistribution.critical}</p>
                  <p className="text-xs">Critical</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Page Results</CardTitle>
          <CardDescription>
            Detailed results for all {evaluation.summary.totalPages} pages in this batch
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BatchEvaluationTable pageStates={pageStates} />
        </CardContent>
      </Card>
    </div>
  );
}
