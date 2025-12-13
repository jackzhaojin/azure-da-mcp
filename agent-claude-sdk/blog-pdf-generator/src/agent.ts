/**
 * Blog PDF Generator
 * Simplified approach: Code orchestrates PDF generation, agent composes HTML
 */

import { renderTemplate } from './utils/templateRenderer.js';
import { generatePdf } from './tools/generatePdf.js';
import { validatePdf } from './tools/validatePdf.js';
import path from 'path';

export interface BlogPdfSpec {
  id: string;
  title: string;
  content: string;
  teaser?: string;
  images?: Array<{
    url: string;
    alt?: string;
    position?: string;
  }>;
  metadata?: {
    author?: string;
    date?: string;
    tags?: string[];
  };
}

export interface PdfGenerationResult {
  success: boolean;
  pdfPath?: string;
  validation?: any;
  error?: string;
  messages: string[];
}

export async function generateBlogPdf(
  spec: BlogPdfSpec,
  outputDir: string
): Promise<PdfGenerationResult> {
  const messages: string[] = [];

  try {
    messages.push('Starting PDF generation...');
    messages.push(`Title: ${spec.title}`);

    // Step 1: Render HTML from template
    messages.push('Rendering HTML template...');
    const html = await renderTemplate('basic', {
      title: spec.title,
      content: spec.content,
      teaser: spec.teaser,
      author: spec.metadata?.author,
      date: spec.metadata?.date,
      tags: spec.metadata?.tags,
    });
    messages.push('✓ HTML rendered');

    // Step 2: Generate PDF
    const pdfPath = path.join(outputDir, `${spec.id}.pdf`);
    messages.push(`Generating PDF at: ${pdfPath}`);

    const pdfResult = await generatePdf({
      htmlContent: html,
      outputPath: pdfPath,
      title: spec.title,
    });

    if (!pdfResult.success) {
      return {
        success: false,
        error: pdfResult.error,
        messages: [...messages, `✗ PDF generation failed: ${pdfResult.error}`],
      };
    }

    messages.push(`✓ PDF generated (${(pdfResult.metadata!.fileSize / 1024).toFixed(2)}KB)`);

    // Step 3: Validate PDF
    messages.push('Validating PDF...');
    const validation = await validatePdf({ pdfPath });

    if (!validation.passed) {
      messages.push('✗ Validation failed');
      messages.push(`  Errors: ${validation.errors.join(', ')}`);

      return {
        success: false,
        pdfPath,
        validation,
        error: 'PDF validation failed',
        messages,
      };
    }

    messages.push('✓ Validation passed');
    messages.push(`  Pages: ${validation.metadata!.pages}`);
    messages.push(`  Size: ${validation.metadata!.fileSizeMB}MB`);

    if (validation.warnings.length > 0) {
      validation.warnings.forEach((warning: string) => {
        messages.push(`  Warning: ${warning}`);
      });
    }

    return {
      success: true,
      pdfPath,
      validation,
      messages,
    };
  } catch (error) {
    messages.push(`✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      messages,
    };
  }
}
