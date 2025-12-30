import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_URLS } from '../utils/test-urls';

test.describe('Structure Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('HTML source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_URLS.migratedHtml,
      mode: 'full',
    });

    expect(result.mode).toContain('full');
    expect(result.agentic).toBeDefined();
    expect(result.agentic?.findings).toBeDefined();
    expect(Array.isArray(result.agentic?.findings)).toBe(true);

    console.log(`✅ Structure (agentic, HTML→HTML): Score ${result.finalScore}, Findings: ${result.agentic?.findings.length}, Duration ${result.duration}ms`);
  });

  test('PDF source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const result = await client.evaluateStructure({
      migratedUrl: TEST_URLS.migratedHtml,
      pdfUrl: TEST_URLS.sourcePdf,
      mode: 'full',
    });

    expect(result.mode).toContain('full');
    expect(result.agentic).toBeDefined();

    console.log(`✅ Structure (agentic, PDF→HTML): Score ${result.finalScore}, Duration ${result.duration}ms`);
  });
});
