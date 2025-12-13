/**
 * PDF Generation Tool
 * Uses Puppeteer to convert HTML to PDF
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

export interface GeneratePdfInput {
  htmlContent: string;
  outputPath: string;
  title?: string;
}

export interface GeneratePdfResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
  metadata?: {
    fileSize: number;
    generatedAt: string;
  };
}

export async function generatePdf(
  input: GeneratePdfInput
): Promise<GeneratePdfResult> {
  let browser;

  try {
    // Ensure output directory exists
    const outputDir = path.dirname(input.outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    // Launch headless browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Set content and wait for everything to load
    await page.setContent(input.htmlContent, {
      waitUntil: ['networkidle0', 'domcontentloaded'],
    });

    // Generate PDF with professional settings
    await page.pdf({
      path: input.outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    await browser.close();

    // Get file stats
    const stats = await fs.stat(input.outputPath);

    return {
      success: true,
      pdfPath: input.outputPath,
      metadata: {
        fileSize: stats.size,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (browser) {
      await browser.close();
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error generating PDF',
    };
  }
}

// Tool definition for Agent SDK
export const generatePdfTool = {
  name: 'generate_pdf',
  description: 'Generates a PDF file from HTML content using Puppeteer. Returns the path to the generated PDF and metadata about the file.',
  parameters: {
    type: 'object',
    properties: {
      htmlContent: {
        type: 'string',
        description: 'The HTML content to convert to PDF',
      },
      outputPath: {
        type: 'string',
        description: 'The absolute path where the PDF should be saved',
      },
      title: {
        type: 'string',
        description: 'Optional title for the PDF document',
      },
    },
    required: ['htmlContent', 'outputPath'],
  },
  execute: generatePdf,
};
