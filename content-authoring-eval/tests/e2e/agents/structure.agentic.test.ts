import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_CASES } from '../utils/test-urls';
import { formatTestResult } from '../utils/test-reporter';

test.describe('Structure Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('Migrated page analysis (no source)', { tag: '@expensive' }, async () => {
    const testCase = TEST_CASES.pdfToHtml1;
    const result = await client.evaluateStructure({
      migratedUrl: testCase.webUrl,
      mode: 'full',
    });

    expect(result.mode).toContain('full');
    expect(result.agentic).toBeDefined();
    expect(result.agentic?.findings).toBeDefined();
    expect(Array.isArray(result.agentic?.findings)).toBe(true);

    console.log(formatTestResult('Structure', 'no-source', result));
  });
});
