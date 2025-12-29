'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { BatchEvaluationInput } from '@/types/evaluation';
import { JsonBatchImport } from '@/components/JsonBatchImport';
import { BatchExportButton } from '@/components/BatchExportButton';
import { FileJson, ListChecks, ChevronDown, ChevronRight } from 'lucide-react';

export function BatchEvaluationForm() {
  const [batchData, setBatchData] = useState<BatchEvaluationInput | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleImportSuccess = (importedBatch: BatchEvaluationInput) => {
    setBatchData(importedBatch);
    setError(null);
    setSuccess(`Successfully imported ${importedBatch.pages.length} pages for evaluation`);
    setIsExpanded(true);
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
  };

  const handleStartEvaluation = () => {
    if (!batchData) {
      setError('Please import a batch file first');
      return;
    }

    // Phase 27: For now, just show a message
    // Phase 28 will implement the actual batch evaluation with SSE streaming
    setSuccess('Batch evaluation will be implemented in Phase 28 (SSE Streaming)');
  };

  return (
    <div className="space-y-6">
      {/* Import Component */}
      <JsonBatchImport onImportSuccess={handleImportSuccess} onError={handleImportError} />

      {/* Success Alert */}
      {success && (
        <Alert className="bg-green-50 border-green-200">
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* Batch Info Card (shown after import) */}
      {batchData && (
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
                    <BatchExportButton batchId={batchData.batchId} disabled={true} />
                    <Button type="button" onClick={handleStartEvaluation}>
                      Start Evaluation
                    </Button>
                  </div>
                </div>

                <Alert className="bg-blue-50 border-blue-200">
                  <AlertDescription className="text-blue-800 text-sm">
                    <strong>Phase 27 Note:</strong> The export button is disabled because no results
                    exist yet. Batch evaluation with SSE streaming will be implemented in Phase 28.
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Empty State (when no batch loaded) */}
      {!batchData && (
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
