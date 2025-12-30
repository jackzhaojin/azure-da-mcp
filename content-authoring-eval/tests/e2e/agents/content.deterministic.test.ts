import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_URLS } from '../utils/test-urls';

test.describe('Content Agent - Deterministic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('PDF source → HTML migrated', { tag: '@smoke' }, async () => {
    const result = await client.evaluateContent({
      migratedUrl: TEST_URLS.migratedHtml,
      pdfUrl: TEST_URLS.sourcePdf,
      mode: 'deterministic',
    });

    expect(result.finalScore).toBeDefined();
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(100);

    console.log(`✅ Content (det, PDF→HTML): Score ${result.finalScore}, Duration ${result.duration}ms`);
  });
});
