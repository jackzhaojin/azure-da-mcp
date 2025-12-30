import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Flaky Test Reporter
 *
 * Detects tests that passed after retry and logs them for investigation.
 * Helps identify unstable tests that may need fixing.
 */
class FlakyReporter implements Reporter {
  private flakyTests: Array<{
    name: string;
    file: string;
    retries: number;
    duration: number;
  }> = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    // If test passed but required retries, it's flaky
    if (result.retry > 0 && result.status === 'passed') {
      this.flakyTests.push({
        name: test.title,
        file: path.relative(process.cwd(), test.location.file),
        retries: result.retry,
        duration: result.duration,
      });
    }
  }

  onEnd(): void {
    if (this.flakyTests.length > 0) {
      console.warn('\n⚠️  FLAKY TESTS DETECTED:');
      console.warn('These tests passed but required retries. Consider investigating:\n');

      this.flakyTests.forEach(t => {
        console.warn(`  - ${t.name}`);
        console.warn(`    File: ${t.file}`);
        console.warn(`    Retries: ${t.retries}`);
        console.warn(`    Duration: ${t.duration}ms\n`);
      });

      // Write to file for CI tracking
      const outputDir = path.join(process.cwd(), 'test-results');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const outputPath = path.join(outputDir, 'flaky-tests.json');
      fs.writeFileSync(
        outputPath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          totalFlaky: this.flakyTests.length,
          tests: this.flakyTests,
        }, null, 2)
      );

      console.warn(`\nFlaky test report saved to: ${outputPath}\n`);
    }
  }
}

export default FlakyReporter;
