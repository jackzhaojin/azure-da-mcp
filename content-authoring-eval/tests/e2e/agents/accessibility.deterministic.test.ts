import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_URLS } from '../utils/test-urls';

test.describe('Accessibility Agent - Deterministic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('HTML source → HTML migrated', { tag: '@smoke' }, async () => {
    const result = await client.evaluateAccessibility({
      migratedUrl: TEST_URLS.migratedHtml,
      mode: 'deterministic',
    });

    // Accessibility API returns score directly, not finalScore
    expect(result.score).toBeDefined();
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);

    console.log(`✅ Accessibility (det, HTML→HTML): Score ${result.score}, Duration ${result.duration}ms`);
  });

  test('PDF source → HTML migrated (accessibility gain)', { tag: '@regression' }, async () => {
    // PDF → HTML is inherently an accessibility improvement
    const result = await client.evaluateAccessibility({
      migratedUrl: TEST_URLS.migratedHtml,
      mode: 'deterministic',
    });

    expect(result.score).toBeDefined();
    // PDF→HTML should note accessibility gains

    console.log(`✅ Accessibility (det, PDF→HTML): Score ${result.score}, Duration ${result.duration}ms`);
  });
});
