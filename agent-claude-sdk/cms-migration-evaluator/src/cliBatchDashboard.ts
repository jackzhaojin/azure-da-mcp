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
      const reportsDir = path.resolve(process.cwd(), 'output', 'reports');
      const files = await fs.readdir(reportsDir);
      const batchSummaries = files
        .filter(f => f.startsWith('batch-summary-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (batchSummaries.length === 0) {
        throw new Error('No batch summary files found in output/reports/');
      }

      batchSummaryPath = path.join(reportsDir, batchSummaries[0]);
      console.log(`\n📂 Using most recent batch summary: ${batchSummaries[0]}\n`);
    }

    // Resolve paths
    const absoluteBatchSummaryPath = path.resolve(batchSummaryPath);
    const reportsDir = path.dirname(absoluteBatchSummaryPath);
    const dashboardsDir = path.join(process.cwd(), 'output', 'dashboards');

    // Create dashboards directory if it doesn't exist
    await fs.mkdir(dashboardsDir, { recursive: true });

    // Generate timestamp for dashboard filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const outputPath = path.join(dashboardsDir, `migration-batch-${timestamp}.html`);

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
