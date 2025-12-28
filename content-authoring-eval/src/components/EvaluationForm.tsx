'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useEvaluations } from '@/hooks/useEvaluations';
import { useEvaluationStream } from '@/hooks/useEvaluationStream';
import { EvaluationRequest, EvaluationReport } from '@/types/evaluation';
import { API_ENDPOINTS } from '@/lib/constants';

export function EvaluationForm() {
  const router = useRouter();
  const { addEvaluation } = useEvaluations();
  const {
    isStreaming,
    progress,
    agentProgress,
    finalReport,
    error: streamError,
    startEvaluation: startStreamEvaluation,
  } = useEvaluationStream();

  const [migratedUrl, setMigratedUrl] = useState('');
  const [pdfPath, setPdfPath] = useState('');
  const [expectedUrl, setExpectedUrl] = useState('');
  const [useStreaming, setUseStreaming] = useState(true);
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

    const request: EvaluationRequest = {
      migratedUrl: migratedUrl.trim(),
      ...(pdfPath.trim() && { pdfPath: pdfPath.trim() }),
      ...(expectedUrl.trim() && { expectedUrl: expectedUrl.trim() }),
    };

    if (useStreaming) {
      // Use SSE streaming mode
      await startStreamEvaluation(request);
    } else {
      // Use standard non-streaming mode
      setIsSubmitting(true);

      try {
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
    }
  };

  // Navigate to results when streaming completes
  if (finalReport) {
    addEvaluation(finalReport);
    router.push(`/results/${finalReport.id}`);
  }

  const isLoading = isSubmitting || isStreaming;

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
          {/* Streaming Mode Toggle */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-md">
            <div>
              <Label className="font-medium">Real-time Progress</Label>
              <p className="text-xs text-muted-foreground">
                Show live updates as each agent completes
              </p>
            </div>
            <Button
              type="button"
              variant={useStreaming ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseStreaming(!useStreaming)}
              disabled={isLoading}
            >
              {useStreaming ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {/* Progress Display (visible during streaming) */}
          {isStreaming && (
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Evaluation Progress</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="w-full" />

                {/* Agent Status Badges */}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge
                    variant="outline"
                    className={
                      agentProgress.structure === 'completed'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : agentProgress.structure === 'running'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : agentProgress.structure === 'failed'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-gray-100 text-gray-800 border-gray-200'
                    }
                  >
                    Structure: {agentProgress.structure}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      agentProgress.accessibility === 'completed'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : agentProgress.accessibility === 'running'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : agentProgress.accessibility === 'failed'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-gray-100 text-gray-800 border-gray-200'
                    }
                  >
                    Accessibility: {agentProgress.accessibility}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      agentProgress.content === 'completed'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : agentProgress.content === 'running'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : agentProgress.content === 'failed'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-gray-100 text-gray-800 border-gray-200'
                    }
                  >
                    Content: {agentProgress.content}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      agentProgress.visual === 'completed'
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : agentProgress.visual === 'running'
                        ? 'bg-blue-100 text-blue-800 border-blue-200'
                        : agentProgress.visual === 'failed'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-gray-100 text-gray-800 border-gray-200'
                    }
                  >
                    Visual: {agentProgress.visual}
                  </Badge>
                </div>
              </div>
            </Card>
          )}

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
          {(error || streamError) && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error || streamError}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/')}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (useStreaming ? 'Evaluating...' : 'Submitting...') : 'Start Evaluation'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
