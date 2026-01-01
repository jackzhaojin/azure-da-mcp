import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_CASES } from '../utils/test-urls';
import { formatTestResult } from '../utils/test-reporter';

test.describe('Accessibility Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('HTML source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const testCase = TEST_CASES.htmlToHtml;
    const result = await client.evaluateAccessibility({
      migratedUrl: testCase.webUrl,
      sourceUrl: testCase.sourceUrl,
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.agentic?.findings).toBeDefined();

    console.log(formatTestResult('Accessibility', 'HTML→HTML', result));
  });

  test('PDF source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const testCase = TEST_CASES.pdfToHtml1;
    const result = await client.evaluateAccessibility({
      migratedUrl: testCase.webUrl,
      pdfUrl: testCase.sourceUrl,
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();

    console.log(formatTestResult('Accessibility', 'PDF→HTML', result));
  });
});
