'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, CheckCircle, XCircle } from 'lucide-react';
import { API_ENDPOINTS } from '@/lib/constants';

interface BatchExportButtonProps {
  batchId: string;
  disabled?: boolean;
  className?: string;
}

export function BatchExportButton({ batchId, disabled = false, className }: BatchExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleExport = async () => {
    setIsExporting(true);
    setExportStatus('idle');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_ENDPOINTS.evaluate}/export/${batchId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Export failed: ${response.status}`);
      }

      // Get the filename from Content-Disposition header
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `batch-${batchId}-results.json`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportStatus('success');

      // Reset success message after 3 seconds
      setTimeout(() => {
        setExportStatus('idle');
      }, 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to export results';
      setErrorMessage(message);
      setExportStatus('error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className={className}>
      <Button
        onClick={handleExport}
        disabled={disabled || isExporting}
        variant={exportStatus === 'success' ? 'outline' : 'default'}
        className="gap-2"
      >
        {exportStatus === 'success' ? (
          <>
            <CheckCircle className="h-4 w-4" />
            Exported!
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export Results'}
          </>
        )}
      </Button>

      {exportStatus === 'error' && (
        <Alert className="bg-red-50 border-red-200 mt-2">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
