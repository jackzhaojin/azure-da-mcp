/**
 * Content Fidelity Agent - Deterministic Analysis
 *
 * Extracts text from PDFs and webpages, performs text diff comparison,
 * and calculates similarity scores.
 *
 * Using unpdf for modern ESM-compatible PDF parsing (replaced pdf-parse)
 */

import { extractText, getMeta, getDocumentProxy } from 'unpdf';
import * as cheerio from 'cheerio';
import { createLogger, Timer } from '@/lib/logger';
import type { PDFContent, WebpageContent, TextDiff, ContentMetrics } from './types';

const logger = createLogger('content');

/**
 * Fetch PDF from URL and extract text content
 */
async function fetchPDF(pdfUrl: string): Promise<Buffer> {
  const timer = new Timer();
  logger.info('Fetching PDF from URL', { pdfUrl });

  try {
    const response = await fetch(pdfUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logger.operationComplete('PDF fetch', timer.elapsed(), {
      url: pdfUrl,
      size: buffer.length,
      statusCode: response.status,
    });

    return buffer;
  } catch (error) {
    logger.error('Failed to fetch PDF', error as Error, { pdfUrl, duration: timer.elapsed() });
    throw error;
  }
}

/**
 * Extract text content from PDF buffer using unpdf
 */
async function extractPDFContent(buffer: Buffer): Promise<PDFContent> {
  const timer = new Timer();
  logger.info('Extracting text from PDF', { bufferSize: buffer.length });

  try {
    // Load PDF document
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const numPages = pdf.numPages;

    logger.debug('PDF loaded successfully', {
      numPages,
    });

    // Extract metadata
    const { info } = await getMeta(pdf, { parseDates: false });

    // Extract text with pages merged
    const { text } = await extractText(pdf, { mergePages: true });

    logger.debug('PDF text extracted', {
      textLength: text.length,
    });

    // Extract headings (simple heuristic: lines that are short and end without punctuation)
    const lines = text.split('\n').map((line: string) => line.trim()).filter((line: string) => line.length > 0);
    const headings = lines.filter((line: string) =>
      line.length < 100 &&
      !line.endsWith('.') &&
      !line.endsWith(',') &&
      !line.endsWith(';') &&
      /^[A-Z]/.test(line)
    );

    // Count paragraphs (groups of lines separated by blank lines)
    const paragraphs = text.split(/\n\s*\n/).filter((p: string) => p.trim().length > 0);
    const words = text.split(/\s+/).filter((w: string) => w.length > 0);

    const pdfContent: PDFContent = {
      text,
      numPages,
      metadata: info ? {
        title: info.Title,
        author: info.Author,
        subject: info.Subject,
        creator: info.Creator,
        producer: info.Producer,
        creationDate: info.CreationDate,
        modDate: info.ModDate,
      } : undefined,
      headings,
      paragraphCount: paragraphs.length,
      wordCount: words.length,
      charCount: text.length,
    };

    logger.operationComplete('PDF text extraction', timer.elapsed(), {
      numPages: pdfContent.numPages,
      headings: pdfContent.headings.length,
      paragraphs: pdfContent.paragraphCount,
      words: pdfContent.wordCount,
      chars: pdfContent.charCount,
    });

    return pdfContent;
  } catch (error) {
    logger.error('Failed to extract PDF content', error as Error, { bufferSize: buffer.length, duration: timer.elapsed() });
    throw error;
  }
}

/**
 * Fetch HTML from URL
 */
async function fetchHTML(url: string): Promise<string> {
  const timer = new Timer();
  logger.debug('Fetching HTML', { url });

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    logger.operationComplete('HTML fetch', timer.elapsed(), {
      url,
      htmlLength: html.length,
      statusCode: response.status,
    });

    return html;
  } catch (error) {
    logger.error('Failed to fetch HTML', error as Error, { url, duration: timer.elapsed() });
    throw error;
  }
}

/**
 * Extract visible text content from HTML
 */
function extractWebpageContent(html: string): WebpageContent {
  const timer = new Timer();
  logger.debug('Extracting text from HTML', { htmlLength: html.length });

  try {
    const $ = cheerio.load(html);

    // Remove script, style, nav, footer elements
    $('script, style, nav, footer, iframe, noscript').remove();

    // Extract headings
    const headings: string[] = [];
    $('h1, h2, h3, h4, h5, h6').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text) {
        headings.push(text);
      }
    });

    // Extract visible text from main content area
    const mainContent = $('main').length > 0 ? $('main') : $('body');
    const text = mainContent.text()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Count paragraphs
    const paragraphs = mainContent.find('p');
    const paragraphCount = paragraphs.length;

    // Count words and characters
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const charCount = text.length;

    const webpageContent: WebpageContent = {
      text,
      headings,
      paragraphCount,
      wordCount,
      charCount,
    };

    logger.operationComplete('Webpage text extraction', timer.elapsed(), {
      headings: headings.length,
      paragraphs: paragraphCount,
      words: wordCount,
      chars: charCount,
    });

    return webpageContent;
  } catch (error) {
    logger.error('Failed to extract webpage content', error as Error, { htmlLength: html.length, duration: timer.elapsed() });
    throw error;
  }
}

