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
import { generateIndex, PdfMetadata } from './tools/generateIndex.js';
import { deployToAzure } from './tools/deployToAzure.js';
import { BlogPdfSpec } from './agentDeterministic.js';
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
  deploy: boolean;
  storageAccount?: string;
  resourceGroup?: string;
  containerName?: string;
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
  npm run generate:bulk output/specs --deploy
  npm run generate:bulk output/specs --concurrency 10 --deploy
  npm run generate:bulk output/specs --output custom/path

Options:
  --output <dir>         Output directory (default: output/pdf-run-YYYY-MM-DD-HHMMSS)
  --concurrency <num>    Number of parallel workers (default: 5, from .env)
  --deploy              Deploy to Azure after generation
  --storage <account>    Azure storage account (default: from .env AZURE_STORAGE_ACCOUNT)
  --resource-group <rg>  Azure resource group (default: from .env AZURE_RESOURCE_GROUP)
  --container <name>     Azure container name (default: contentsource)
  --no-report           Skip saving results report
`);
    process.exit(1);
  }

  // First argument is specs directory
  const specsDirectory = path.resolve(args[0]);

  // Generate timestamp for default output directory
  const timestamp = new Date().toISOString()
    .replace(/T/, '-')
    .replace(/\..+/, '')
    .replace(/:/g, '')
    .slice(0, 17); // YYYY-MM-DD-HHMMSS format

  // Parse options
  let outputDirectory = path.resolve(`output/pdf-run-${timestamp}`);
  let concurrency = parseInt(process.env.BULK_CONCURRENCY || '5', 10);
  let saveReport = true;
  let deploy = false;
  let storageAccount = process.env.AZURE_STORAGE_ACCOUNT;
  let resourceGroup = process.env.AZURE_RESOURCE_GROUP;
  let containerName = process.env.AZURE_CONTAINER || 'contentsource';

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
    } else if (arg === '--deploy') {
      deploy = true;
    } else if (arg === '--storage' && i + 1 < args.length) {
      storageAccount = args[i + 1];
      i++;
    } else if (arg === '--resource-group' && i + 1 < args.length) {
      resourceGroup = args[i + 1];
      i++;
    } else if (arg === '--container' && i + 1 < args.length) {
      containerName = args[i + 1];
      i++;
    }
  }

  return {
    specsDirectory,
    outputDirectory,
    concurrency,
    saveReport,
    deploy,
    storageAccount,
    resourceGroup,
    containerName,
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
    const reportPath = path.join(
      cliArgs.outputDirectory,
      `bulk-generation-report.json`
    );
    if (cliArgs.saveReport) {
      await saveResultsReport(result, reportPath);
    }

    // Generate index.html
    console.log(`\n📄 Generating index.html...`);
    const pdfsDir = path.join(cliArgs.outputDirectory, 'pdfs');
    const pdfFiles = await fs.readdir(pdfsDir);
    const pdfMetadata: PdfMetadata[] = [];

    // Load all spec files first and map by ID
    const allSpecs = await fs.readdir(cliArgs.specsDirectory);
    const specsByBasename: Map<string, BlogPdfSpec> = new Map();

    for (const specFile of allSpecs.filter(f => f.endsWith('.json'))) {
      try {
        const specPath = path.join(cliArgs.specsDirectory, specFile);
        const specContent = await fs.readFile(specPath, 'utf-8');
        const spec = JSON.parse(specContent) as BlogPdfSpec;
        // Map by the PDF filename (which is the ID)
        specsByBasename.set(`${spec.id}.pdf`, spec);
      } catch (err) {
        // Skip invalid specs
      }
    }

    // Load metadata from specs
    for (const pdfFile of pdfFiles.filter(f => f.endsWith('.pdf'))) {
      const spec = specsByBasename.get(pdfFile);

      try {
        if (!spec) {
          throw new Error('Spec not found');
        }

        const pdfPath = path.join(pdfsDir, pdfFile);
        const stats = await fs.stat(pdfPath);

        pdfMetadata.push({
          filename: pdfFile,
          title: spec.title,
          author: spec.metadata?.author,
          date: spec.metadata?.date,
          tags: spec.metadata?.tags,
          filePath: pdfPath,
          fileSize: stats.size,
        });
      } catch (err) {
        // Fallback: use filename as title if spec not found
        try {
          const pdfPath = path.join(pdfsDir, pdfFile);
          const stats = await fs.stat(pdfPath);
          const title = pdfFile.replace('.pdf', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

          pdfMetadata.push({
            filename: pdfFile,
            title,
            author: 'Unknown',
            date: undefined,
            tags: [],
            filePath: pdfPath,
            fileSize: stats.size,
          });
        } catch (fallbackErr) {
          console.warn(`⚠️  Could not load metadata for ${pdfFile}`);
        }
      }
    }

    const runTimestamp = path.basename(cliArgs.outputDirectory);
    const indexPath = path.join(cliArgs.outputDirectory, 'index.html');

    await generateIndex({
      pdfs: pdfMetadata,
      outputPath: indexPath,
      runTimestamp,
      storageAccount: cliArgs.storageAccount,
      containerName: cliArgs.containerName,
      deployed: cliArgs.deploy,
    });

    console.log(`✅ Index generated: ${indexPath}`);

    // Deploy to Azure if requested
    if (cliArgs.deploy) {
      if (!cliArgs.storageAccount || !cliArgs.resourceGroup) {
        console.error(`\n❌ Deployment failed: Missing Azure configuration`);
        console.error(`   Set AZURE_STORAGE_ACCOUNT and AZURE_RESOURCE_GROUP in .env`);
        console.error(`   Or use --storage and --resource-group flags`);
        process.exit(1);
      }

      console.log(`\n☁️  Deploying to Azure...`);
      console.log(`   Storage: ${cliArgs.storageAccount}`);
      console.log(`   Container: ${cliArgs.containerName}`);
      console.log(`   Resource Group: ${cliArgs.resourceGroup}`);

      const deployResult = await deployToAzure({
        sourceDir: cliArgs.outputDirectory,
        storageAccount: cliArgs.storageAccount!,
        resourceGroup: cliArgs.resourceGroup!,
        containerName: cliArgs.containerName,
      });

      if (deployResult.success) {
        console.log(`\n✅ Deployment successful!`);
        console.log(`   Run Folder: ${deployResult.runFolder}`);
        console.log(`   Index URL: ${deployResult.url}`);
        console.log(`   Root Index: https://${cliArgs.storageAccount}.blob.core.windows.net/${cliArgs.containerName}/index.html`);
      } else {
        console.error(`\n❌ Deployment failed: ${deployResult.error}`);
        console.error(`   PDFs are still available locally at: ${cliArgs.outputDirectory}`);
        // Don't exit with error - local files are still valid
      }
    }

    // Exit with error code if any PDFs failed
    if (result.failed > 0) {
      console.log(`\n⚠️  Warning: ${result.failed} PDF(s) failed to generate`);
      process.exit(1);
    }

    console.log(`\n✅ All PDFs generated successfully!`);
    console.log(`   Local: open ${indexPath}`);
    if (cliArgs.deploy) {
      console.log(`   Azure: https://${cliArgs.storageAccount}.blob.core.windows.net/${cliArgs.containerName}/${runTimestamp}/index.html`);
    }
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run CLI
main();
