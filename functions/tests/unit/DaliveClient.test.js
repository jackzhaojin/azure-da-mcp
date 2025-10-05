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

// Import module under test after mocking
const { getContent, updateContent } = await import('../../src/modules/DaliveClient.js');

describe('DaliveClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getContent', () => {
    test('should successfully fetch content with 200 OK response', async () => {
      const mockResponse = {
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

      mockAxios.get.mockResolvedValue({ data: mockResponse });

      const result = await getContent('/products/enterprise', 'test-token');

      expect(result).toEqual(mockResponse);
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].id).toBe('hero-1');
      expect(mockAxios.get).toHaveBeenCalledWith(
        `${DALIVE_API_URL}/api/content/products/enterprise`,
        expect.objectContaining({
          headers: { 'Authorization': 'Bearer test-token' }
        })
      );
    });

    test('should include Bearer token in Authorization header', async () => {
      const bearerToken = 'test-bearer-token-123';

      mockAxios.get.mockResolvedValue({ data: { path: '/test/path', blocks: [] } });

      await getContent('/test/path', bearerToken);

      expect(mockAxios.get).toHaveBeenCalledWith(
        `${DALIVE_API_URL}/api/content/test/path`,
        expect.objectContaining({
          headers: { 'Authorization': `Bearer ${bearerToken}` }
        })
      );
    });

    test('should throw error with 401 Unauthorized', async () => {
      const error = new Error('Request failed');
      error.response = { status: 401, statusText: 'Unauthorized' };
      mockAxios.get.mockRejectedValue(error);

      await expect(getContent('/test/path', 'invalid-token'))
        .rejects
        .toThrow(/401|Unauthorized/i);
    });

    test('should throw error with 404 Not Found', async () => {
      const error = new Error('Request failed');
      error.response = { status: 404, statusText: 'Not Found' };
      mockAxios.get.mockRejectedValue(error);

      await expect(getContent('/nonexistent/path', 'test-token'))
        .rejects
        .toThrow(/404|not found/i);
    });
  });

  describe('updateContent', () => {
    test('should successfully update content with 200 OK response', async () => {
      const updatedBlocks = [
        {
          id: 'hero-1',
          type: 'hero',
          content: {
            headline: 'New Headline',
            subheadline: 'New Subheadline',
            cta: 'Click Here'
          }
        }
      ];

      mockAxios.post.mockResolvedValue({ data: { success: true } });

      const result = await updateContent('/products/enterprise', updatedBlocks, 'test-token');

      expect(result.success).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledWith(
        `${DALIVE_API_URL}/api/content/products/enterprise`,
        { blocks: updatedBlocks },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    test('should retry on 500 error with exponential backoff (3 attempts)', async () => {
      const updatedBlocks = [{ id: 'hero-1', type: 'hero', content: {} }];

      const error500 = new Error('Server error');
      error500.response = { status: 500, statusText: 'Internal Server Error' };

      // First two calls fail with 500, third succeeds
      mockAxios.post
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce({ data: { success: true } });

      const startTime = Date.now();
      const result = await updateContent('/test/path', updatedBlocks, 'test-token');
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(mockAxios.post).toHaveBeenCalledTimes(3);
      // Should have taken at least 3 seconds (1s + 2s backoff)
      expect(endTime - startTime).toBeGreaterThanOrEqual(3000);
    });

    test('should fail after 3 retry attempts on persistent 500 errors', async () => {
      const updatedBlocks = [{ id: 'hero-1', type: 'hero', content: {} }];

      const error500 = new Error('Server error');
      error500.response = { status: 500, statusText: 'Internal Server Error' };

      mockAxios.post.mockRejectedValue(error500);

      await expect(updateContent('/test/path', updatedBlocks, 'test-token'))
        .rejects
        .toThrow(/retry|failed/i);

      expect(mockAxios.post).toHaveBeenCalledTimes(3);
    });

    test('should include Bearer token in Authorization header for update', async () => {
      const bearerToken = 'update-token-456';
      const updatedBlocks = [{ id: 'hero-1', type: 'hero', content: {} }];

      mockAxios.post.mockResolvedValue({ data: { success: true } });

      await updateContent('/test/path', updatedBlocks, bearerToken);

      expect(mockAxios.post).toHaveBeenCalledWith(
        `${DALIVE_API_URL}/api/content/test/path`,
        { blocks: updatedBlocks },
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${bearerToken}`
          })
        })
      );
    });
  });
});
