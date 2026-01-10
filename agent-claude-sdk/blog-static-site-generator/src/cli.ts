#!/usr/bin/env node
/**
 * CLI Entry Point
 * Command-line interface for the blog static site generator
 */

import dotenv from 'dotenv';
import { generateStaticSite } from './generator.js';

dotenv.config();

async function main() {
  console.log('🌐 Blog Static Site Generator');
  console.log('==============================\n');

  // Get spec file from args
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log('Usage: npm run generate <spec.json|spec.md>');
    console.log('\nExample: npm run generate input/spec.md');
    console.log('\nOptions:');
    console.log('  --help, -h    Show this help message');
    console.log('\nEnvironment Variables:');
    console.log('  ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN  Required for AI content generation');
    console.log('  MODEL                                          Optional model override (default: claude-sonnet-4-5-20250929)\n');
    process.exit(0);
  }

  const specPath = args[0];

  // Verify API key
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    console.error('❌ Error: Missing API key');
    console.error('   Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env file\n');
    process.exit(1);
  }

  // Generate site
  console.log(`📖 Reading spec: ${specPath}\n`);
  const startTime = Date.now();

  const result = await generateStaticSite(specPath);

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Display results
  console.log('\n' + '='.repeat(60));

  if (result.success) {
    console.log('✅ Success!');
    console.log(`   Duration: ${duration}s`);

    if (result.deployedUrl) {
      console.log(`   Deployed: ${result.deployedUrl}`);
    }

    console.log('\nGeneration Log:');
    result.messages.forEach((msg) => {
      if (!msg.trim()) {
        console.log('');
      } else {
        console.log(`   ${msg}`);
      }
    });
  } else {
    console.log('❌ Failed');
    console.log(`   Error: ${result.error}`);
    console.log(`   Duration: ${duration}s`);

    if (result.messages.length > 0) {
      console.log('\nExecution Log:');
      result.messages.forEach((msg) => {
        if (!msg.trim()) {
          console.log('');
        } else {
          console.log(`   ${msg}`);
        }
      });
    }
  }

  console.log('='.repeat(60) + '\n');

  process.exit(result.success ? 0 : 1);
}

main().catch((error) => {
  console.error('\n❌ Unexpected error:', error);
  process.exit(1);
});
