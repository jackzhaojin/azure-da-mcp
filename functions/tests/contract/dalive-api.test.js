/**
 * Contract Tests: da.live Admin API
 *
 * Tests verify that our DaliveClient module correctly implements the expected
 * da.live Admin API contract for GET and POST content operations.
 *
 * These tests use nock to mock the da.live API and verify request/response format.
 */

import nock from 'nock';
import { getContent, updateContent } from '../../src/modules/DaliveClient.js';

const DALIVE_API_URL = 'https://admin.da.live';

describe('da.live Admin API Contract Tests', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  describe('GET /content/{path} contract', () => {
    test('should send correct request headers including Authorization Bearer token', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'test-bearer-token-123';

      const scope = nock(DALIVE_API_URL, {
        reqheaders: {
          authorization: `Bearer ${testToken}`,
        },
      })
        .get(`/api/content${testPath}`)
        .reply(200, {
          path: testPath,
          blocks: [
            {
              id: 'hero-1',
              type: 'hero',
              content: {
                headline: 'Test Headline',
                subheadline: 'Test Subheadline',
                cta: 'Test CTA',
              },
            },
          ],
          metadata: {
            title: 'Test Page',
            lastModified: '2025-10-04T10:00:00Z',
          },
        });

      await getContent(testPath, testToken);

      expect(scope.isDone()).toBe(true);
    });

    test('should receive 200 OK response with page content structure', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'test-bearer-token-123';

      nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(200, {
          path: testPath,
          blocks: [
            {
              id: 'hero-1',
              type: 'hero',
              content: {
                headline: 'Enterprise Solutions',
                subheadline: 'Scale your business',
                cta: 'Get Started',
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
                    features: ['SOC 2 Type II', 'SAML/SSO'],
                  },
                ],
              },
            },
          ],
          metadata: {
            title: 'Enterprise Product',
            description: 'Powerful solutions',
            lastModified: '2025-10-04T10:00:00Z',
          },
        });

      const result = await getContent(testPath, testToken);

      // Verify response structure matches contract
      expect(result).toHaveProperty('path', testPath);
      expect(result).toHaveProperty('blocks');
      expect(Array.isArray(result.blocks)).toBe(true);
      expect(result.blocks.length).toBe(2);
      expect(result).toHaveProperty('metadata');

      // Verify each block has required fields
      result.blocks.forEach((block) => {
        expect(block).toHaveProperty('id');
        expect(block).toHaveProperty('type');
        expect(block).toHaveProperty('content');
      });

      // Verify block content structure for specific types
      const heroBlock = result.blocks.find((b) => b.type === 'hero');
      expect(heroBlock.content).toHaveProperty('headline');
      expect(heroBlock.content).toHaveProperty('subheadline');
      expect(heroBlock.content).toHaveProperty('cta');

      const cardsBlock = result.blocks.find((b) => b.type === 'product-cards');
      expect(cardsBlock.content).toHaveProperty('cards');
      expect(Array.isArray(cardsBlock.content.cards)).toBe(true);
    });

    test('should handle 401 Unauthorized response from da.live', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'invalid-token';

      nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(401, {
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        });

      await expect(getContent(testPath, testToken)).rejects.toThrow();
    });

    test('should handle 404 Not Found response from da.live', async () => {
      const testPath = '/products/nonexistent';
      const testToken = 'valid-token';

      nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(404, {
          error: 'Not Found',
          message: 'Page not found',
        });

      await expect(getContent(testPath, testToken)).rejects.toThrow();
    });
  });

  describe('POST /content/{path} contract', () => {
    test('should send correct request with blocks array in body', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'test-bearer-token-123';
      const testBlocks = [
        {
          id: 'hero-1',
          type: 'hero',
          content: {
            headline: 'Updated Headline',
            subheadline: 'Updated Subheadline',
            cta: 'Get Started',
          },
        },
      ];

      const scope = nock(DALIVE_API_URL, {
        reqheaders: {
          authorization: `Bearer ${testToken}`,
          'content-type': 'application/json',
        },
      })
        .post(`/api/content${testPath}`, (body) => {
          // Verify request body structure
          expect(body).toHaveProperty('blocks');
          expect(Array.isArray(body.blocks)).toBe(true);
          expect(body.blocks.length).toBe(1);
          expect(body.blocks[0]).toHaveProperty('id');
          expect(body.blocks[0]).toHaveProperty('type');
          expect(body.blocks[0]).toHaveProperty('content');
          return true;
        })
        .reply(200, {
          success: true,
          path: testPath,
          updatedBlocks: ['hero-1'],
        });

      await updateContent(testPath, testBlocks, testToken);

      expect(scope.isDone()).toBe(true);
    });

    test('should receive 200 OK confirmation response from da.live', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'test-bearer-token-123';
      const testBlocks = [
        {
          id: 'hero-1',
          type: 'hero',
          content: {
            headline: 'New Headline',
            subheadline: 'New Subheadline',
            cta: 'Get Started',
          },
        },
      ];

      nock(DALIVE_API_URL)
        .post(`/api/content${testPath}`)
        .reply(200, {
          success: true,
          path: testPath,
          updatedBlocks: ['hero-1'],
          timestamp: '2025-10-04T10:30:00Z',
        });

      const result = await updateContent(testPath, testBlocks, testToken);

      // Verify response indicates successful update
      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('path', testPath);
    });

    test('should handle 401 Unauthorized response for POST', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'invalid-token';
      const testBlocks = [
        {
          id: 'hero-1',
          type: 'hero',
          content: {
            headline: 'Test',
            subheadline: 'Test',
            cta: 'Test',
          },
        },
      ];

      nock(DALIVE_API_URL)
        .post(`/api/content${testPath}`)
        .reply(401, {
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        });

      await expect(updateContent(testPath, testBlocks, testToken)).rejects.toThrow();
    });

    test('should handle 500 Server Error with retry logic', async () => {
      const testPath = '/products/enterprise';
      const testToken = 'valid-token';
      const testBlocks = [
        {
          id: 'hero-1',
          type: 'hero',
          content: {
            headline: 'Test',
            subheadline: 'Test',
            cta: 'Test',
          },
        },
      ];

      // First two attempts return 500, third attempt succeeds
      nock(DALIVE_API_URL)
        .post(`/api/content${testPath}`)
        .reply(500, { error: 'Internal Server Error' });

      nock(DALIVE_API_URL)
        .post(`/api/content${testPath}`)
        .reply(500, { error: 'Internal Server Error' });

      nock(DALIVE_API_URL)
        .post(`/api/content${testPath}`)
        .reply(200, {
          success: true,
          path: testPath,
          updatedBlocks: ['hero-1'],
        });

      const result = await updateContent(testPath, testBlocks, testToken);

      // Verify successful response after retries
      expect(result).toHaveProperty('success', true);
    });
  });

  describe('Contract compliance verification', () => {
    test('should use correct da.live API base URL', async () => {
      const testPath = '/test-path';
      const testToken = 'test-token';

      // This verifies we're calling the correct base URL
      const scope = nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(200, {
          path: testPath,
          blocks: [],
          metadata: {},
        });

      await getContent(testPath, testToken);

      expect(scope.isDone()).toBe(true);
    });

    test('should format path correctly in API requests', async () => {
      const testPath = '/products/enterprise/features';
      const testToken = 'test-token';

      // Verify path is passed correctly (with leading slash)
      const scope = nock(DALIVE_API_URL)
        .get(`/api/content${testPath}`)
        .reply(200, {
          path: testPath,
          blocks: [],
          metadata: {},
        });

      await getContent(testPath, testToken);

      expect(scope.isDone()).toBe(true);
    });
  });
});
