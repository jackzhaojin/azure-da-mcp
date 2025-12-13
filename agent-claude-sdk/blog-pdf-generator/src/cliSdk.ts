#!/usr/bin/env node
/**
 * Blog PDF Generator CLI - Agent SDK Version
 * Command-line interface using Claude Agent SDK with autonomous tool selection
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateBlogPdfWithAgent, type BlogPdfSpec } from './agentSdk.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

async function main() {
  console.log('📄 Blog PDF Generator (Agent SDK)');
  console.log('==================================\n');

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
    console.log('Usage: npm run agent <input.json>');
    console.log('   or: npm run dev:agent <input.json>\n');
    console.log('Example: npm run dev:agent examples/sample-blog-phase2.json\n');
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

    // Set up output directory
    const outputDir = path.join(process.cwd(), 'output');
    await fs.mkdir(outputDir, { recursive: true });

    console.log('🤖 Starting Agent SDK...');
    console.log('   (Claude will autonomously select tools and workflow)');
    console.log('   (This may take 15-30 seconds)\n');

    // Generate PDF using Agent SDK
    const startTime = Date.now();
    const result = await generateBlogPdfWithAgent(spec, outputDir);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    // Display results
    console.log('\n' + '='.repeat(50));

    if (result.success) {
      console.log('✅ Success!');
      console.log(`   PDF: ${result.pdfPath}`);
      console.log(`   Duration: ${duration}s\n`);

      // Show agent messages
      if (result.messages.length > 0) {
        console.log('📝 Agent Log:');
        result.messages.forEach((msg) => {
          console.log(`   ${msg}`);
        });
      }

      if (result.validation) {
        console.log('\n✓ Validation Results:');
        console.log(`   ${JSON.stringify(result.validation, null, 2)}`);
      }
    } else {
      console.log('❌ Failed');
      console.log(`   Error: ${result.error}`);
      console.log(`   Duration: ${duration}s\n`);

      if (result.messages.length > 0) {
        console.log('📝 Agent Log:');
        result.messages.forEach((msg) => {
          console.log(`   ${msg}`);
        });
      }
    }

    console.log('='.repeat(50) + '\n');
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
