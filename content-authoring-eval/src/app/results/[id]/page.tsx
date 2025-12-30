'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useEvaluations } from '@/hooks/useEvaluations';
import { ResultsView } from '@/components/ResultsView';

export default function ResultsPage() {
  const params = useParams();
  const { getEvaluation } = useEvaluations();

  const evaluationId = params.id as string;
  const evaluation = getEvaluation(evaluationId);

  if (!evaluation) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Evaluation Not Found</h1>
          <p className="text-muted-foreground mt-2">
            The requested evaluation could not be found
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground mb-4">
                This evaluation may have been deleted or the ID is invalid
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

  // PHASE 32: Redirect to batch results page if this is a batch evaluation
  if (evaluation.type === 'batch') {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Batch Evaluation</h1>
            <p className="text-muted-foreground mt-2">
              This is a batch evaluation. Redirecting...
            </p>
          </div>
          <Link href="/">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground mb-4">
                This evaluation is part of a batch. Please view it in the batch results page.
              </p>
              <Link href={`/batch/results/${evaluation.batchId}`}>
                <Button>View Batch Results</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Evaluation Results</h1>
          <p className="text-muted-foreground mt-2">
            {evaluation.request.migratedUrl}
          </p>
        </div>
        <Link href="/">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>

      {/* Enhanced Results View with Charts */}
      <ResultsView report={evaluation} />

      {/* Evaluation Details */}
      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Evaluation ID</dt>
              <dd className="font-mono text-sm">{evaluation.id}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Duration</dt>
              <dd className="font-mono text-sm">{evaluation.metadata.durationMs}ms</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Migrated URL</dt>
              <dd className="text-sm break-all">{evaluation.request.migratedUrl}</dd>
            </div>
            {evaluation.request.pdfPath && (
              <div>
                <dt className="text-sm text-muted-foreground">PDF Reference</dt>
                <dd className="text-sm break-all">{evaluation.request.pdfPath}</dd>
              </div>
            )}
            {evaluation.request.expectedUrl && (
              <div>
                <dt className="text-sm text-muted-foreground">Original URL</dt>
                <dd className="text-sm break-all">{evaluation.request.expectedUrl}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted-foreground">System Version</dt>
              <dd className="font-mono text-sm">{evaluation.metadata.version}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
