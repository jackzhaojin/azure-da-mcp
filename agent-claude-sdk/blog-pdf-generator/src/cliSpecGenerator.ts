#!/usr/bin/env node
/**
 * CLI for Blog Spec Generation - Agent SDK Version
 * Generates BlogPdfSpec JSON files from configuration
 */

import { generateBlogSpecs, validateAllSpecs } from './specGenerator.js';
import path from 'path';
import fs from 'fs/promises';

async function main() {
  const args = process.argv.slice(2);

  // Help message
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Blog Spec Generator - Phase 3

Generate BlogPdfSpec JSON files from configuration using Claude Agent SDK.

Usage:
  npm run generate:specs [config-file]
  npm run generate:specs                  # Uses default config
  npm run generate:specs my-config.json   # Uses custom config

Options:
  --help, -h                Show this help message
  --validate, -v            Validate generated specs after creation

Examples:
  # Generate with default postal services config
  npm run generate:specs

  # Generate with custom config
  npm run generate:specs config/my-theme.json

  # Generate and validate
  npm run generate:specs --validate

Default Config: config/default-postal-tech.json
Output: generated-specs/ (configurable in config file)
    `);
    process.exit(0);
  }

  // Determine config path
  let configPath: string;
  const configArg = args.find(arg => !arg.startsWith('--'));

  if (configArg) {
    configPath = path.resolve(configArg);
  } else {
    // Use default config
    configPath = path.resolve('config/default-postal-tech.json');
  }

  const shouldValidate = args.includes('--validate') || args.includes('-v');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Blog Spec Generator - Phase 3');
  console.log('  Agent SDK: Claude generates blog specs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check if config exists
  try {
    await fs.access(configPath);
    console.log(`✓ Config file: ${configPath}`);
  } catch (error) {
    console.error(`✗ Config file not found: ${configPath}`);
    console.error('  Use --help for usage information');
    process.exit(1);
  }

  // Generate specs
  console.log('\n🤖 Starting Agent SDK spec generation...\n');

  const startTime = Date.now();

  try {
    const result = await generateBlogSpecs(configPath);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Generation Results');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (result.success) {
      console.log(`✓ Success: ${result.specsGenerated} specs generated`);
      console.log(`  Duration: ${duration}s`);
      console.log(`  Output: ${result.outputDirectory}`);

      console.log('\n  Generated files:');
      result.files.forEach((file, index) => {
        console.log(`    ${index + 1}. ${file}`);
      });

      // Validation
      if (shouldValidate) {
        console.log('\n🔍 Validating generated specs...\n');

        const validation = await validateAllSpecs(result.outputDirectory);

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('  Validation Results');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log(`  Total files: ${validation.totalFiles}`);
        console.log(`  Valid specs: ${validation.validFiles}`);
        console.log(`  Invalid specs: ${validation.totalFiles - validation.validFiles}`);

        if (Object.keys(validation.errors).length > 0) {
          console.log('\n  Validation Errors:');
          for (const [file, errors] of Object.entries(validation.errors)) {
            console.log(`\n    ${file}:`);
            errors.forEach(err => console.log(`      - ${err}`));
          }
        } else {
          console.log('\n  ✓ All specs are valid!');
        }
      }

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  Next Step: Phase 4');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      console.log('  Generate PDFs from these specs:');
      console.log(`    npm run bulk:generate ${result.outputDirectory}\n`);
    } else {
      console.log(`✗ Failed: ${result.error}`);
      console.log(`  Duration: ${duration}s`);

      if (result.messages.length > 0) {
        console.log('\n  Agent Messages:');
        result.messages.forEach(msg => console.log(`    ${msg}`));
      }

      process.exit(1);
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error(`  Duration: ${duration}s`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
