/**
 * Batch Evaluator - Phase 4
 *
 * Orchestrates evaluation of 1-50 migration entries in a single command.
 * Features: Sequential processing, error handling (continueOnError), progress logging,
 * batch summary generation with aggregate statistics.
 */

import { evaluateMigration, EvaluationInput } from './evaluator.js';
import fs from 'fs/promises';
import path from 'path';
import { createTimestampedOutputDirs } from './utils/outputPaths.js';

export interface BatchEntry {
  id: string;
  pdfPath: string;
  migratedUrl: string;
}

export interface BatchInput {
  batchName: string;
  entries: BatchEntry[];
  config?: {
    continueOnError?: boolean;
    outputDir?: string;
    outputFolderName?: string; // Optional name for the batch output folder
  };
}

export interface BatchEntryResult {
  id: string;
  success: boolean;
  reportPath?: string;
  error?: string;
  duration: number;
}

export interface BatchSummary {
  batchName: string;
  totalEntries: number;
  successCount: number;
  failureCount: number;
  results: BatchEntryResult[];
  aggregateStatistics: {
    averageOverallScore: number;
    averageSeoScore: number;
    averageAccessibilityScore: number;
    averageVisualFidelityScore: number;
    averageContentQualityScore: number;
    averageIntentAlignmentScore: number;
    totalFindings: number;
    findingsBySeverity: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
    coreWebVitalsPassRate: number;
    bestPerformingPage?: {
      id: string;
      score: number;
    };
    worstPerformingPage?: {
      id: string;
      score: number;
    };
    commonIssues: Array<{
      issue: string;
      count: number;
      severity: string;
    }>;
  };
  metadata: {
    startedAt: string;
    completedAt: string;
    totalDuration: number;
  };
}

/**
 * Evaluate batch of migrations sequentially
 */
export async function evaluateBatch(batchInput: BatchInput): Promise<BatchSummary> {
  const startTime = Date.now();
  const continueOnError = batchInput.config?.continueOnError ?? true;

  // Create a single timestamped directory for this entire batch run
  // Use outputFolderName if provided, otherwise use batchName
  const folderName = batchInput.config?.outputFolderName || batchInput.batchName.toLowerCase().replace(/\s+/g, '-');
  const outputDirs = await createTimestampedOutputDirs(batchInput.config?.outputDir, folderName);
  const { runDir, reportsDir } = outputDirs;

  console.log(`\n🚀 Starting Batch Evaluation: "${batchInput.batchName}"`);
  console.log(`📊 Total Entries: ${batchInput.entries.length}`);
  console.log(`⚙️  Continue on Error: ${continueOnError ? 'Yes' : 'No'}`);
  console.log(`📂 Run Directory: ${runDir}`);
  console.log(`📂 Reports Directory: ${reportsDir}\n`);

  const results: BatchEntryResult[] = [];

  // Process entries sequentially (avoid rate limits, easier to debug)
  for (let i = 0; i < batchInput.entries.length; i++) {
    const entry = batchInput.entries[i];
    const entryStartTime = Date.now();

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📄 Evaluating Entry ${i + 1} of ${batchInput.entries.length}: "${entry.id}"`);
    console.log(`   PDF: ${entry.pdfPath}`);
    console.log(`   URL: ${entry.migratedUrl}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      // Resolve PDF path (handle relative paths)
      const pdfPath = path.resolve(entry.pdfPath);

      // Create evaluation input - use the batch's run directory so all reports go to same location
      const evaluationInput: EvaluationInput = {
        pdfPath,
        migratedUrl: entry.migratedUrl,
        outputDir: runDir, // Use the batch's timestamped directory
      };

      // Run evaluation
      const result = await evaluateMigration(evaluationInput);

      const duration = Date.now() - entryStartTime;

      if (result.success) {
        console.log(`\n✅ Entry "${entry.id}" completed successfully (${(duration / 1000).toFixed(1)}s)`);
        console.log(`   Report: ${result.reportPath}\n`);

        results.push({
          id: entry.id,
          success: true,
          reportPath: result.reportPath,
          duration,
        });
      } else {
        console.error(`\n✗ Entry "${entry.id}" failed: ${result.error} (${(duration / 1000).toFixed(1)}s)\n`);

        results.push({
          id: entry.id,
          success: false,
          error: result.error,
          duration,
        });

        if (!continueOnError) {
          throw new Error(`Batch evaluation stopped at entry "${entry.id}": ${result.error}`);
        }
      }
    } catch (error) {
      const duration = Date.now() - entryStartTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error(`\n✗ Entry "${entry.id}" failed with exception: ${errorMessage} (${(duration / 1000).toFixed(1)}s)\n`);

      results.push({
        id: entry.id,
        success: false,
        error: errorMessage,
        duration,
      });

      if (!continueOnError) {
        throw error;
      }
    }
  }

  // Calculate aggregate statistics
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 Calculating Aggregate Statistics...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const aggregateStatistics = await calculateAggregateStatistics(results);

  const endTime = Date.now();

  const batchSummary: BatchSummary = {
    batchName: batchInput.batchName,
    totalEntries: batchInput.entries.length,
    successCount: results.filter(r => r.success).length,
    failureCount: results.filter(r => !r.success).length,
    results,
    aggregateStatistics,
    metadata: {
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      totalDuration: endTime - startTime,
    },
  };

  // Save batch summary to the same timestamped directory
  const batchSummaryPath = path.join(reportsDir, `batch-summary.json`);
  await fs.writeFile(batchSummaryPath, JSON.stringify(batchSummary, null, 2), 'utf-8');

  console.log(`\n✅ Batch Evaluation Complete!`);
  console.log(`   Success: ${batchSummary.successCount}/${batchSummary.totalEntries}`);
  console.log(`   Failures: ${batchSummary.failureCount}/${batchSummary.totalEntries}`);
  console.log(`   Total Duration: ${(batchSummary.metadata.totalDuration / 1000 / 60).toFixed(1)} minutes`);
  console.log(`   Batch Summary: ${batchSummaryPath}\n`);

  console.log(`📈 Aggregate Statistics:`);
  console.log(`   Average Overall Score: ${aggregateStatistics.averageOverallScore.toFixed(1)}/100`);
  console.log(`   Total Findings: ${aggregateStatistics.totalFindings}`);
  console.log(`   Critical: ${aggregateStatistics.findingsBySeverity.critical}`);
  console.log(`   High: ${aggregateStatistics.findingsBySeverity.high}`);
  console.log(`   Medium: ${aggregateStatistics.findingsBySeverity.medium}`);
  console.log(`   Low: ${aggregateStatistics.findingsBySeverity.low}`);
  console.log(`   Core Web Vitals Pass Rate: ${aggregateStatistics.coreWebVitalsPassRate.toFixed(0)}%\n`);

  if (aggregateStatistics.bestPerformingPage) {
    console.log(`🏆 Best Performing Page: "${aggregateStatistics.bestPerformingPage.id}" (${aggregateStatistics.bestPerformingPage.score}/100)`);
  }
  if (aggregateStatistics.worstPerformingPage) {
    console.log(`⚠️  Worst Performing Page: "${aggregateStatistics.worstPerformingPage.id}" (${aggregateStatistics.worstPerformingPage.score}/100)`);
  }

  if (aggregateStatistics.commonIssues.length > 0) {
    console.log(`\n🔍 Top 5 Common Issues:`);
    aggregateStatistics.commonIssues.slice(0, 5).forEach((issue, idx) => {
      console.log(`   ${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.issue} (${issue.count} pages)`);
    });
  }

  console.log('');

  return batchSummary;
}

