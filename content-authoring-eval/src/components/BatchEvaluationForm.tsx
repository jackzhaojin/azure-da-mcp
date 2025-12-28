'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useEvaluations } from '@/hooks/useEvaluations';
import { EvaluationRequest, EvaluationReport } from '@/types/evaluation';
import { API_ENDPOINTS } from '@/lib/constants';

interface BatchRow {
  id: string;
  migratedUrl: string;
  pdfPath: string;
  expectedUrl: string;
}

export function BatchEvaluationForm() {
  const router = useRouter();
  const { addEvaluation } = useEvaluations();

  const [rows, setRows] = useState<BatchRow[]>([
    { id: '1', migratedUrl: '', pdfPath: '', expectedUrl: '' },
    { id: '2', migratedUrl: '', pdfPath: '', expectedUrl: '' },
    { id: '3', migratedUrl: '', pdfPath: '', expectedUrl: '' },
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const addRow = () => {
    if (rows.length >= 50) {
      setError('Maximum 50 evaluations allowed per batch');
      return;
    }
    setRows([
      ...rows,
      { id: Date.now().toString(), migratedUrl: '', pdfPath: '', expectedUrl: '' },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) {
      setError('At least one row is required');
      return;
    }
    setRows(rows.filter((row) => row.id !== id));
  };

  const updateRow = (id: string, field: keyof BatchRow, value: string) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) return false;
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setProgress(0);

    // Validate at least one row has URL
    const validRows = rows.filter((row) => row.migratedUrl.trim());
    if (validRows.length === 0) {
      setError('At least one migrated URL is required');
      return;
    }

    // Validate all provided URLs
    for (const row of validRows) {
      if (!validateUrl(row.migratedUrl)) {
        setError(`Invalid migrated URL: ${row.migratedUrl}`);
        return;
      }
      if (row.expectedUrl && !validateUrl(row.expectedUrl)) {
        setError(`Invalid expected URL: ${row.expectedUrl}`);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Build request
      const evaluations: EvaluationRequest[] = validRows.map((row) => ({
        migratedUrl: row.migratedUrl.trim(),
        ...(row.pdfPath.trim() && { pdfPath: row.pdfPath.trim() }),
        ...(row.expectedUrl.trim() && { expectedUrl: row.expectedUrl.trim() }),
      }));

      // Submit batch evaluation
      const response = await fetch(`${API_ENDPOINTS.evaluate}/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ evaluations }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const result = await response.json();

      // Save all reports to localStorage
      result.reports.forEach((report: EvaluationReport) => {
        addEvaluation(report);
      });

      setProgress(100);
      setSuccess(
        `Batch complete! ${result.completedEvaluations}/${result.totalEvaluations} evaluations successful. Average score: ${result.summary.averageScore}`
      );

      // Navigate to dashboard after short delay
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit batch evaluation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Evaluation</CardTitle>
        <CardDescription>
          Evaluate multiple pages at once. Enter up to 50 URL/PDF pairs for sequential processing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Progress Bar (visible during submission) */}
          {isSubmitting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing batch...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

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

          {/* Batch Rows */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Evaluation Entries</Label>
              <Badge variant="outline">
                {rows.filter((r) => r.migratedUrl.trim()).length} of {rows.length} filled
              </Badge>
            </div>

            <div className="space-y-3">
              {rows.map((row, index) => (
                <Card key={row.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-800 text-sm font-medium flex items-center justify-center">
                      {index + 1}
                    </div>

                    <div className="flex-1 space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Migrated URL {index === 0 && '*'}
                        </Label>
                        <Input
                          type="url"
                          placeholder="https://example.com/migrated-page"
                          value={row.migratedUrl}
                          onChange={(e) => updateRow(row.id, 'migratedUrl', e.target.value)}
                          disabled={isSubmitting}
                          required={index === 0}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">PDF Reference</Label>
                          <Input
                            type="text"
                            placeholder="https://example.com/original.pdf"
                            value={row.pdfPath}
                            onChange={(e) => updateRow(row.id, 'pdfPath', e.target.value)}
                            disabled={isSubmitting}
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground">Original URL</Label>
                          <Input
                            type="url"
                            placeholder="https://example.com/original-page"
                            value={row.expectedUrl}
                            onChange={(e) => updateRow(row.id, 'expectedUrl', e.target.value)}
                            disabled={isSubmitting}
                          />
                        </div>
                      </div>
                    </div>

                    {rows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(row.id)}
                        disabled={isSubmitting}
                        className="flex-shrink-0"
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addRow}
              disabled={isSubmitting || rows.length >= 50}
              className="w-full"
            >
              + Add Another Entry
            </Button>
          </div>

          {/* Submit Buttons */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/')}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Processing Batch...' : 'Start Batch Evaluation'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
