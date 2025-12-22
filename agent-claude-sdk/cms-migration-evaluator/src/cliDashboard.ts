#!/usr/bin/env node
import { generateDashboard } from './dashboardGenerator.js';
import * as path from 'path';
import * as fs from 'fs';
import { findLatestOutputDir } from './utils/outputPaths.js';

/**
 * CLI Interface for Dashboard Generation
 *
 * Usage:
 *   npm run dashboard
 *   npm run dashboard -- --title "My Migration Report"
 */

async function main() {
  try {
    // Parse CLI arguments
    const args = process.argv.slice(2);
    const titleIndex = args.indexOf('--title');
    const title = titleIndex !== -1 ? args[titleIndex + 1] : undefined;

    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   CMS Migration Evaluator - Dashboard Generator         ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    // Find the latest timestamped output directory
    const latestRunDir = await findLatestOutputDir();
    if (!latestRunDir) {
      console.error(`\n❌ Error: No evaluation runs found in output directory`);
      console.error('   Please run an evaluation first: npm run evaluate examples/test-migration.json');
      process.exit(1);
    }

    const reportsDir = path.join(latestRunDir, 'reports');
    const dashboardsDir = path.join(latestRunDir, 'dashboards');

    // Verify reports directory exists and has reports
    if (!fs.existsSync(reportsDir)) {
      console.error(`\n❌ Error: Reports directory not found at ${reportsDir}`);
      console.error('   Please run evaluation first: npm run evaluate examples/test-migration.json');
      process.exit(1);
    }

    const reportFiles = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json'));
    if (reportFiles.length === 0) {
      console.error(`\n❌ Error: No evaluation reports found in ${reportsDir}`);
      console.error('   Please run evaluation first: npm run evaluate examples/test-migration.json');
      process.exit(1);
    }

    // Ensure dashboards directory exists
    await fs.promises.mkdir(dashboardsDir, { recursive: true });

    // Configure dashboard generation
    const config = {
      reportsDir,
      outputPath: path.join(dashboardsDir, 'migration-quality-dashboard.html'),
      title,
    };

    console.log(`\n📊 Configuration:`);
    console.log(`   Reports Directory: ${config.reportsDir}`);
    console.log(`   Output Path: ${config.outputPath}`);
    console.log(`   Dashboard Title: ${config.title || '(default)'}`);
    console.log(`   Reports Found: ${reportFiles.length}`);

    // Generate dashboard
    const startTime = Date.now();
    const outputPath = await generateDashboard(config);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║   ✅ Dashboard Generation Complete                       ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`\n📄 Dashboard Location: ${outputPath}`);
    console.log(`⏱️  Generation Time: ${duration}s`);
    console.log(`\n💡 Next Steps:`);
    console.log(`   1. Open the dashboard in your browser:`);
    console.log(`      open ${outputPath}`);
    console.log(`   2. Share the HTML file with stakeholders (works offline)`);
    console.log(`   3. Generate more reports and run dashboard again to update\n`);

  } catch (error) {
    console.error('\n❌ Dashboard generation failed:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
      if (error.stack) {
        console.error('\n📋 Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
