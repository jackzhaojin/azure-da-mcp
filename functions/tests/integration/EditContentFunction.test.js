import { describe, test, expect, beforeEach, jest } from '@jest/globals';

const DALIVE_API_URL = 'https://admin.da.live';

// Mock axios
const mockAxios = {
  get: jest.fn(),
  post: jest.fn()
};

jest.unstable_mockModule('axios', () => ({
  default: mockAxios
}));

// Mock the Anthropic SDK
const mockCreate = jest.fn();
const MockAnthropic = jest.fn(() => ({
  messages: {
    create: mockCreate
  }
}));

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: MockAnthropic
}));

// Now import the module under test
const { app } = await import('../../src/functions/EditContentFunction.js');

describe('EditContentFunction Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    process.env.DALIVE_API_URL = DALIVE_API_URL;
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DALIVE_API_URL;
  });

  describe('POST /api/EditContent', () => {
    test('should return 200 OK with edited blocks for valid request', async () => {
      // Mock da.live GET (fetch original content)
      const originalContent = {
        path: '/products/enterprise',
        blocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'Enterprise Solutions That Scale',
              subheadline: 'Built for organizations',
              cta: 'Get Started'
            }
          }
        ],
        metadata: {}
      };

      mockAxios.get.mockResolvedValue({ data: originalContent });

      // Mock Anthropic API
      const llmResponse = {
        content: [{
          text: JSON.stringify({
            editedBlocks: [
              {
                id: 'hero-1',
                type: 'hero',
                content: {
                  headline: 'Enterprise Solutions',
                  subheadline: 'Built for organizations',
                  cta: 'Start'
                },
                changeDescription: 'Made headline more concise'
              }
            ],
            unchangedBlocks: [],
            explanation: 'Reduced headline from 4 to 2 words',
            reasoning: 'Following user command to make more concise'
          })
        }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockCreate.mockResolvedValue(llmResponse);

      // Mock da.live POST (update content)
      mockAxios.post.mockResolvedValue({ data: { success: true } });

      const request = {
        method: 'POST',
        url: 'http://localhost:7071/api/EditContent',
        headers: new Map([
          ['authorization', 'Bearer test-token'],
          ['content-type', 'application/json']
        ]),
        get: function(key) { return this.headers.get(key); },
        json: async () => ({
          command: 'Make more concise',
          path: '/products/enterprise'
        })
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('EditContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(200);
      expect(response.jsonBody.requestId).toBeDefined();
      expect(response.jsonBody.editedBlocks).toHaveLength(1);
      expect(response.jsonBody.unchangedBlocks).toEqual([]);
      expect(response.jsonBody.explanation).toBeDefined();
      expect(response.jsonBody.reasoning).toBeDefined();
      expect(response.jsonBody.timing).toBeDefined();
      expect(response.jsonBody.timing.total).toBeGreaterThan(0);
    });

    test('should return 401 Unauthorized for invalid Bearer token', async () => {
      const error = new Error('Unauthorized');
      error.response = { status: 401, statusText: 'Unauthorized' };
      mockAxios.get.mockRejectedValue(error);

      const request = {
        method: 'POST',
        url: 'http://localhost:7071/api/EditContent',
        headers: new Map([
          ['authorization', 'Bearer invalid-token'],
          ['content-type', 'application/json']
        ]),
        get: function(key) { return this.headers.get(key); },
        json: async () => ({
          command: 'Test command',
          path: '/test/path'
        })
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('EditContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(401);
      expect(response.jsonBody.error).toMatch(/unauthorized/i);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should return 400 Bad Request for malformed request body', async () => {
      const request = {
        method: 'POST',
        url: 'http://localhost:7071/api/EditContent',
        headers: new Map([
          ['authorization', 'Bearer test-token'],
          ['content-type', 'application/json']
        ]),
        get: function(key) { return this.headers.get(key); },
        json: async () => ({
          // Missing 'command' field
          path: '/test/path'
        })
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('EditContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(400);
      expect(response.jsonBody.error).toMatch(/invalid|body/i);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should return 404 Not Found when da.live path does not exist', async () => {
      const error = new Error('Not Found');
      error.response = { status: 404, statusText: 'Not Found' };
      mockAxios.get.mockRejectedValue(error);

      const request = {
        method: 'POST',
        url: 'http://localhost:7071/api/EditContent',
        headers: new Map([
          ['authorization', 'Bearer test-token'],
          ['content-type', 'application/json']
        ]),
        get: function(key) { return this.headers.get(key); },
        json: async () => ({
          command: 'Make concise',
          path: '/nonexistent'
        })
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('EditContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(404);
      expect(response.jsonBody.error).toMatch(/not found/i);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should return 502 Bad Gateway when LLM API is unavailable', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          path: '/test/path',
          blocks: [{ id: 'hero-1', type: 'hero', content: {} }],
          metadata: {}
        }
      });

      const apiError = new Error('Service unavailable');
      apiError.status = 503;
      mockCreate.mockRejectedValue(apiError);

      const request = {
        method: 'POST',
        url: 'http://localhost:7071/api/EditContent',
        headers: new Map([
          ['authorization', 'Bearer test-token'],
          ['content-type', 'application/json']
        ]),
        get: function(key) { return this.headers.get(key); },
        json: async () => ({
          command: 'Test',
          path: '/test/path'
        })
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('EditContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(502);
      expect(response.jsonBody.error).toMatch(/llm.*unavailable/i);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should return 422 Unprocessable Entity for validation failures', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          path: '/test/path',
          blocks: [
            {
              id: 'hero-1',
              type: 'hero',
              content: { headline: 'Original', subheadline: 'Text', cta: 'Click' }
            }
          ],
          metadata: {}
        }
      });

      // LLM returns invalid response (block ID doesn't exist)
      const invalidLlmResponse = {
        content: [{
          text: JSON.stringify({
            editedBlocks: [
              {
                id: 'invalid-block-999',
                type: 'hero',
                content: { headline: 'Test', subheadline: 'Test', cta: 'Test' }
              }
            ],
            unchangedBlocks: ['hero-1'],
            explanation: 'Test',
            reasoning: 'Test'
          })
        }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockCreate.mockResolvedValue(invalidLlmResponse);

      const request = {
        method: 'POST',
        url: 'http://localhost:7071/api/EditContent',
        headers: new Map([
          ['authorization', 'Bearer test-token'],
          ['content-type', 'application/json']
        ]),
        get: function(key) { return this.headers.get(key); },
        json: async () => ({
          command: 'Test',
          path: '/test/path'
        })
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('EditContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(422);
      expect(response.jsonBody.error).toMatch(/validation.*failed/i);
      expect(response.jsonBody.validationErrors).toBeDefined();
      expect(Array.isArray(response.jsonBody.validationErrors)).toBe(true);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should verify response includes requestId, timing, and logs', async () => {
      mockAxios.get.mockResolvedValue({
        data: {
          path: '/test',
          blocks: [{ id: 'hero-1', type: 'hero', content: {} }],
          metadata: {}
        }
      });

      mockCreate.mockResolvedValue({
        content: [{
          text: JSON.stringify({
            editedBlocks: [],
            unchangedBlocks: ['hero-1'],
            explanation: 'No changes needed',
            reasoning: 'Content already optimal'
          })
        }],
        usage: { input_tokens: 100, output_tokens: 20 }
      });

      mockAxios.post.mockResolvedValue({ data: { success: true } });

      const request = {
        method: 'POST',
        url: 'http://localhost:7071/api/EditContent',
        headers: new Map([
          ['authorization', 'Bearer test-token'],
          ['content-type', 'application/json']
        ]),
        get: function(key) { return this.headers.get(key); },
        json: async () => ({
          command: 'Make concise',
          path: '/test'
        })
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('EditContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(200);
      const body = response.jsonBody;

      // Verify required fields
      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');

      expect(body.timing).toBeDefined();
      expect(body.timing.total).toBeGreaterThan(0);
      expect(body.timing.dalive_fetch).toBeGreaterThan(0);
      expect(body.timing.llm_call).toBeGreaterThan(0);
      expect(body.timing.validation).toBeGreaterThan(0);
      expect(body.timing.dalive_update).toBeGreaterThan(0);
    });
  });
});
