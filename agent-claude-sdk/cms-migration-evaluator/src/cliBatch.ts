#!/usr/bin/env node

/**
 * CLI for Batch Evaluation - Phase 4
 *
 * Usage:
 *   npm run evaluate:batch input/test-migration.json
 *   npm run evaluate:batch examples/batch-migrations.json
 */

import { evaluateBatch, BatchInput } from './batchEvaluator.js';
import fs from 'fs/promises';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Error: No batch input file specified\n');
    console.log('Usage:');
    console.log('  npm run evaluate:batch <batch-input-file.json>\n');
    console.log('Examples:');
    console.log('  npm run evaluate:batch input/test-migration.json');
    console.log('  npm run evaluate:batch examples/batch-migrations.json\n');
    process.exit(1);
  }

  const batchInputPath = path.resolve(args[0]);

  try {
    // Read batch input file
    const batchInputContent = await fs.readFile(batchInputPath, 'utf-8');
    const batchInput: BatchInput = JSON.parse(batchInputContent);

    // Validate batch input
    if (!batchInput.batchName) {
      throw new Error('Batch input must have a "batchName" field');
    }

    if (!batchInput.entries || !Array.isArray(batchInput.entries)) {
      throw new Error('Batch input must have an "entries" array');
    }

    if (batchInput.entries.length === 0) {
      throw new Error('Batch input must have at least one entry');
    }

    if (batchInput.entries.length > 50) {
      console.warn('⚠️  Warning: Batch has more than 50 entries. This may take a long time.\n');
    }

    // Validate each entry
    for (const entry of batchInput.entries) {
      if (!entry.id) {
        throw new Error('Each entry must have an "id" field');
      }
      if (!entry.pdfPath) {
        throw new Error(`Entry "${entry.id}" is missing "pdfPath" field`);
      }
      if (!entry.migratedUrl) {
        throw new Error(`Entry "${entry.id}" is missing "migratedUrl" field`);
      }
    }

    // Run batch evaluation
    const batchSummary = await evaluateBatch(batchInput);

    // Exit with failure code if any evaluations failed
    if (batchSummary.failureCount > 0) {
      console.error(`\n⚠️  Warning: ${batchSummary.failureCount} evaluation(s) failed\n`);
      process.exit(1);
    }

    console.log(`\n✅ All evaluations completed successfully!\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Batch Evaluation Failed:`);
    console.error(error instanceof Error ? error.message : 'Unknown error');
    console.error('');
    process.exit(1);
  }
}

main();
