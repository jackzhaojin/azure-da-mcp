import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_URLS } from '../utils/test-urls';

test.describe('Content Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('PDF source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const result = await client.evaluateContent({
      migratedUrl: TEST_URLS.migratedHtml,
      pdfUrl: TEST_URLS.sourcePdf,
      mode: 'full',
    });

    expect(result.agentic).toBeDefined();
    expect(result.finalScore).toBeDefined();

    console.log(`✅ Content (agentic, PDF→HTML): Score ${result.finalScore}, Duration ${result.duration}ms`);
  });
});
