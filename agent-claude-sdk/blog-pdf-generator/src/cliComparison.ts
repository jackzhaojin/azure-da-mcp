#!/usr/bin/env node
/**
 * Blog PDF Generator - Comparison CLI
 * Runs both deterministic and Agent SDK versions side-by-side
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateBlogPdf } from './agentDeterministic.js';
import { generateBlogPdfWithAgent, type BlogPdfSpec } from './agentSdk.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

async function main() {
  console.log('📊 Blog PDF Generator - Version Comparison');
  console.log('===========================================\n');

  // Verify authentication
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!oauthToken && !apiKey) {
    console.error('❌ Error: No authentication found');
    console.error('   Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in .env file\n');
    process.exit(1);
  }

  // Get input file from command line
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: npm run compare <input.json>');
    console.log('   or: npm run dev:compare <input.json>\n');
    console.log('Example: npm run dev:compare examples/sample-blog-phase2.json\n');
    process.exit(0);
  }

  const inputFile = args[0];

  try {
    // Read and parse input file
    console.log(`📖 Reading input from: ${inputFile}`);
    const inputContent = await fs.readFile(inputFile, 'utf-8');
    const spec: BlogPdfSpec = JSON.parse(inputContent);

    console.log(`   Title: ${spec.title}`);
    console.log(`   ID: ${spec.id}\n`);

    // Set up output directories
    const outputDirDeterministic = path.join(process.cwd(), 'output', 'deterministic');
    const outputDirAgent = path.join(process.cwd(), 'output', 'agent-sdk');
    await fs.mkdir(outputDirDeterministic, { recursive: true });
    await fs.mkdir(outputDirAgent, { recursive: true });

    console.log('=' .repeat(70));
    console.log('🚀 RUNNING DETERMINISTIC VERSION');
    console.log('=' .repeat(70) + '\n');

    // Run deterministic version
    const deterministicStart = Date.now();
    const deterministicResult = await generateBlogPdf(spec, outputDirDeterministic);
    const deterministicTime = Date.now() - deterministicStart;

    console.log('\n' + '-'.repeat(70));
    console.log(`Deterministic: ${deterministicResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`Time: ${(deterministicTime / 1000).toFixed(2)}s`);
    if (deterministicResult.pdfPath) {
      const stats = await fs.stat(deterministicResult.pdfPath);
      console.log(`PDF Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      console.log(`PDF Path: ${deterministicResult.pdfPath}`);
    }
    if (deterministicResult.error) {
      console.log(`Error: ${deterministicResult.error}`);
    }
    console.log('-'.repeat(70) + '\n\n');

    console.log('=' .repeat(70));
    console.log('🤖 RUNNING AGENT SDK VERSION');
    console.log('=' .repeat(70) + '\n');

    // Run Agent SDK version
    const agentStart = Date.now();
    const agentResult = await generateBlogPdfWithAgent(spec, outputDirAgent);
    const agentTime = Date.now() - agentStart;

    console.log('\n' + '-'.repeat(70));
    console.log(`Agent SDK: ${agentResult.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`Time: ${(agentTime / 1000).toFixed(2)}s`);
    if (agentResult.pdfPath) {
      const stats = await fs.stat(agentResult.pdfPath);
      console.log(`PDF Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      console.log(`PDF Path: ${agentResult.pdfPath}`);
    }
    if (agentResult.error) {
      console.log(`Error: ${agentResult.error}`);
    }
    console.log('-'.repeat(70) + '\n\n');

    // Comparison summary
    console.log('=' .repeat(70));
    console.log('📊 COMPARISON SUMMARY');
    console.log('=' .repeat(70) + '\n');

    console.log('Performance:');
    console.log(`  Deterministic: ${(deterministicTime / 1000).toFixed(2)}s`);
    console.log(`  Agent SDK:     ${(agentTime / 1000).toFixed(2)}s`);
    console.log(`  Difference:    ${((agentTime - deterministicTime) / 1000).toFixed(2)}s (${((agentTime / deterministicTime - 1) * 100).toFixed(1)}% ${agentTime > deterministicTime ? 'slower' : 'faster'})\n`);

    console.log('Results:');
    console.log(`  Deterministic: ${deterministicResult.success ? '✅' : '❌'}`);
    console.log(`  Agent SDK:     ${agentResult.success ? '✅' : '❌'}\n`);

    console.log('Key Differences:');
    console.log('  Deterministic:');
    console.log('    - Hardcoded workflow (predictable, fast)');
    console.log('    - No LLM usage (zero token cost)');
    console.log('    - Fixed tool execution order');
    console.log('');
    console.log('  Agent SDK:');
    console.log('    - Autonomous workflow (adaptive, intelligent)');
    console.log('    - Uses LLM for decision making (token cost applies)');
    console.log('    - Dynamic tool selection based on context');
    console.log('');

    console.log('Output Locations:');
    console.log(`  Deterministic: ${outputDirDeterministic}/`);
    console.log(`  Agent SDK:     ${outputDirAgent}/`);
    console.log('');

    console.log('=' .repeat(70) + '\n');
  } catch (error) {
    console.error('\n❌ Fatal Error:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);

      if (error.message.includes('ENOENT')) {
        console.error(`   File not found: ${inputFile}`);
      } else if (error.message.includes('JSON')) {
        console.error('   Invalid JSON in input file');
      }
    } else {
      console.error(`   ${error}`);
    }
    console.error('');
    process.exit(1);
  }
}

main();
