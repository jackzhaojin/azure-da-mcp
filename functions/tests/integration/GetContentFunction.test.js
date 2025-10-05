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

// Import after mocking
const { app } = await import('../../src/functions/GetContentFunction.js');

describe('GetContentFunction Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/GetContent/{path}', () => {
    test('should return 200 OK with page content for valid request', async () => {
      const mockPageContent = {
        path: '/products/enterprise',
        blocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'Enterprise Solutions',
              subheadline: 'Scale your business',
              cta: 'Get Started'
            }
          }
        ],
        metadata: {
          title: 'Enterprise Product',
          lastModified: '2025-10-04T12:00:00Z'
        }
      };

      mockAxios.get.mockResolvedValue({ data: mockPageContent });

      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/GetContent/products/enterprise',
        params: { path: 'products/enterprise' },
        headers: new Map([['authorization', 'Bearer test-token-123']]),
        get: function(key) { return this.headers.get(key); }
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('GetContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(200);
      expect(response.jsonBody.path).toBe('/products/enterprise');
      expect(response.jsonBody.blocks).toHaveLength(1);
      expect(response.jsonBody.blocks[0].id).toBe('hero-1');
      expect(response.jsonBody.metadata).toBeDefined();
      expect(response.jsonBody.timestamp).toBeDefined();
    });

    test('should return 401 Unauthorized for invalid Bearer token', async () => {
      const error = new Error('Unauthorized');
      error.response = { status: 401, statusText: 'Unauthorized' };
      mockAxios.get.mockRejectedValue(error);

      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/GetContent/test/path',
        params: { path: 'test/path' },
        headers: new Map([['authorization', 'Bearer invalid-token']]),
        get: function(key) { return this.headers.get(key); }
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('GetContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(401);
      expect(response.jsonBody.error).toMatch(/unauthorized/i);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should return 404 Not Found for non-existent path', async () => {
      const error = new Error('Not Found');
      error.response = { status: 404, statusText: 'Not Found' };
      mockAxios.get.mockRejectedValue(error);

      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/GetContent/nonexistent/page',
        params: { path: 'nonexistent/page' },
        headers: new Map([['authorization', 'Bearer test-token']]),
        get: function(key) { return this.headers.get(key); }
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('GetContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(404);
      expect(response.jsonBody.error).toMatch(/not found/i);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should return 400 Bad Request for malformed path', async () => {
      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/GetContent/UPPERCASE/PATH',
        params: { path: 'UPPERCASE/PATH' },
        headers: new Map([['authorization', 'Bearer test-token']]),
        get: function(key) { return this.headers.get(key); }
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('GetContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(400);
      expect(response.jsonBody.error).toMatch(/invalid.*path/i);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should return 503 Service Unavailable when da.live is down', async () => {
      const error = new Error('Server Error');
      error.response = { status: 500, statusText: 'Internal Server Error' };
      mockAxios.get.mockRejectedValue(error);

      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/GetContent/test/path',
        params: { path: 'test/path' },
        headers: new Map([['authorization', 'Bearer test-token']]),
        get: function(key) { return this.headers.get(key); }
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('GetContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(503);
      expect(response.jsonBody.error).toMatch(/unavailable|retry/i);
      expect(response.jsonBody.requestId).toBeDefined();
    });

    test('should verify response structure includes all required fields', async () => {
      const mockPageContent = {
        path: '/test',
        blocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: { headline: 'Test', subheadline: 'Test', cta: 'Test' }
          }
        ],
        metadata: { title: 'Test Page' }
      };

      mockAxios.get.mockResolvedValue({ data: mockPageContent });

      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/GetContent/test',
        params: { path: 'test' },
        headers: new Map([['authorization', 'Bearer test-token']]),
        get: function(key) { return this.headers.get(key); }
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('GetContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(200);
      const body = response.jsonBody;

      // Verify all required response fields
      expect(body).toHaveProperty('path');
      expect(body).toHaveProperty('blocks');
      expect(body).toHaveProperty('metadata');
      expect(body).toHaveProperty('timestamp');

      // Verify blocks structure
      expect(Array.isArray(body.blocks)).toBe(true);
      expect(body.blocks[0]).toHaveProperty('id');
      expect(body.blocks[0]).toHaveProperty('type');
      expect(body.blocks[0]).toHaveProperty('content');
    });

    test('should verify all blocks are returned correctly', async () => {
      const mockPageContent = {
        path: '/multi-block',
        blocks: [
          { id: 'hero-1', type: 'hero', content: {} },
          { id: 'cards-1', type: 'product-cards', content: {} },
          { id: 'cta-1', type: 'cta', content: {} }
        ],
        metadata: { title: 'Multi Block Page' }
      };

      mockAxios.get.mockResolvedValue({ data: mockPageContent });

      const request = {
        method: 'GET',
        url: 'http://localhost:7071/api/GetContent/multi-block',
        params: { path: 'multi-block' },
        headers: new Map([['authorization', 'Bearer test-token']]),
        get: function(key) { return this.headers.get(key); }
      };

      const context = { log: jest.fn() };
      const functionHandler = app.getHttpHandler('GetContent');
      const response = await functionHandler(request, context);

      expect(response.status).toBe(200);
      expect(response.jsonBody.blocks).toHaveLength(3);

      const blockIds = response.jsonBody.blocks.map((b) => b.id);
      expect(blockIds).toContain('hero-1');
      expect(blockIds).toContain('cards-1');
      expect(blockIds).toContain('cta-1');
    });
  });
});
