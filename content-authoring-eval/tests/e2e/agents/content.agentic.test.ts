import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_CASES } from '../utils/test-urls';
import { formatTestResult } from '../utils/test-reporter';

/**
 * Content Agent Tests
 *
 * Tests content fidelity for both PDF→HTML and HTML→HTML migrations.
 * Critical for detecting content loss during CMS migrations where:
 * - Content sections may be dropped
 * - Components might not support certain content types
 * - Text/paragraphs/headings could be missing
 */
test.describe('Content Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('HTML source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const testCase = TEST_CASES.htmlToHtml;
    const result = await client.evaluateContent({
      migratedUrl: testCase.webUrl,
      sourceUrl: testCase.sourceUrl, // HTML source
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.finalScore).toBeDefined();

    console.log(formatTestResult('Content', 'HTML→HTML', result));
  });

  test('PDF source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const testCase = TEST_CASES.pdfToHtml1;
    const result = await client.evaluateContent({
      migratedUrl: testCase.webUrl,
      pdfUrl: testCase.sourceUrl, // PDF source
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.finalScore).toBeDefined();

    console.log(formatTestResult('Content', 'PDF→HTML', result));
  });
});
