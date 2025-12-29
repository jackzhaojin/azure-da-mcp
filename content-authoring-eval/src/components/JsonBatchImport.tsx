'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BatchEvaluationInput } from '@/types/evaluation';
import { API_ENDPOINTS } from '@/lib/constants';
import { Upload, FileJson, CheckCircle, XCircle } from 'lucide-react';

interface JsonBatchImportProps {
  onImportSuccess: (batchData: BatchEvaluationInput) => void;
  onError?: (error: string) => void;
}

interface ImportResponse {
  success: boolean;
  batchId?: string;
  pageCount?: number;
  message?: string;
  error?: string;
  details?: Array<{ path: string; message: string }>;
}

export function JsonBatchImport({ onImportSuccess, onError }: JsonBatchImportProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Array<{ path: string; message: string }>>([]);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number; pageCount: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // Reset state
    setUploadStatus('idle');
    setStatusMessage('');
    setValidationErrors([]);
    setFileInfo(null);

    // Validate file type
    if (!file.name.endsWith('.json')) {
      const error = 'Invalid file type. Please upload a .json file.';
      setUploadStatus('error');
      setStatusMessage(error);
      onError?.(error);
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      const error = 'File too large. Maximum file size is 5MB.';
      setUploadStatus('error');
      setStatusMessage(error);
      onError?.(error);
      return;
    }

    setIsUploading(true);

    try {
      // Read file content
      const fileContent = await file.text();

      // Parse JSON
      let jsonData: unknown;
      try {
        jsonData = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error(`Invalid JSON format: ${parseError instanceof Error ? parseError.message : 'Parse failed'}`);
      }

      // Send to validation API
      const response = await fetch(`${API_ENDPOINTS.evaluate}/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonData),
      });

      const result: ImportResponse = await response.json();

      if (!response.ok || !result.success) {
        // Validation failed
        setUploadStatus('error');
        setStatusMessage(result.error || 'Validation failed');
        setValidationErrors(result.details || []);
        onError?.(result.error || 'Validation failed');
        return;
      }

      // Success
      setUploadStatus('success');
      setStatusMessage(result.message || 'Batch imported successfully!');
      setFileInfo({
        name: file.name,
        size: file.size,
        pageCount: result.pageCount || 0,
      });

      // Pass validated data to parent
      onImportSuccess(jsonData as BatchEvaluationInput);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to import batch';
      setUploadStatus('error');
      setStatusMessage(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileJson className="h-5 w-5" />
          Import Batch JSON
        </CardTitle>
        <CardDescription>
          Upload a JSON file containing pages to evaluate. Maximum 50 pages per batch.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drag & Drop Area */}
        <div
          className={`
            border-2 border-dashed rounded-lg p-8 text-center transition-colors
            ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
            ${isUploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-blue-400'}
          `}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleButtonClick}
        >
          <Input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div className="space-y-4">
            <div className="flex justify-center">
              {uploadStatus === 'success' ? (
                <CheckCircle className="h-12 w-12 text-green-500" />
              ) : uploadStatus === 'error' ? (
                <XCircle className="h-12 w-12 text-red-500" />
              ) : (
                <Upload className="h-12 w-12 text-gray-400" />
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700">
                {isUploading ? 'Uploading and validating...' : 'Drag and drop your JSON file here'}
              </p>
              <p className="text-xs text-gray-500 mt-1">or click to browse files</p>
            </div>

            <div className="flex justify-center gap-2">
              <Badge variant="outline">Max 50 pages</Badge>
              <Badge variant="outline">Max 5MB</Badge>
            </div>
          </div>
        </div>

        {/* File Info (after successful upload) */}
        {fileInfo && uploadStatus === 'success' && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              <div className="space-y-1">
                <div className="font-medium">{statusMessage}</div>
                <div className="text-sm space-y-0.5">
                  <div>File: {fileInfo.name} ({formatFileSize(fileInfo.size)})</div>
                  <div>Pages: {fileInfo.pageCount}</div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Status Messages */}
        {uploadStatus === 'error' && (
          <Alert className="bg-red-50 border-red-200">
            <XCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              <div className="space-y-2">
                <div className="font-medium">{statusMessage}</div>
                {validationErrors.length > 0 && (
                  <div className="text-sm space-y-1">
                    <div className="font-medium">Validation errors:</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {validationErrors.map((err, idx) => (
                        <li key={idx}>
                          <span className="font-mono text-xs">{err.path}</span>: {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Sample File Link */}
        <div className="text-sm text-gray-600">
          <p className="mb-2">Don&apos;t have a batch file? Download a sample:</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open('/samples/demo-5-pages.json', '_blank')}
            >
              <FileJson className="h-4 w-4 mr-1" />
              5 pages
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open('/samples/demo-10-pages.json', '_blank')}
            >
              <FileJson className="h-4 w-4 mr-1" />
              10 pages
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.open('/samples/demo-20-pages.json', '_blank')}
            >
              <FileJson className="h-4 w-4 mr-1" />
              20 pages
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
