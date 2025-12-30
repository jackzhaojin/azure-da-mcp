'use client';

import { useEvaluations } from '@/hooks/useEvaluations';
import { EvaluationReport } from '@/types/evaluation';
import { SYSTEM_VERSION } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function TestHooksPage() {
  const { evaluations, addEvaluation, clearEvaluations } = useEvaluations();

  const handleAddMockEvaluation = () => {
    const mockReport: EvaluationReport = {
      id: `test-${Date.now()}`,
      type: 'single', // PHASE 32: Discriminator for unified storage
      request: {
        migratedUrl: 'https://example.com/migrated-page',
        pdfPath: 'https://example.com/original.pdf',
      },
      summary: {
        overallScore: 85,
        grade: 'good',
        passedDimensions: 3,
        totalDimensions: 4,
      },
      results: {
        structure: {
          dimension: 'structure',
          score: 90,
          findings: [
            {
              dimension: 'structure',
              severity: 'minor',
              issue: 'Missing H1 tag',
              recommendation: 'Add an H1 tag to the page',
            },
          ],
          metadata: {
            deterministic: {
              executedAt: new Date().toISOString(),
              durationMs: 150,
              toolsUsed: ['cheerio'],
            },
          },
        },
      },
      findings: [
        {
          dimension: 'structure',
          severity: 'minor',
          issue: 'Missing H1 tag',
          recommendation: 'Add an H1 tag to the page',
        },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 1500,
        version: SYSTEM_VERSION,
      },
    };

    addEvaluation(mockReport);
  };

  return (
    <div className="container mx-auto p-8">
      <Card>
        <CardHeader>
          <CardTitle>Test localStorage Hooks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleAddMockEvaluation}>Add Mock Evaluation</Button>
            <Button onClick={clearEvaluations} variant="destructive">
              Clear All
            </Button>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold mb-2">Stored Evaluations ({evaluations.length})</h3>
            {evaluations.length === 0 ? (
              <p className="text-muted-foreground">No evaluations stored</p>
            ) : (
              <ul className="space-y-2">
                {evaluations.map((evaluation) => (
                  <li key={evaluation.id} className="border-b pb-2">
                    <div className="font-mono text-sm">{evaluation.id}</div>
                    <div className="text-sm">
                      {/* PHASE 32: Handle discriminated union */}
                      {evaluation.type === 'single' ? (
                        <>
                          Score: {evaluation.summary.overallScore} | Grade: {evaluation.summary.grade}
                          <div className="text-xs text-muted-foreground">
                            {evaluation.request.migratedUrl}
                          </div>
                        </>
                      ) : (
                        <>
                          Batch: {evaluation.summary.averageScore} | Grade: {evaluation.summary.grade}
                          <div className="text-xs text-muted-foreground">
                            {evaluation.batchId} ({evaluation.summary.totalPages} pages)
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <p>This page tests the useLocalStorage and useEvaluations hooks.</p>
            <p>Open browser DevTools → Application → Local Storage to see the data.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
