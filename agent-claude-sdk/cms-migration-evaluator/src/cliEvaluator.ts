#!/usr/bin/env node

/**
 * CLI for CMS Migration Evaluator - Phase 1
 * Usage: npm run evaluate <input-file.json>
 */

import { evaluateMigration } from './evaluator.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface InputFile {
  pdfPath: string;
  migratedUrl: string;
  outputDir?: string;
  outputFolderName?: string; // Optional name for the output folder
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: npm run evaluate <input-file.json>');
    console.error('');
    console.error('Example input file:');
    console.error(JSON.stringify({
      pdfPath: "input/pdfs/ai-powered-package-tracking-2025.pdf",
      migratedUrl: "https://main--da-live-postal-2025-07--jackzhaojin.aem.page/migration-batch-2025-12-13/ai-powered-package-tracking"
    }, null, 2));
    process.exit(1);
  }

  const inputFilePath = args[0];

  try {
    // Read input file
    const inputContent = await fs.readFile(inputFilePath, 'utf-8');
    const input: InputFile = JSON.parse(inputContent);

    // Validate input
    if (!input.pdfPath) {
      console.error('Error: pdfPath is required in input file');
      process.exit(1);
    }

    if (!input.migratedUrl) {
      console.error('Error: migratedUrl is required in input file');
      process.exit(1);
    }

    // Resolve PDF path relative to current working directory
    const pdfPath = path.resolve(process.cwd(), input.pdfPath);

    console.log('CMS Migration Evaluator - Phase 1');
    console.log('==================================');
    console.log('');

    // Run evaluation
    const result = await evaluateMigration({
      pdfPath,
      migratedUrl: input.migratedUrl,
      outputDir: input.outputDir,
      outputFolderName: input.outputFolderName,
    });

    // Print messages
    result.messages.forEach(msg => console.log(msg));

    console.log('');
    if (result.success) {
      console.log('✓ Evaluation completed successfully');
      console.log(`📊 Report: ${result.reportPath}`);
      process.exit(0);
    } else {
      console.error('✗ Evaluation failed');
      if (result.error) {
        console.error(`Error: ${result.error}`);
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Fatal error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

main();
