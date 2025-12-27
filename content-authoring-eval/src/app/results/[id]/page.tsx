'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvaluations } from '@/hooks/useEvaluations';

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

      {/* Overall Score Card */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Assessment</CardTitle>
          <CardDescription>
            Completed on {new Date(evaluation.metadata.completedAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Overall Score</p>
              <p className="text-4xl font-bold">{evaluation.summary.overallScore}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Grade</p>
              <div className={`inline-block px-4 py-2 rounded-full text-lg font-medium ${
                evaluation.summary.grade === 'excellent' ? 'bg-green-100 text-green-800' :
                evaluation.summary.grade === 'good' ? 'bg-blue-100 text-blue-800' :
                evaluation.summary.grade === 'acceptable' ? 'bg-yellow-100 text-yellow-800' :
                evaluation.summary.grade === 'needs-improvement' ? 'bg-orange-100 text-orange-800' :
                'bg-red-100 text-red-800'
              }`}>
                {evaluation.summary.grade.toUpperCase()}
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Passed Dimensions</p>
              <p className="text-4xl font-bold">
                {evaluation.summary.passedDimensions}/{evaluation.summary.totalDimensions}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Total Findings</p>
              <p className="text-4xl font-bold">{evaluation.findings.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dimension Scores */}
      <Card>
        <CardHeader>
          <CardTitle>Dimension Scores</CardTitle>
          <CardDescription>
            Individual scores for each evaluation dimension
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {evaluation.results.structure && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Structure</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{evaluation.results.structure.score}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {evaluation.results.structure.findings.length} findings
                  </p>
                </CardContent>
              </Card>
            )}
            {evaluation.results.accessibility && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Accessibility</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{evaluation.results.accessibility.score}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {evaluation.results.accessibility.findings.length} findings
                  </p>
                </CardContent>
              </Card>
            )}
            {evaluation.results.content && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Content Fidelity</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{evaluation.results.content.score}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {evaluation.results.content.findings.length} findings
                  </p>
                </CardContent>
              </Card>
            )}
            {evaluation.results.visual && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Visual Correctness</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{evaluation.results.visual.score}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {evaluation.results.visual.findings.length} findings
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Findings */}
      {evaluation.findings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Findings</CardTitle>
            <CardDescription>
              Issues discovered during evaluation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {evaluation.findings.map((finding, index) => (
                <Card key={index} className="border">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className={`px-2 py-1 rounded text-xs font-medium ${
                        finding.severity === 'critical' ? 'bg-red-100 text-red-800' :
                        finding.severity === 'serious' ? 'bg-orange-100 text-orange-800' :
                        finding.severity === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                        finding.severity === 'minor' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {finding.severity.toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-muted-foreground uppercase">
                            {finding.dimension}
                          </span>
                        </div>
                        <p className="font-medium mb-1">{finding.issue}</p>
                        <p className="text-sm text-muted-foreground">{finding.recommendation}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evaluation Details */}
      <Card>
        <CardHeader>
          <CardTitle>Evaluation Details</CardTitle>
        </CardHeader>
        <CardContent>
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
