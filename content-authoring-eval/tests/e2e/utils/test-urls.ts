/**
 * Test data based on demo-mixed-sources.json
 */

import * as fs from 'fs';
import * as path from 'path';

// Load demo batch data
const demoDataPath = path.join(process.cwd(), 'public', 'samples', 'demo-mixed-sources.json');
const demoData = JSON.parse(fs.readFileSync(demoDataPath, 'utf8'));

// Extract test cases from demo data
const pdfSourceExample1 = demoData.pages.find((p: { id: string }) => p.id === 'pdf-source-example');
const htmlSourceExample = demoData.pages.find((p: { id: string }) => p.id === 'html-source-example');
const pdfSourceExample2 = demoData.pages.find((p: { id: string }) => p.id === 'pdf-source-example-2');

export const TEST_CASES = {
  // PDF → HTML: AI-Powered Package Tracking
  pdfToHtml1: {
    id: pdfSourceExample1.id,
    title: pdfSourceExample1.title,
    sourceUrl: pdfSourceExample1.sourceUrl,
    sourceType: pdfSourceExample1.sourceType,
    webUrl: pdfSourceExample1.webUrl,
  },

  // HTML → HTML: W3C Homepage
  htmlToHtml: {
    id: htmlSourceExample.id,
    title: htmlSourceExample.title,
    sourceUrl: htmlSourceExample.sourceUrl,
    sourceType: htmlSourceExample.sourceType,
    webUrl: htmlSourceExample.webUrl,
  },

  // PDF → HTML: Blockchain Supply Chain
  pdfToHtml2: {
    id: pdfSourceExample2.id,
    title: pdfSourceExample2.title,
    sourceUrl: pdfSourceExample2.sourceUrl,
    sourceType: pdfSourceExample2.sourceType,
    webUrl: pdfSourceExample2.webUrl,
  },
};

// Legacy TEST_URLS for backward compatibility (deprecated - use TEST_CASES instead)
export const TEST_URLS = {
  migratedHtml: TEST_CASES.htmlToHtml.webUrl,
  sourceHtml: TEST_CASES.htmlToHtml.sourceUrl,
  sourcePdf: TEST_CASES.pdfToHtml1.sourceUrl,
  sourcePdfSmall: TEST_CASES.pdfToHtml1.sourceUrl,
  simple: TEST_CASES.htmlToHtml.webUrl,
};

export const TEST_CONFIG = {
  // Timeouts
  deterministicTimeout: 30000,  // 30s
  agenticTimeout: 120000,       // 2 minutes

  // Expected score ranges (sanity checks)
  minValidScore: 0,
  maxValidScore: 100,

  // Minimum findings for agentic (proves it ran)
  minAgenticFindings: 0, // Some pages may have 0 issues
};