/**
 * Calculate text similarity using Jaccard similarity on words
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));

  const words1Array = Array.from(words1);
  const words2Array = Array.from(words2);

  const intersection = new Set(words1Array.filter(word => words2.has(word)));
  const union = new Set([...words1Array, ...words2Array]);

  if (union.size === 0) {
    return 0;
  }

  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Perform text diff analysis
 */
function performTextDiff(pdfContent: PDFContent, webpageContent: WebpageContent): TextDiff {
  const timer = new Timer();
  logger.info('Calculating text diff', {
    pdfWords: pdfContent.wordCount,
    webpageWords: webpageContent.wordCount,
  });

  try {
    // Split into sentences for diff analysis
    const pdfSentences = pdfContent.text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    const webpageSentences = webpageContent.text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    // Normalize for comparison (lowercase, remove extra whitespace)
    const normalizeSentence = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    const pdfNormalized = pdfSentences.map(normalizeSentence);
    const webpageNormalized = webpageSentences.map(normalizeSentence);

    // Find missing content (in PDF but not in webpage)
    const missing = pdfSentences.filter((sentence, index) =>
      !webpageNormalized.includes(pdfNormalized[index])
    );

    // Find extra content (in webpage but not in PDF)
    const extra = webpageSentences.filter((sentence, index) =>
      !pdfNormalized.includes(webpageNormalized[index])
    );

    // Find common content
    const common = pdfSentences.filter((sentence, index) =>
      webpageNormalized.includes(pdfNormalized[index])
    );

    // Calculate similarity score
    const similarityScore = calculateSimilarity(pdfContent.text, webpageContent.text);

    const diff: TextDiff = {
      missing: missing.slice(0, 20), // Limit to top 20 for response size
      extra: extra.slice(0, 20),
      common: common.slice(0, 20),
      similarityScore,
    };

    logger.operationComplete('Text diff calculation', timer.elapsed(), {
      missing: missing.length,
      extra: extra.length,
      common: common.length,
      similarity: similarityScore,
    });

    return diff;
  } catch (error) {
    logger.error('Failed to calculate text diff', error as Error, { duration: timer.elapsed() });
    throw error;
  }
}

/**
 * Calculate content fidelity score based on diff analysis
 */
function calculateContentScore(diff: TextDiff, pdfContent: PDFContent, webpageContent: WebpageContent): number {
  const { similarityScore } = diff;

  // Adjust score based on word count difference
  const wordCountDiff = Math.abs(pdfContent.wordCount - webpageContent.wordCount);
  const wordCountPenalty = Math.min((wordCountDiff / pdfContent.wordCount) * 20, 15);

  // Adjust score based on heading match
  const pdfHeadingSet = new Set(pdfContent.headings.map((h: string) => h.toLowerCase()));
  const webpageHeadingSet = new Set(webpageContent.headings.map((h: string) => h.toLowerCase()));
  const pdfHeadingsArray = Array.from(pdfHeadingSet);
  const headingMatch = pdfHeadingsArray.filter((h: string) => webpageHeadingSet.has(h)).length;
  const headingPenalty = Math.max(0, (pdfContent.headings.length - headingMatch) * 2);

  const finalScore = Math.max(0, Math.round(similarityScore - wordCountPenalty - headingPenalty));

  logger.debug('Content score calculated', {
    similarityScore,
    wordCountPenalty,
    headingPenalty,
    finalScore,
  });

  return finalScore;
}

/**
 * Perform text diff analysis for HTML→HTML comparison
 */
function performTextDiffHTML(sourceContent: WebpageContent, migratedContent: WebpageContent): TextDiff {
  const timer = new Timer();
  logger.info('Calculating HTML→HTML text diff', {
    sourceWords: sourceContent.wordCount,
    migratedWords: migratedContent.wordCount,
  });

  try {
    // Split into sentences for diff analysis
    const sourceSentences = sourceContent.text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    const migratedSentences = migratedContent.text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);

    // Normalize for comparison (lowercase, remove extra whitespace)
    const normalizeSentence = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    const sourceNormalized = sourceSentences.map(normalizeSentence);
    const migratedNormalized = migratedSentences.map(normalizeSentence);

    // Find missing content (in source but not in migrated)
    const missing = sourceSentences.filter((sentence, index) =>
      !migratedNormalized.includes(sourceNormalized[index])
    );

    // Find extra content (in migrated but not in source)
    const extra = migratedSentences.filter((sentence, index) =>
      !sourceNormalized.includes(migratedNormalized[index])
    );

    // Find common content
    const common = sourceSentences.filter((sentence, index) =>
      migratedNormalized.includes(sourceNormalized[index])
    );

    // Calculate similarity score
    const similarityScore = calculateSimilarity(sourceContent.text, migratedContent.text);

    const diff: TextDiff = {
      missing: missing.slice(0, 20), // Limit to top 20 for response size
      extra: extra.slice(0, 20),
      common: common.slice(0, 20),
      similarityScore,
    };

    logger.operationComplete('HTML→HTML text diff calculation', timer.elapsed(), {
      missing: missing.length,
      extra: extra.length,
      common: common.length,
      similarity: similarityScore,
    });

    return diff;
  } catch (error) {
    logger.error('Failed to calculate HTML→HTML text diff', error as Error, { duration: timer.elapsed() });
    throw error;
  }
}

