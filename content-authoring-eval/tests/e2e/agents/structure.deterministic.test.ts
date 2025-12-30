import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_URLS, TEST_CONFIG } from '../utils/test-urls';

test.describe('Structure Agent - Deterministic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('HTML source → HTML migrated', { tag: '@smoke' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_URLS.migratedHtml,
      mode: 'deterministic',
    });

    expect(result.mode).toBe('deterministic');
    console.log(`✅ Structure (det, HTML→HTML): Duration ${result.duration}ms`);
  });

  test('PDF source → HTML migrated', { tag: '@regression' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_URLS.migratedHtml,
      pdfUrl: TEST_URLS.sourcePdf,
      mode: 'deterministic',
    });

    expect(result.mode).toBe('deterministic');
    console.log(`✅ Structure (det, PDF→HTML): Duration ${result.duration}ms`);
  });

  test('No source (migrated only)', { tag: '@regression' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_URLS.simple,
      mode: 'deterministic',
    });

    expect(result.mode).toBe('deterministic');
    console.log(`✅ Structure (det, no source): Duration ${result.duration}ms`);
  });
});
