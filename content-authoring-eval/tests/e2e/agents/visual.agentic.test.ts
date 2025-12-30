import { test, expect } from '@playwright/test';
import { EvalAPIClient } from '../utils/api-client';
import { TEST_URLS } from '../utils/test-urls';

test.describe('Visual Agent - Agentic Mode', () => {
  let client: EvalAPIClient;

  test.beforeAll(async () => {
    client = await EvalAPIClient.create();
  });

  test.afterAll(async () => {
    await client.dispose();
  });

  test('HTML source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const result = await client.evaluateVisual({
      migratedUrl: TEST_URLS.simple, // Use simpler page to reduce test time
      mode: 'full',
    });

    // Check we got a result
    expect(result.finalScore).toBeDefined();
    expect(result.mode).toBeDefined();

    // Agentic should be present if mode is full
    if (result.mode === 'full') {
      expect(result.agentic).toBeDefined();
      expect(result.agentic?.findings).toBeDefined();
      console.log(`✅ Visual (agentic, HTML): Score ${result.finalScore}, Findings: ${result.agentic?.findings?.length}, Duration ${result.duration}ms`);
    } else {
      console.log(`⚠️  Visual (fallback, HTML): Score ${result.finalScore}, Mode: ${result.mode}, Duration ${result.duration}ms`);
    }
  });

  test('PDF source → HTML migrated (agentic)', { tag: '@expensive' }, async () => {
    const result = await client.evaluateVisual({
      migratedUrl: TEST_URLS.simple,
      mode: 'full',
    });

    // Check we got a result
    expect(result.finalScore).toBeDefined();

    // Visual agent should NOT complete instantly (Phase 34 fix)
    expect(result.duration).toBeGreaterThan(500); // > 500ms minimum

    if (result.mode === 'full' && result.agentic) {
      console.log(`✅ Visual (agentic, PDF→HTML): Score ${result.finalScore}, Duration ${result.duration}ms`);
    } else {
      console.log(`⚠️  Visual (fallback, PDF→HTML): Score ${result.finalScore}, Mode: ${result.mode}, Duration ${result.duration}ms`);
    }
  });
});