/**
 * Calculate content fidelity score for HTML→HTML comparison
 */
function calculateContentScoreHTML(diff: TextDiff, sourceContent: WebpageContent, migratedContent: WebpageContent): number {
  const { similarityScore } = diff;

  // Adjust score based on word count difference
  const wordCountDiff = Math.abs(sourceContent.wordCount - migratedContent.wordCount);
  const wordCountPenalty = Math.min((wordCountDiff / sourceContent.wordCount) * 20, 15);

  // Adjust score based on heading match
  const sourceHeadingSet = new Set(sourceContent.headings.map((h: string) => h.toLowerCase()));
  const migratedHeadingSet = new Set(migratedContent.headings.map((h: string) => h.toLowerCase()));
  const sourceHeadingsArray = Array.from(sourceHeadingSet);
  const headingMatch = sourceHeadingsArray.filter((h: string) => migratedHeadingSet.has(h)).length;
  const headingPenalty = Math.max(0, (sourceContent.headings.length - headingMatch) * 2);

  const finalScore = Math.max(0, Math.round(similarityScore - wordCountPenalty - headingPenalty));

  logger.debug('HTML→HTML content score calculated', {
    similarityScore,
    wordCountPenalty,
    headingPenalty,
    finalScore,
  });

  return finalScore;
}

/**
 * Analyze content fidelity between source (PDF or HTML) and migrated webpage
 *
 * @param sourceUrlOrPdf - Either a PDF URL (.pdf) or HTML URL (source page)
 * @param migratedUrl - The migrated webpage URL
 * @returns ContentMetrics with comparison results
 */
export async function analyzeContent(sourceUrlOrPdf: string, migratedUrl: string): Promise<ContentMetrics> {
  const timer = new Timer();
  const isPDF = sourceUrlOrPdf.toLowerCase().endsWith('.pdf');
  const sourceType = isPDF ? 'PDF' : 'HTML';

  logger.info(`Starting deterministic content analysis (${sourceType}→HTML)`, {
    sourceUrl: sourceUrlOrPdf,
    migratedUrl,
    sourceType,
  });

  try {
    let pdfContent: PDFContent | undefined;
    let sourceContent: WebpageContent;
    let webpageContent: WebpageContent;
    let diff: TextDiff;
    let score: number;

    if (isPDF) {
      // PDF→HTML comparison (existing logic)
      const pdfBuffer = await fetchPDF(sourceUrlOrPdf);
      pdfContent = await extractPDFContent(pdfBuffer);

      const html = await fetchHTML(migratedUrl);
      webpageContent = extractWebpageContent(html);

      diff = performTextDiff(pdfContent, webpageContent);
      score = calculateContentScore(diff, pdfContent, webpageContent);
    } else {
      // HTML→HTML comparison (new logic)
      const sourceHtml = await fetchHTML(sourceUrlOrPdf);
      sourceContent = extractWebpageContent(sourceHtml);

      const migratedHtml = await fetchHTML(migratedUrl);
      webpageContent = extractWebpageContent(migratedHtml);

      diff = performTextDiffHTML(sourceContent, webpageContent);
      score = calculateContentScoreHTML(diff, sourceContent, webpageContent);

      // Create PDF-like structure for compatibility
      pdfContent = {
        text: sourceContent.text,
        headings: sourceContent.headings,
        numPages: 1, // N/A for HTML
        wordCount: sourceContent.wordCount,
        charCount: sourceContent.charCount,
        paragraphCount: sourceContent.paragraphCount,
        metadata: {
          title: 'HTML Source',
          author: '',
          subject: '',
          creationDate: '',
        },
      };
    }

    const metrics: ContentMetrics = {
      pdfUrl: sourceUrlOrPdf, // Keep field name for backward compatibility
      migratedUrl,
      timestamp: new Date().toISOString(),
      pdfContent: pdfContent!,
      webpageContent,
      diff,
      score,
      metadata: {
        executedAt: new Date().toISOString(),
        durationMs: timer.elapsed(),
        toolsUsed: isPDF ? ['unpdf', 'cheerio'] : ['cheerio'],
      },
    };

    logger.operationComplete(`Deterministic content analysis (${sourceType}→HTML)`, timer.elapsed(), {
      sourceUrl: sourceUrlOrPdf,
      migratedUrl,
      score,
      sourceType,
    });

    return metrics;
  } catch (error) {
    logger.error('Content analysis failed', error as Error, {
      sourceUrl: sourceUrlOrPdf,
      migratedUrl,
      sourceType,
      duration: timer.elapsed(),
    });
    throw error;
  }
}
