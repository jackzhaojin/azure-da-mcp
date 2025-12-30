/**
 * PDF Structure Extraction
 *
 * Extracts structural information from PDFs for comparison
 * with migrated HTML pages.
 *
 * Phase 36: Structure Agent Dual-Input Support
 */

import { extractText, getMeta, getDocumentProxy } from 'unpdf';
import { createLogger, Timer } from '@/lib/logger';
import type { PDFStructure } from './types';

const logger = createLogger('structure-pdf');

/**
 * Heuristic heading detection from PDF text
 *
 * PDF doesn't have semantic structure, so we use heuristics:
 * - Short lines (< 100 chars)
 * - Start with capital letter
 * - Don't end with punctuation
 * - All caps or title case
 */
export function extractHeadingsFromText(text: string): Array<{ text: string; level: number }> {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const headings: Array<{ text: string; level: number }> = [];

  for (const line of lines) {
    // Skip if too long (likely paragraph)
    if (line.length > 100) continue;

    // Skip if ends with common sentence punctuation
    if (/[.,:;?!]$/.test(line)) continue;

    // Must start with capital letter
    if (!/^[A-Z]/.test(line)) continue;

    // Determine level based on formatting heuristics
    let level = 2; // Default to H2

    // All caps = likely H1 or H2
    if (line === line.toUpperCase() && line.length > 3) {
      level = 1;
    }
    // Very short (< 30 chars) and title case = likely heading
    else if (line.length < 30) {
      level = 2;
    }
    // Longer = likely H3 or H4
    else {
      level = 3;
    }

    headings.push({ text: line, level });
  }

  // Limit to reasonable number of headings
  return headings.slice(0, 50);
}

/**
 * Extract structure from PDF buffer
 */
export async function extractPDFStructure(buffer: Buffer): Promise<PDFStructure> {
  const timer = new Timer();
  logger.info('Extracting structure from PDF', { bufferSize: buffer.length });

  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const { info } = await getMeta(pdf, { parseDates: false });

    const headingLevels = extractHeadingsFromText(text);
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);

    const result: PDFStructure = {
      headings: headingLevels.map(h => h.text),
      headingLevels,
      paragraphCount: paragraphs.length,
      wordCount: words.length,
      metadata: info ? {
        title: info.Title,
        author: info.Author,
      } : undefined,
    };

    logger.operationComplete('PDF structure extraction', timer.elapsed(), {
      headings: result.headings.length,
      paragraphs: result.paragraphCount,
      words: result.wordCount,
    });

    return result;
  } catch (error) {
    logger.error('PDF structure extraction failed', error as Error);
    throw error;
  }
}

/**
 * Fetch PDF and extract structure
 */
export async function fetchAndExtractPDFStructure(pdfUrl: string): Promise<PDFStructure> {
  const timer = new Timer();
  logger.info('Fetching PDF for structure extraction', { pdfUrl });

  const response = await fetch(pdfUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch PDF: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  logger.operationComplete('PDF fetch', timer.elapsed(), { bufferSize: buffer.length });

  return extractPDFStructure(buffer);
}
