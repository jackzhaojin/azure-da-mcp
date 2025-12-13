#!/usr/bin/env node

/**
 * Blog PDF Generator - Phase 4: Bulk Generation CLI
 *
 * Usage:
 *   npm run generate:bulk <specs-directory> [options]
 *
 * Examples:
 *   npm run generate:bulk output/specs
 *   npm run generate:bulk output/specs --concurrency 10
 *   npm run generate:bulk output/specs --output output/bulk-pdfs
 */

import { generateBulkPdfs, saveResultsReport } from './bulkOrchestrator.js';
import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface CliArgs {
  specsDirectory: string;
  outputDirectory: string;
  concurrency: number;
  saveReport: boolean;
}

/**
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(`
❌ Error: No specs directory provided

Usage:
  npm run generate:bulk <specs-directory> [options]

Examples:
  npm run generate:bulk output/specs
  npm run generate:bulk output/specs --concurrency 10
  npm run generate:bulk output/specs --output output/bulk-pdfs

Options:
  --output <dir>         Output directory (default: output/bulk-pdfs)
  --concurrency <num>    Number of parallel workers (default: 5, from .env or config)
  --no-report           Skip saving results report
`);
    process.exit(1);
  }

  // First argument is specs directory
  const specsDirectory = path.resolve(args[0]);

  // Parse options
  let outputDirectory = path.resolve('output/bulk-pdfs');
  let concurrency = parseInt(process.env.BULK_CONCURRENCY || '5', 10);
  let saveReport = true;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--output' && i + 1 < args.length) {
      outputDirectory = path.resolve(args[i + 1]);
      i++;
    } else if (arg === '--concurrency' && i + 1 < args.length) {
      concurrency = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--no-report') {
      saveReport = false;
    }
  }

  return {
    specsDirectory,
    outputDirectory,
    concurrency,
    saveReport,
  };
}

/**
 * Main CLI function
 */
async function main() {
  console.log(`
┌─────────────────────────────────────────────┐
│  Blog PDF Generator - Bulk Orchestration    │
│  Phase 4: Deterministic Bulk PDF Generation │
└─────────────────────────────────────────────┘
`);

  const cliArgs = parseArgs();

  // Validate specs directory exists
  try {
    const stat = await fs.stat(cliArgs.specsDirectory);
    if (!stat.isDirectory()) {
      throw new Error(`${cliArgs.specsDirectory} is not a directory`);
    }
  } catch (error: any) {
    console.error(`❌ Error: Specs directory not found: ${cliArgs.specsDirectory}`);
    process.exit(1);
  }

  try {
    // Run bulk generation
    const result = await generateBulkPdfs({
      specsDirectory: cliArgs.specsDirectory,
      outputDirectory: cliArgs.outputDirectory,
      concurrency: cliArgs.concurrency,
      verbose: true,
    });

    // Save results report if requested
    if (cliArgs.saveReport) {
      const reportPath = path.join(
        cliArgs.outputDirectory,
        `bulk-generation-report-${Date.now()}.json`
      );
      await saveResultsReport(result, reportPath);
    }

    // Exit with error code if any PDFs failed
    if (result.failed > 0) {
      console.log(`\n⚠️  Warning: ${result.failed} PDF(s) failed to generate`);
      process.exit(1);
    }

    console.log(`\n✅ All PDFs generated successfully!`);
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run CLI
main();
