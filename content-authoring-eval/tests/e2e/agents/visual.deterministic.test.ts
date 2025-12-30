import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_URLS } from '../utils/test-urls';

test.describe('Visual Agent - Deterministic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('HTML source → HTML migrated', { tag: '@smoke' }, async () => {
    const result = await client.evaluateVisual({
      migratedUrl: TEST_URLS.migratedHtml,
      sourceUrl: TEST_URLS.sourceHtml,
      mode: 'deterministic',
    });

    expect(result.finalScore).toBeDefined();

    console.log(`✅ Visual (det, HTML→HTML): Score ${result.finalScore}, Duration ${result.duration}ms`);
  });

  test('PDF source → HTML migrated', { tag: '@regression' }, async () => {
    const result = await client.evaluateVisual({
      migratedUrl: TEST_URLS.migratedHtml,
      pdfUrl: TEST_URLS.sourcePdf,
      mode: 'deterministic',
    });

    expect(result.finalScore).toBeDefined();

    console.log(`✅ Visual (det, PDF→HTML): Score ${result.finalScore}, Duration ${result.duration}ms`);
  });
});
