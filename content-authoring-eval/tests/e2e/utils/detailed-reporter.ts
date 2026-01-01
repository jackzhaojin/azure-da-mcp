import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Detailed Evaluation Reporter
 *
 * Captures agent evaluation results and displays them in Playwright HTML report
 * with detailed scores, findings, and strengths.
 */

interface TestDetails {
  name: string;
  status: string;
  duration: number;
  score?: number;
  grade?: string;
  strengths?: number;
  critical?: number;
  serious?: number;
  moderate?: number;
  minor?: number;
  quickWins?: number;
  majorIssues?: number;
  criticalGaps?: number;
  minorImprovements?: number;
}

class DetailedReporter implements Reporter {
  private testDetails: TestDetails[] = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // Extract console output for scores and findings
    const consoleOutput = result.stdout
      .map(chunk => chunk.toString())
      .join('');

    // Parse test result from console output
    const details: TestDetails = {
      name: test.title,
      status: result.status,
      duration: result.duration,
    };

    // Extract score from output like "Score 82/100"
    const scoreMatch = consoleOutput.match(/Score (\d+)\/100/);
    if (scoreMatch) {
      details.score = parseInt(scoreMatch[1], 10);
    }

    // Extract grade from output like "(excellent)"
    const gradeMatch = consoleOutput.match(/\((excellent|good|acceptable|needs-improvement|critical)\)/);
    if (gradeMatch) {
      details.grade = gradeMatch[1];
    }

    // Extract strengths count like "✨ 5 strengths"
    const strengthsMatch = consoleOutput.match(/✨ (\d+) strengths/);
    if (strengthsMatch) {
      details.strengths = parseInt(strengthsMatch[1], 10);
    }

    // Extract issue counts like "⚠️  1 critical, 3 serious, 3 moderate, 1 minor"
    const criticalMatch = consoleOutput.match(/(\d+) critical/);
    if (criticalMatch) details.critical = parseInt(criticalMatch[1], 10);

    const seriousMatch = consoleOutput.match(/(\d+) serious/);
    if (seriousMatch) details.serious = parseInt(seriousMatch[1], 10);

    const moderateMatch = consoleOutput.match(/(\d+) moderate/);
    if (moderateMatch) details.moderate = parseInt(moderateMatch[1], 10);

    const minorMatch = consoleOutput.match(/(\d+) minor/);
    if (minorMatch) details.minor = parseInt(minorMatch[1], 10);

    // Extract additional metrics
    const quickWinsMatch = consoleOutput.match(/🎯 (\d+) quick wins/);
    if (quickWinsMatch) details.quickWins = parseInt(quickWinsMatch[1], 10);

    const majorIssuesMatch = consoleOutput.match(/🔴 (\d+) major issues/);
    if (majorIssuesMatch) details.majorIssues = parseInt(majorIssuesMatch[1], 10);

    const criticalGapsMatch = consoleOutput.match(/🚨 (\d+) critical gaps/);
    if (criticalGapsMatch) details.criticalGaps = parseInt(criticalGapsMatch[1], 10);

    const minorImprovementsMatch = consoleOutput.match(/💡 (\d+) minor improvements/);
    if (minorImprovementsMatch) details.minorImprovements = parseInt(minorImprovementsMatch[1], 10);

    this.testDetails.push(details);

    // Add annotations to Playwright report
    if (details.score !== undefined) {
      result.annotations.push({
        type: 'Score',
        description: `${details.score}/100 (${details.grade || 'N/A'})`,
      });
    }

    if (details.strengths !== undefined) {
      result.annotations.push({
        type: 'Strengths',
        description: `✨ ${details.strengths} positive findings`,
      });
    }

    if (details.critical || details.serious || details.moderate || details.minor) {
      const issues: string[] = [];
      if (details.critical) issues.push(`${details.critical} critical`);
      if (details.serious) issues.push(`${details.serious} serious`);
      if (details.moderate) issues.push(`${details.moderate} moderate`);
      if (details.minor) issues.push(`${details.minor} minor`);

      result.annotations.push({
        type: 'Issues',
        description: `⚠️  ${issues.join(', ')}`,
      });
    }

    if (details.quickWins) {
      result.annotations.push({
        type: 'Quick Wins',
        description: `🎯 ${details.quickWins} easy fixes available`,
      });
    }

    if (details.criticalGaps) {
      result.annotations.push({
        type: 'Critical Gaps',
        description: `🚨 ${details.criticalGaps} critical content gaps`,
      });
    }
  }

  onEnd(): void {
    // Generate summary report
    const outputDir = path.join(process.cwd(), 'test-results');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Calculate summary statistics
    const passedTests = this.testDetails.filter(t => t.status === 'passed');
    const avgScore = passedTests.length > 0
      ? Math.round(passedTests.reduce((sum, t) => sum + (t.score || 0), 0) / passedTests.length)
      : 0;

    const totalStrengths = passedTests.reduce((sum, t) => sum + (t.strengths || 0), 0);
    const totalIssues = passedTests.reduce((sum, t) =>
      sum + (t.critical || 0) + (t.serious || 0) + (t.moderate || 0) + (t.minor || 0), 0
    );

    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: this.testDetails.length,
      passed: passedTests.length,
      failed: this.testDetails.filter(t => t.status === 'failed').length,
      avgScore,
      totalStrengths,
      totalIssues,
      details: this.testDetails,
    };

    // Write detailed JSON report
    const outputPath = path.join(outputDir, 'evaluation-details.json');
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2));

    // Console summary
    console.log('\n📊 EVALUATION SUMMARY:');
    console.log(`   Tests: ${summary.passed}/${summary.totalTests} passed`);
    console.log(`   Average Score: ${avgScore}/100`);
    console.log(`   Total Strengths: ✨ ${totalStrengths}`);
    console.log(`   Total Issues: ⚠️  ${totalIssues}`);
    console.log(`   Detailed report: ${outputPath}\n`);
  }
}

export default DetailedReporter;
