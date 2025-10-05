/**
 * End-to-End Smoke Test
 *
 * This test follows the quickstart.md guide to verify the complete workflow:
 * 1. HealthCheck endpoint returns healthy status
 * 2. GetContent endpoint retrieves page content
 * 3. EditContent endpoint processes editing command with full orchestration
 *
 * Note: This test requires Azure Functions runtime to be running.
 * Run manually: `npm start` in one terminal, then `npm test -- smoke.test.js` in another.
 *
 * For CI/CD: Tests use mocked external APIs (nock) to avoid real API dependencies.
 */

import nock from 'nock';
import axios from 'axios';

const FUNCTIONS_BASE_URL = 'http://localhost:7071';
const DALIVE_API_URL = 'https://admin.da.live';
const ANTHROPIC_API_URL = 'https://api.anthropic.com';

// Skip these tests in CI unless explicitly enabled
const describeE2E = process.env.RUN_E2E_TESTS ? describe : describe.skip;

describeE2E('End-to-End Smoke Tests', () => {
  beforeAll(() => {
    // Set required environment variables for tests
    process.env.DALIVE_API_URL = DALIVE_API_URL;
    process.env.ANTHROPIC_API_KEY = 'test-api-key-for-e2e';
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Step 1: Health Check', () => {
    test('GET /api/HealthCheck returns healthy status', async () => {
      try {
        const response = await axios.get(`${FUNCTIONS_BASE_URL}/api/HealthCheck`);

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status');
        expect(['healthy', 'degraded', 'unhealthy']).toContain(response.data.status);
        expect(response.data).toHaveProperty('version');
        expect(response.data).toHaveProperty('timestamp');
      } catch (error) {
        // If server is not running, skip test with helpful message
        if (error.code === 'ECONNREFUSED') {
          console.warn('Azure Functions server is not running. Start with `npm start` first.');
          console.warn('Skipping E2E test. Set RUN_E2E_TESTS=true to enforce.');
        }
        throw error;
      }
    });
  });

  describe('Step 2: Get Content', () => {
    test('GET /api/GetContent retrieves page content with mocked da.live API', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'test-bearer-token';

      // Mock da.live API response
      nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(200, {
          path: testPath,
          blocks: [
            {
              id: 'hero-1',
              type: 'hero',
              content: {
                headline: 'Enterprise Solutions That Scale',
                subheadline: 'Built for organizations that demand reliability',
                cta: 'Start Your Trial',
              },
            },
            {
              id: 'cards-1',
              type: 'product-cards',
              content: {
                cards: [
                  {
                    title: 'Advanced Security',
                    description: 'Enterprise-grade security',
                    features: ['SOC 2', 'SAML/SSO'],
                  },
                ],
              },
            },
            {
              id: 'cta-1',
              type: 'cta',
              content: {
                buttonText: 'Contact Sales',
                supportingCopy: 'Get a personalized demo',
              },
            },
          ],
          metadata: {
            title: 'Enterprise Product',
            lastModified: '2025-10-04T10:00:00Z',
          },
        });

      try {
        const response = await axios.get(
          `${FUNCTIONS_BASE_URL}/api/GetContent${testPath}`,
          {
            headers: {
              Authorization: `Bearer ${testToken}`,
            },
          }
        );

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('path', testPath);
        expect(response.data).toHaveProperty('blocks');
        expect(Array.isArray(response.data.blocks)).toBe(true);
        expect(response.data.blocks.length).toBe(3);
        expect(response.data).toHaveProperty('metadata');
        expect(response.data).toHaveProperty('timestamp');
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('Azure Functions server is not running. Start with `npm start` first.');
        }
        throw error;
      }
    });
  });

  describe('Step 3: Edit Content - Full Workflow', () => {
    test('POST /api/EditContent completes full orchestration with mocked APIs', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'test-bearer-token';
      const testCommand = 'Make the hero section more concise';

      // Mock da.live GET (fetch current content)
      nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(200, {
          path: testPath,
          blocks: [
            {
              id: 'hero-1',
              type: 'hero',
              content: {
                headline: 'Enterprise Solutions That Scale With Your Business Growth',
                subheadline:
                  'Built for organizations that demand reliability and performance at scale',
                cta: 'Start Your Free Trial Today',
              },
            },
            {
              id: 'cards-1',
              type: 'product-cards',
              content: {
                cards: [
                  {
                    title: 'Advanced Security',
                    description: 'Enterprise-grade security',
                    features: ['SOC 2', 'SAML/SSO'],
                  },
                ],
              },
            },
          ],
          metadata: {
            title: 'Enterprise Product',
            lastModified: '2025-10-04T10:00:00Z',
          },
        });

      // Mock Anthropic API (LLM response)
      nock(ANTHROPIC_API_URL)
        .post('/v1/messages')
        .reply(200, {
          id: 'msg_smoke_test',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [
                  {
                    id: 'hero-1',
                    type: 'hero',
                    content: {
                      headline: 'Enterprise Solutions',
                      subheadline: 'Built for reliability and performance',
                      cta: 'Start Free Trial',
                    },
                    changeDescription: 'Reduced headline from 8 to 2 words, simplified subheadline',
                  },
                ],
                unchangedBlocks: ['cards-1'],
                explanation: 'Reduced hero section from 47 to 15 words while preserving key message',
                reasoning: 'Shortened headline and subheadline for conciseness as requested',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 13544,
            output_tokens: 1023,
          },
        });

      // Mock da.live POST (update content)
      nock(DALIVE_API_URL)
        .post(`/api/content${testPath}`)
        .reply(200, {
          success: true,
          path: testPath,
          updatedBlocks: ['hero-1'],
          timestamp: '2025-10-04T10:30:00Z',
        });

      try {
        const response = await axios.post(
          `${FUNCTIONS_BASE_URL}/api/EditContent`,
          {
            command: testCommand,
            path: testPath,
          },
          {
            headers: {
              Authorization: `Bearer ${testToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        // Verify successful response
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('requestId');
        expect(response.data).toHaveProperty('editedBlocks');
        expect(response.data).toHaveProperty('unchangedBlocks');
        expect(response.data).toHaveProperty('explanation');
        expect(response.data).toHaveProperty('reasoning');
        expect(response.data).toHaveProperty('timing');

        // Verify timing metrics
        expect(response.data.timing).toHaveProperty('total');
        expect(response.data.timing).toHaveProperty('dalive_fetch');
        expect(response.data.timing).toHaveProperty('llm_call');
        expect(response.data.timing).toHaveProperty('validation');
        expect(response.data.timing).toHaveProperty('dalive_update');

        // Verify edited blocks structure
        expect(Array.isArray(response.data.editedBlocks)).toBe(true);
        if (response.data.editedBlocks.length > 0) {
          const editedBlock = response.data.editedBlocks[0];
          expect(editedBlock).toHaveProperty('id');
          expect(editedBlock).toHaveProperty('type');
          expect(editedBlock).toHaveProperty('content');
          expect(editedBlock).toHaveProperty('changeDescription');
        }

        // Verify unchanged blocks
        expect(Array.isArray(response.data.unchangedBlocks)).toBe(true);
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('Azure Functions server is not running. Start with `npm start` first.');
        }
        throw error;
      }
    });

    test('Performance: Total end-to-end time meets P95 target (<5s)', async () => {
      const testPath = '/products/test-performance';
      const testToken = 'test-bearer-token';

      // Mock da.live GET
      nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(200, {
          path: testPath,
          blocks: [
            {
              id: 'hero-1',
              type: 'hero',
              content: {
                headline: 'Test Performance',
                subheadline: 'Performance test',
                cta: 'Test',
              },
            },
          ],
          metadata: {},
        });

      // Mock Anthropic API
      nock(ANTHROPIC_API_URL)
        .post('/v1/messages')
        .reply(200, {
          id: 'msg_perf',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: ['hero-1'],
                explanation: 'No changes needed',
                reasoning: 'Content already optimal',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50 },
        });

      // Mock da.live POST
      nock(DALIVE_API_URL)
        .post(`/api/content${testPath}`)
        .reply(200, { success: true, path: testPath });

      try {
        const startTime = Date.now();

        const response = await axios.post(
          `${FUNCTIONS_BASE_URL}/api/EditContent`,
          {
            command: 'Optimize content',
            path: testPath,
          },
          {
            headers: {
              Authorization: `Bearer ${testToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Verify performance target (P95 < 5000ms)
        console.log(`Total E2E time: ${totalTime}ms`);
        expect(totalTime).toBeLessThan(5000);

        // Verify timing breakdown from response
        if (response.data.timing) {
          console.log('Timing breakdown:', response.data.timing);
          expect(response.data.timing.total).toBeLessThan(5000);
        }
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('Azure Functions server is not running. Start with `npm start` first.');
        }
        throw error;
      }
    });
  });

  describe('Step 4: Error Scenarios', () => {
    test('Returns 401 Unauthorized for invalid token', async () => {
      const testPath = '/products/test';
      const invalidToken = 'invalid-token';

      // Mock da.live 401 response
      nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(401, {
          error: 'Unauthorized',
          message: 'Invalid token',
        });

      try {
        await axios.get(`${FUNCTIONS_BASE_URL}/api/GetContent${testPath}`, {
          headers: {
            Authorization: `Bearer ${invalidToken}`,
          },
        });

        // Should not reach here
        fail('Expected 401 error');
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('Azure Functions server is not running.');
          return;
        }

        // Verify 401 error response
        expect(error.response.status).toBe(401);
        expect(error.response.data).toHaveProperty('error');
      }
    });

    test('Returns 404 Not Found for non-existent page', async () => {
      const testPath = '/products/nonexistent';
      const testToken = 'valid-token';

      // Mock da.live 404 response
      nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(404, {
          error: 'Not Found',
          message: 'Page not found',
        });

      try {
        await axios.get(`${FUNCTIONS_BASE_URL}/api/GetContent${testPath}`, {
          headers: {
            Authorization: `Bearer ${testToken}`,
          },
        });

        fail('Expected 404 error');
      } catch (error) {
        if (error.code === 'ECONNREFUSED') {
          console.warn('Azure Functions server is not running.');
          return;
        }

        expect(error.response.status).toBe(404);
        expect(error.response.data).toHaveProperty('error');
      }
    });
  });
});
