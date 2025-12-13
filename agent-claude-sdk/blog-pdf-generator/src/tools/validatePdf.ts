/**
 * PDF Validation Tool
 * Validates PDF integrity, readability, and quality
 */

import { PDFDocument } from 'pdf-lib';
import fs from 'fs/promises';

export interface ValidatePdfInput {
  pdfPath: string;
}

export interface ValidationCheck {
  passed: boolean;
  message: string;
}

export interface ValidatePdfResult {
  passed: boolean;
  checks: {
    fileIntegrity: ValidationCheck;
    contentValidation: ValidationCheck;
    qualityChecks: ValidationCheck;
  };
  metadata?: {
    pages: number;
    fileSize: number;
    fileSizeMB: string;
  };
  warnings: string[];
  errors: string[];
}

export async function validatePdf(
  input: ValidatePdfInput
): Promise<ValidatePdfResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  const result: ValidatePdfResult = {
    passed: false,
    checks: {
      fileIntegrity: { passed: false, message: '' },
      contentValidation: { passed: false, message: '' },
      qualityChecks: { passed: false, message: '' },
    },
    warnings,
    errors,
  };

  try {
    // Check 1: File Integrity
    let fileStats;
    try {
      fileStats = await fs.stat(input.pdfPath);

      if (fileStats.size === 0) {
        result.checks.fileIntegrity = {
          passed: false,
          message: 'PDF file is empty (0 bytes)',
        };
        errors.push('PDF file has 0 bytes');
        return result;
      }

      if (fileStats.size > 50 * 1024 * 1024) {
        result.checks.fileIntegrity = {
          passed: false,
          message: 'PDF file exceeds 50MB limit',
        };
        errors.push(`PDF file is too large: ${(fileStats.size / 1024 / 1024).toFixed(2)}MB`);
        return result;
      }

      result.checks.fileIntegrity = {
        passed: true,
        message: `File exists and is ${(fileStats.size / 1024).toFixed(2)}KB`,
      };
    } catch (error) {
      result.checks.fileIntegrity = {
        passed: false,
        message: 'File does not exist or is not accessible',
      };
      errors.push('PDF file not found');
      return result;
    }

    // Check 2: Content Validation (parse with pdf-lib)
    let pdfDoc;
    let pageCount = 0;

    try {
      const pdfBytes = await fs.readFile(input.pdfPath);
      pdfDoc = await PDFDocument.load(pdfBytes);
      pageCount = pdfDoc.getPageCount();

      if (pageCount === 0) {
        result.checks.contentValidation = {
          passed: false,
          message: 'PDF has 0 pages',
        };
        errors.push('PDF contains no pages');
        return result;
      }

      result.checks.contentValidation = {
        passed: true,
        message: `PDF has ${pageCount} page(s) and is valid`,
      };
    } catch (error) {
      result.checks.contentValidation = {
        passed: false,
        message: 'PDF is corrupted or unreadable',
      };
      errors.push(error instanceof Error ? error.message : 'PDF parsing failed');
      return result;
    }

    // Check 3: Quality Checks
    const fileSizeMB = fileStats.size / 1024 / 1024;

    // Warn if file is large (but not fail)
    if (fileSizeMB > 10) {
      warnings.push(`PDF is large (${fileSizeMB.toFixed(2)}MB). Consider optimizing images.`);
    }

    // Warn if very few pages for typical blog
    if (pageCount < 1) {
      warnings.push('PDF has very few pages. Check if content was fully rendered.');
    }

    result.checks.qualityChecks = {
      passed: true,
      message: 'Quality checks passed',
    };

    // All checks passed!
    result.passed = true;
    result.metadata = {
      pages: pageCount,
      fileSize: fileStats.size,
      fileSizeMB: fileSizeMB.toFixed(2),
    };

    return result;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown validation error');
    return result;
  }
}

// Tool definition for Agent SDK
export const validatePdfTool = {
  name: 'validate_pdf',
  description: 'Validates a PDF file for integrity, readability, and quality. Checks file size, page count, and PDF structure. Returns detailed validation results.',
  parameters: {
    type: 'object',
    properties: {
      pdfPath: {
        type: 'string',
        description: 'The absolute path to the PDF file to validate',
      },
    },
    required: ['pdfPath'],
  },
  execute: validatePdf,
};
