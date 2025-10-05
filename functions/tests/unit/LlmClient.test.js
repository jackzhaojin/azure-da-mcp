import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

// Mock the Anthropic SDK
const mockCreate = jest.fn();
const MockAnthropic = jest.fn(() => ({
  messages: {
    create: mockCreate
  }
}));

// Mock the module before importing
jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: MockAnthropic
}));

// Now import the module under test
const { generateEdit } = await import('../../src/modules/LlmClient.js');

describe('LlmClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe('generateEdit', () => {
    test('should successfully generate edit with mocked Anthropic API response', async () => {
      const mockPrompt = {
        systemInstructions: 'You are an expert content editor',
        userCommand: 'Make more concise',
        pageContext: JSON.stringify({ blocks: [] }),
        editingGuidelines: 'Preserve facts',
        totalTokens: 100
      };

      const mockApiResponse = {
        content: [{
          text: JSON.stringify({
            editedBlocks: [
              {
                id: 'hero-1',
                type: 'hero',
                content: { headline: 'Short', subheadline: 'Brief', cta: 'Go' },
                changeDescription: 'Reduced word count'
              }
            ],
            unchangedBlocks: [],
            explanation: 'Made content more concise',
            reasoning: 'Following user command'
          })
        }],
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      };

      mockCreate.mockResolvedValue(mockApiResponse);

      const result = await generateEdit(mockPrompt);

      expect(result.editedBlocks).toHaveLength(1);
      expect(result.editedBlocks[0].id).toBe('hero-1');
      expect(result.explanation).toBe('Made content more concise');
      expect(result.tokenUsage).toEqual({
        inputTokens: 100,
        outputTokens: 50
      });
    });

    test('should retry on 429 rate limit with exponential backoff', async () => {
      const mockPrompt = {
        systemInstructions: 'Test',
        userCommand: 'Test',
        pageContext: '{}',
        editingGuidelines: 'Test',
        totalTokens: 50
      };

      const mockResponse = {
        content: [{
          text: JSON.stringify({
            editedBlocks: [],
            unchangedBlocks: ['hero-1'],
            explanation: 'Success after retry',
            reasoning: 'Test'
          })
        }],
        usage: { input_tokens: 50, output_tokens: 25 }
      };

      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;

      // First two attempts return 429, third succeeds
      mockCreate
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockResponse);

      const startTime = Date.now();
      const result = await generateEdit(mockPrompt);
      const endTime = Date.now();

      expect(result.explanation).toBe('Success after retry');
      // Should have waited at least 3 seconds (1s + 2s backoff)
      expect(endTime - startTime).toBeGreaterThanOrEqual(3000);
    });

    test('should handle timeout scenario', async () => {
      const mockPrompt = {
        systemInstructions: 'Test',
        userCommand: 'Test',
        pageContext: '{}',
        editingGuidelines: 'Test',
        totalTokens: 50
      };

      const timeoutError = new Error('Request timed out');
      mockCreate.mockRejectedValue(timeoutError);

      await expect(generateEdit(mockPrompt))
        .rejects
        .toThrow(/timeout|timed out|failed/i);
    });

    test('should track token usage correctly', async () => {
      const mockPrompt = {
        systemInstructions: 'Test',
        userCommand: 'Test',
        pageContext: '{}',
        editingGuidelines: 'Test',
        totalTokens: 1000
      };

      const mockResponse = {
        content: [{
          text: JSON.stringify({
            editedBlocks: [],
            unchangedBlocks: [],
            explanation: 'Test',
            reasoning: 'Test'
          })
        }],
        usage: {
          input_tokens: 1234,
          output_tokens: 567
        }
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await generateEdit(mockPrompt);

      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage.inputTokens).toBe(1234);
      expect(result.tokenUsage.outputTokens).toBe(567);
    });

    test('should throw structured error for API failures', async () => {
      const mockPrompt = {
        systemInstructions: 'Test',
        userCommand: 'Test',
        pageContext: '{}',
        editingGuidelines: 'Test',
        totalTokens: 50
      };

      const apiError = new Error('Internal server error');
      apiError.status = 500;

      mockCreate.mockRejectedValue(apiError);

      await expect(generateEdit(mockPrompt))
        .rejects
        .toThrow(/API.*fail|500|error|server/i);
    });
  });
});