/**
 * Calculate aggregate statistics from individual reports
 */
async function calculateAggregateStatistics(
  results: BatchEntryResult[]
): Promise<BatchSummary['aggregateStatistics']> {
  const successfulResults = results.filter(r => r.success && r.reportPath);

  if (successfulResults.length === 0) {
    return {
      averageOverallScore: 0,
      averageSeoScore: 0,
      averageAccessibilityScore: 0,
      averageVisualFidelityScore: 0,
      averageContentQualityScore: 0,
      averageIntentAlignmentScore: 0,
      totalFindings: 0,
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      coreWebVitalsPassRate: 0,
      commonIssues: [],
    };
  }

  // Read all successful reports
  const reports = await Promise.all(
    successfulResults.map(async (result) => {
      const reportContent = await fs.readFile(result.reportPath!, 'utf-8');
      return { id: result.id, data: JSON.parse(reportContent) };
    })
  );

  // Calculate averages
  const totalReports = reports.length;
  let totalOverallScore = 0;
  let totalSeoScore = 0;
  let totalAccessibilityScore = 0;
  let totalVisualFidelityScore = 0;
  let totalContentQualityScore = 0;
  let totalIntentAlignmentScore = 0;
  let totalFindings = 0;
  const findingsBySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  let coreWebVitalsPassed = 0;

  // Track common issues
  const issueMap = new Map<string, { count: number; severity: string }>();

  let bestPerformingPage: { id: string; score: number } | undefined;
  let worstPerformingPage: { id: string; score: number } | undefined;

  for (const report of reports) {
    const summary = report.data.summary;

    totalOverallScore += summary.overallScore || 0;
    totalSeoScore += summary.seoScore || 0;
    totalAccessibilityScore += summary.accessibilityScore || 0;
    totalVisualFidelityScore += summary.visualFidelityScore || 0;
    totalContentQualityScore += summary.contentQualityScore || 0;
    totalIntentAlignmentScore += summary.intentAlignmentScore || 0;

    // Track best/worst
    const score = summary.overallScore || 0;
    if (!bestPerformingPage || score > bestPerformingPage.score) {
      bestPerformingPage = { id: report.id, score };
    }
    if (!worstPerformingPage || score < worstPerformingPage.score) {
      worstPerformingPage = { id: report.id, score };
    }

    // Core Web Vitals
    if (summary.coreWebVitals?.passing) {
      coreWebVitalsPassed++;
    }

    // Findings
    const findings = report.data.findings || [];
    totalFindings += findings.length;

    for (const finding of findings) {
      const severity = finding.severity?.toLowerCase() || 'low';
      if (severity in findingsBySeverity) {
        findingsBySeverity[severity as keyof typeof findingsBySeverity]++;
      }

      // Track common issues
      const issueKey = `${finding.dimension}:${finding.issue}`;
      if (issueMap.has(issueKey)) {
        issueMap.get(issueKey)!.count++;
      } else {
        issueMap.set(issueKey, { count: 1, severity });
      }
    }
  }

  // Sort common issues by count (descending)
  const commonIssues = Array.from(issueMap.entries())
    .map(([issue, data]) => ({
      issue: issue.split(':')[1], // Extract issue text
      count: data.count,
      severity: data.severity,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    averageOverallScore: totalOverallScore / totalReports,
    averageSeoScore: totalSeoScore / totalReports,
    averageAccessibilityScore: totalAccessibilityScore / totalReports,
    averageVisualFidelityScore: totalVisualFidelityScore / totalReports,
    averageContentQualityScore: totalContentQualityScore / totalReports,
    averageIntentAlignmentScore: totalIntentAlignmentScore / totalReports,
    totalFindings,
    findingsBySeverity,
    coreWebVitalsPassRate: (coreWebVitalsPassed / totalReports) * 100,
    bestPerformingPage,
    worstPerformingPage,
    commonIssues,
  };
}
