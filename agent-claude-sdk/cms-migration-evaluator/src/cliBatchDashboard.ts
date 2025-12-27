#!/usr/bin/env node

/**
 * CLI for Batch Dashboard Generation - Phase 4
 *
 * Usage:
 *   npm run dashboard:batch
 *   npm run dashboard:batch -- --title "Q4 2025 Migration Report"
 *   npm run dashboard:batch -- --summary output/reports/batch-summary-2025-12-13.json
 */

import { generateBatchDashboard } from './batchDashboardGenerator.js';
import fs from 'fs/promises';
import path from 'path';
import { findLatestOutputDir } from './utils/outputPaths.js';

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let batchSummaryPath: string | undefined;
  let title: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--summary' && i + 1 < args.length) {
      batchSummaryPath = args[i + 1];
      i++;
    } else if (args[i] === '--title' && i + 1 < args.length) {
      title = args[i + 1];
      i++;
    }
  }

  try {
    // Find most recent batch summary if not specified
    if (!batchSummaryPath) {
      const latestRunDir = await findLatestOutputDir();
      if (!latestRunDir) {
        throw new Error('No evaluation runs found in output directory. Please run a batch evaluation first.');
      }

      const reportsDir = path.join(latestRunDir, 'reports');
      batchSummaryPath = path.join(reportsDir, 'batch-summary.json');

      // Check if batch summary exists
      try {
        await fs.access(batchSummaryPath);
        console.log(`\n📂 Using batch summary from latest run: ${path.basename(latestRunDir)}\n`);
      } catch {
        throw new Error(`No batch summary found in latest run at ${batchSummaryPath}`);
      }
    }

    // Resolve paths
    const absoluteBatchSummaryPath = path.resolve(batchSummaryPath);
    const runDir = path.dirname(path.dirname(absoluteBatchSummaryPath)); // Go up two levels from reports/batch-summary.json
    const reportsDir = path.join(runDir, 'reports');
    const dashboardsDir = path.join(runDir, 'dashboards');

    // Create dashboards directory if it doesn't exist
    await fs.mkdir(dashboardsDir, { recursive: true });

    // Dashboard output path
    const outputPath = path.join(dashboardsDir, 'migration-batch-dashboard.html');

    // Generate batch dashboard
    const dashboardPath = await generateBatchDashboard({
      batchSummaryPath: absoluteBatchSummaryPath,
      reportsDir,
      outputPath,
      title,
    });

    console.log(`\n✅ Batch Dashboard generated successfully!`);
    console.log(`📄 Output: ${dashboardPath}\n`);
    console.log(`💡 Tip: Open in browser to view interactive dashboard\n`);

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Batch Dashboard Generation Failed:`);
    console.error(error instanceof Error ? error.message : 'Unknown error');
    console.error('');
    process.exit(1);
  }
}

main();
