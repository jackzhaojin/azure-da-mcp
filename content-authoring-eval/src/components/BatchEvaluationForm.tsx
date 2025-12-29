'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { BatchEvaluationInput } from '@/types/evaluation';
import { JsonBatchImport } from '@/components/JsonBatchImport';
import { BatchExportButton } from '@/components/BatchExportButton';
import { BatchEvaluationTable } from '@/components/BatchEvaluationTable';
import { useBatchEvaluationStream } from '@/hooks/useBatchEvaluationStream';
import { FileJson, ListChecks, ChevronDown, ChevronRight, PlayCircle, RotateCcw } from 'lucide-react';

export function BatchEvaluationForm() {
  const [batchData, setBatchData] = useState<BatchEvaluationInput | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // SSE streaming state
  const { isConnected, isComplete, error: streamError, pageStates, startEvaluation, reset } = useBatchEvaluationStream();

  const handleImportSuccess = (importedBatch: BatchEvaluationInput) => {
    setBatchData(importedBatch);
    setError(null);
    setSuccess(`Successfully imported ${importedBatch.pages.length} pages for evaluation`);
    setIsExpanded(true);
    reset(); // Reset any previous evaluation state
  };

  const handleImportError = (errorMessage: string) => {
    setError(errorMessage);
    setSuccess(null);
  };

  const handleClearBatch = () => {
    setBatchData(null);
    setSuccess(null);
    setError(null);
    setIsExpanded(false);
    reset();
  };

  const handleStartEvaluation = () => {
    if (!batchData) {
      setError('Please import a batch file first');
      return;
    }

    setError(null);
    setSuccess(null);

    // Start SSE streaming
    const pages = batchData.pages.map((p) => ({ id: p.id, title: p.title }));
    startEvaluation(batchData.batchId, pages);
  };

  const handleRestart = () => {
    reset();
    setSuccess(null);
    setError(null);
  };

  // Show stream error if any
  const displayError = error || streamError;

  // Determine if export should be enabled (batch is complete)
  const canExport = isComplete && batchData;

  // Show evaluation running state
  const isEvaluating = isConnected || (pageStates.size > 0 && !isComplete);

  return (
    <div className="space-y-6">
      {/* Import Component */}
      {!isEvaluating && <JsonBatchImport onImportSuccess={handleImportSuccess} onError={handleImportError} />}

      {/* Success Alert */}
      {success && !isEvaluating && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {displayError && (
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">{displayError}</AlertDescription>
        </Alert>
      )}

      {/* Batch Info Card (shown after import, before evaluation starts) */}
      {batchData && !isEvaluating && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileJson className="h-5 w-5 text-blue-600" />
                <div>
                  <CardTitle>Batch Loaded: {batchData.batchId}</CardTitle>
                  <CardDescription>{batchData.pages.length} pages ready for evaluation</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-sm">
                  {batchData.pages.length} pages
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Hide Pages
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-4 w-4 mr-1" />
                      Show Pages
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>

          {isExpanded && (
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <ListChecks className="h-4 w-4" />
                  Page List
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-700 w-16">#</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Page ID</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Title</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">PDF URL</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-700">Web URL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {batchData.pages.map((page, index) => (
                        <tr key={page.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-500">{index + 1}</td>
                          <td className="px-4 py-2 font-mono text-xs">{page.id}</td>
                          <td className="px-4 py-2">{page.title}</td>
                          <td className="px-4 py-2 font-mono text-xs">
                            <a
                              href={page.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline truncate block max-w-xs"
                            >
                              {page.pdfUrl}
                            </a>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">
                            <a
                              href={page.webUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline truncate block max-w-xs"
                            >
                              {page.webUrl}
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-4 border-t">
                  <Button type="button" variant="outline" onClick={handleClearBatch}>
                    Clear Batch
                  </Button>

                  <div className="flex gap-3">
                    <Button type="button" onClick={handleStartEvaluation}>
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Start Evaluation
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Real-time Evaluation Table (shown during and after evaluation) */}
      {isEvaluating && batchData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Batch Evaluation: {batchData.batchId}</CardTitle>
                <CardDescription>
                  {isComplete
                    ? `Evaluation complete - ${batchData.pages.length} pages processed`
                    : `Evaluating ${batchData.pages.length} pages in real-time...`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isComplete ? (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Complete
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 animate-pulse">
                    Running...
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Real-time table */}
            <BatchEvaluationTable pageStates={pageStates} />

            {/* Action buttons (shown when complete) */}
            {isComplete && (
              <div className="flex justify-between items-center pt-4 border-t">
                <Button type="button" variant="outline" onClick={handleRestart}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Start New Evaluation
                </Button>

                <BatchExportButton batchId={batchData.batchId} disabled={!canExport} />
              </div>
            )}

            {/* Info alert during evaluation */}
            {!isComplete && isConnected && (
              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-blue-800 text-sm">
                  <strong>Evaluation in progress:</strong> Scores will update automatically as each dimension completes.
                  This may take several minutes depending on the number of pages.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Empty State (when no batch loaded and not evaluating) */}
      {!batchData && !isEvaluating && (
        <Card className="border-dashed">
          <CardContent className="pt-6 pb-6 text-center text-gray-500">
            <FileJson className="h-12 w-12 mx-auto mb-3 text-gray-400" />
            <p className="text-sm">No batch loaded. Import a JSON file to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
