'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEvaluations } from '@/hooks/useEvaluations';
import { EvaluationRequest, EvaluationReport } from '@/types/evaluation';
import { API_ENDPOINTS } from '@/lib/constants';

export function EvaluationForm() {
  const router = useRouter();
  const { addEvaluation } = useEvaluations();

  const [migratedUrl, setMigratedUrl] = useState('');
  const [pdfPath, setPdfPath] = useState('');
  const [expectedUrl, setExpectedUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      setUrlError('URL is required');
      return false;
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setUrlError('URL must use http:// or https://');
        return false;
      }
      setUrlError(null);
      return true;
    } catch {
      setUrlError('Invalid URL format');
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate migrated URL
    if (!validateUrl(migratedUrl)) {
      return;
    }

    // Validate expected URL if provided
    if (expectedUrl && !validateUrl(expectedUrl)) {
      return;
    }

    setIsSubmitting(true);

    try {
      const request: EvaluationRequest = {
        migratedUrl: migratedUrl.trim(),
        ...(pdfPath.trim() && { pdfPath: pdfPath.trim() }),
        ...(expectedUrl.trim() && { expectedUrl: expectedUrl.trim() }),
      };

      const response = await fetch(API_ENDPOINTS.evaluate, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const report: EvaluationReport = await response.json();

      // Save to localStorage
      addEvaluation(report);

      // Navigate to results page
      router.push(`/results/${report.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit evaluation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Evaluation</CardTitle>
        <CardDescription>
          Enter the migrated page URL and optional reference materials to evaluate migration quality
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Migrated URL - Required */}
          <div className="space-y-2">
            <Label htmlFor="migratedUrl" className="required">
              Migrated Page URL *
            </Label>
            <Input
              id="migratedUrl"
              type="url"
              placeholder="https://example.com/migrated-page"
              value={migratedUrl}
              onChange={(e) => {
                setMigratedUrl(e.target.value);
                if (urlError) setUrlError(null);
              }}
              onBlur={() => migratedUrl && validateUrl(migratedUrl)}
              required
              disabled={isSubmitting}
              className={urlError ? 'border-red-500' : ''}
            />
            {urlError && (
              <p className="text-sm text-red-600">{urlError}</p>
            )}
            <p className="text-sm text-muted-foreground">
              The URL of the migrated webpage to evaluate
            </p>
          </div>

          {/* PDF Path - Optional */}
          <div className="space-y-2">
            <Label htmlFor="pdfPath">
              PDF Reference (Optional)
            </Label>
            <Input
              id="pdfPath"
              type="text"
              placeholder="https://example.com/original.pdf or /path/to/file.pdf"
              value={pdfPath}
              onChange={(e) => setPdfPath(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              URL or file path to the original PDF specification
            </p>
          </div>

          {/* Expected URL - Optional */}
          <div className="space-y-2">
            <Label htmlFor="expectedUrl">
              Original Page URL (Optional)
            </Label>
            <Input
              id="expectedUrl"
              type="url"
              placeholder="https://example.com/original-page"
              value={expectedUrl}
              onChange={(e) => setExpectedUrl(e.target.value)}
              disabled={isSubmitting}
            />
            <p className="text-sm text-muted-foreground">
              The URL of the original page before migration
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Submit Button */}
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
              {isSubmitting ? 'Submitting...' : 'Start Evaluation'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
