import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_CASES } from '../utils/test-urls';
import { formatTestResult } from '../utils/test-reporter';

/**
 * Content Agent Tests
 *
 * Note: Content agent is specifically designed for PDF→HTML content fidelity.
 * HTML→HTML content comparison doesn't make sense here - use Visual and
 * Accessibility agents for HTML→HTML comparisons instead.
 */
test.describe('Content Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('PDF source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const testCase = TEST_CASES.pdfToHtml1;
    const result = await client.evaluateContent({
      migratedUrl: testCase.webUrl,
      pdfUrl: testCase.sourceUrl,
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.finalScore).toBeDefined();

    console.log(formatTestResult('Content', 'PDF→HTML', result));
  });
});
