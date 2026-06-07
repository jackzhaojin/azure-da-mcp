/**
 * PHASE 37: PDF Accessibility Extraction
 *
 * Extracts limited accessibility information from PDFs.
 * Note: PDF accessibility analysis is inherently limited compared to HTML.
 */

import { getMeta, getDocumentProxy } from 'unpdf';
import { createLogger, Timer } from '@/lib/logger';
import type { PDFAccessibilityInfo } from './types';

const logger = createLogger('accessibility-pdf');

/**
 * Extract accessibility metadata from PDF
 *
 * Note: This is a best-effort extraction. Full PDF accessibility
 * testing requires specialized tools like PAC 3 or Adobe Acrobat Pro.
 */
export async function extractPDFAccessibility(buffer: Buffer): Promise<PDFAccessibilityInfo> {
  const timer = new Timer();
  logger.info('Extracting accessibility info from PDF', { bufferSize: buffer.length });

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { info } = await getMeta(pdf, { parseDates: false });

    // Check for tagged PDF (basic indicator of accessibility effort)
    const isTagged = info?.Tagged === 'yes' || info?.Tagged === true;

    // Check for language specification
    const language = info?.Language as string | undefined;

    // Note: Full PDF/UA compliance detection requires specialized tools
    // This is a heuristic based on available metadata
    const pdfUACompliant = isTagged && !!language;

    // Check for outline/bookmarks (helps navigation)
    const outline = await pdf.getOutline();
    const hasOutline = outline !== null && outline.length > 0;

    const result: PDFAccessibilityInfo = {
      isTagged,
      pdfUACompliant,
      language,
      hasOutline,
      imageAltTextCount: 0, // Would require deep parsing of content streams
      note: 'PDF accessibility analysis is limited. HTML migration inherently improves accessibility by providing semantic structure, keyboard navigation, and ARIA support.',
    };

    logger.operationComplete('PDF accessibility extraction', timer.elapsed(), {
      isTagged,
      hasOutline,
      language: language || 'not specified',
    });

    return result;
  } catch (error) {
    logger.error('PDF accessibility extraction failed', error as Error);
    throw error;
  }
}

/**
 * Fetch PDF and extract accessibility info
 */
export async function fetchAndExtractPDFAccessibility(pdfUrl: string): Promise<PDFAccessibilityInfo> {
  logger.info('Fetching PDF for accessibility extraction', { pdfUrl });

  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return extractPDFAccessibility(buffer);
}
