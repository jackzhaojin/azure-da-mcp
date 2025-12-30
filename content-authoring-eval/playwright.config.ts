import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Tests all 4 agents × 2 modes × 2 input types = 16 test scenarios
 * Real API calls, no mocks
 */

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Sequential to avoid rate limits
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0, // Retry twice in CI for flaky tests
  workers: 1, // Single worker to avoid Claude API rate limits
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'], // Console output
    ['./tests/e2e/utils/flaky-reporter.ts'], // Flaky test detection
  ],
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  timeout: 120000, // 2 minutes per test (agentic calls are slow)
  expect: {
    timeout: 60000,
  },
  projects: [
    {
      name: 'deterministic',
      testMatch: '**/*.deterministic.test.ts',
      timeout: 60000, // 1 minute for deterministic
    },
    {
      name: 'agentic',
      testMatch: '**/*.agentic.test.ts',
      timeout: 180000, // 3 minutes for agentic
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
