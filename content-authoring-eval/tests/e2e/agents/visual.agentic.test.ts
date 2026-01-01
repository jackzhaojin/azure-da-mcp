import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_CASES } from '../utils/test-urls';
import { formatTestResult } from '../utils/test-reporter';

test.describe('Visual Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('HTML source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const testCase = TEST_CASES.htmlToHtml;
    const result = await client.evaluateVisual({
      migratedUrl: testCase.webUrl,
      sourceUrl: testCase.sourceUrl,
      mode: 'full',
    });

    // Check we got a result
    expect(result.finalScore).toBeDefined();
    expect(result.mode).toBeDefined();

    // Agentic should be present if mode is full
    if (result.mode === 'full') {
      expect(result.agentic).toBeDefined();
      expect(result.agentic?.findings).toBeDefined();
      console.log(formatTestResult('Visual', 'HTML→HTML', result));
    } else {
      console.log(`⚠️  Visual (fallback, HTML→HTML): Score ${result.finalScore}, Mode: ${result.mode}, Duration ${result.duration}ms`);
    }
  });

  test('PDF source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const testCase = TEST_CASES.pdfToHtml1;
    const result = await client.evaluateVisual({
      migratedUrl: testCase.webUrl,
      pdfUrl: testCase.sourceUrl,
      mode: 'full',
    });

    // Check we got a result
    expect(result.finalScore).toBeDefined();

    // Visual agent should NOT complete instantly (Phase 34 fix)
    expect(result.duration).toBeGreaterThan(500); // > 500ms minimum

    if (result.mode === 'full' && result.agentic) {
      console.log(formatTestResult('Visual', 'PDF→HTML', result));
    } else {
      console.log(`⚠️  Visual (fallback, PDF→HTML): Score ${result.finalScore}, Mode: ${result.mode}, Duration ${result.duration}ms`);
    }
  });
});
