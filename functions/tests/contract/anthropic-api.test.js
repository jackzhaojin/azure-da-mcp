/**
 * Contract Tests: Anthropic Claude API
 *
 * Tests verify that our LlmClient module correctly implements the expected
 * Anthropic Claude API contract for message generation.
 *
 * These tests use nock to mock the Anthropic API and verify request/response format.
 */

import nock from 'nock';
import { generateEdit } from '../../src/modules/LlmClient.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com';

describe('Anthropic Claude API Contract Tests', () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeAll(() => {
    // Set test API key
    process.env.ANTHROPIC_API_KEY = 'test-api-key-123';
  });

  afterAll(() => {
    // Restore original API key
    process.env.ANTHROPIC_API_KEY = originalEnv;
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('POST /v1/messages contract', () => {
    test('should send correct request with required fields: model, max_tokens, temperature, messages', async () => {
      const testPrompt = 'Test prompt for content editing';

      const scope = nock(ANTHROPIC_API_URL, {
        reqheaders: {
          'x-api-key': 'test-api-key-123',
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
      })
        .post('/v1/messages', (body) => {
          // Verify request body structure matches Anthropic API contract
          expect(body).toHaveProperty('model');
          expect(body.model).toContain('claude');

          expect(body).toHaveProperty('max_tokens');
          expect(typeof body.max_tokens).toBe('number');
          expect(body.max_tokens).toBeGreaterThan(0);

          expect(body).toHaveProperty('temperature');
          expect(typeof body.temperature).toBe('number');

          expect(body).toHaveProperty('messages');
          expect(Array.isArray(body.messages)).toBe(true);
          expect(body.messages.length).toBeGreaterThan(0);

          return true;
        })
        .reply(200, {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test explanation',
                reasoning: 'Test reasoning',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        });

      await generateEdit(testPrompt);

      expect(scope.isDone()).toBe(true);
    });

    test('should receive response with content array and text field', async () => {
      const testPrompt = 'Make this more concise';

      const mockResponse = {
        editedBlocks: [
          {
            id: 'hero-1',
            type: 'hero',
            content: {
              headline: 'New Headline',
              subheadline: 'New Subheadline',
              cta: 'Get Started',
            },
            changeDescription: 'Reduced headline from 8 to 2 words',
          },
        ],
        unchangedBlocks: ['cards-1', 'cta-1'],
        explanation: 'Simplified hero section',
        reasoning: 'Made headline more concise as requested',
      };

      nock(ANTHROPIC_API_URL)
        .post('/v1/messages')
        .reply(200, {
          id: 'msg_456',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify(mockResponse),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 150,
            output_tokens: 75,
          },
        });

      const result = await generateEdit(testPrompt);

      // Verify response structure
      expect(result).toHaveProperty('editedBlocks');
      expect(result).toHaveProperty('unchangedBlocks');
      expect(result).toHaveProperty('explanation');
      expect(result).toHaveProperty('reasoning');
      expect(result).toHaveProperty('tokenUsage');
    });

    test('should include usage field with input_tokens and output_tokens in response', async () => {
      const testPrompt = 'Test prompt';

      nock(ANTHROPIC_API_URL)
        .post('/v1/messages')
        .reply(200, {
          id: 'msg_789',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 200,
            output_tokens: 100,
          },
        });

      const result = await generateEdit(testPrompt);

      // Verify token usage is tracked
      expect(result.tokenUsage).toHaveProperty('inputTokens', 200);
      expect(result.tokenUsage).toHaveProperty('outputTokens', 100);
    });

    test('should handle 429 rate limit response with retry logic', async () => {
      const testPrompt = 'Test prompt';

      // First request returns 429 (rate limit)
      nock(ANTHROPIC_API_URL)
        .post('/v1/messages')
        .reply(429, {
          type: 'error',
          error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded',
          },
        });

      // Second request succeeds
      nock(ANTHROPIC_API_URL)
        .post('/v1/messages')
        .reply(200, {
          id: 'msg_retry',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 50,
            output_tokens: 25,
          },
        });

      const result = await generateEdit(testPrompt);

      // Verify successful response after retry
      expect(result).toHaveProperty('explanation');
      expect(result).toHaveProperty('tokenUsage');
    });

    test('should use correct Anthropic API version header', async () => {
      const testPrompt = 'Test prompt';

      const scope = nock(ANTHROPIC_API_URL, {
        reqheaders: {
          'anthropic-version': '2023-06-01',
        },
      })
        .post('/v1/messages')
        .reply(200, {
          id: 'msg_version',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
          },
        });

      await generateEdit(testPrompt);

      expect(scope.isDone()).toBe(true);
    });

    test('should send API key in x-api-key header', async () => {
      const testPrompt = 'Test prompt';

      const scope = nock(ANTHROPIC_API_URL, {
        reqheaders: {
          'x-api-key': 'test-api-key-123',
        },
      })
        .post('/v1/messages')
        .reply(200, {
          id: 'msg_auth',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 15,
            output_tokens: 8,
          },
        });

      await generateEdit(testPrompt);

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('Message structure contract', () => {
    test('should format messages array with role and content fields', async () => {
      const testPrompt = 'Test editing command';

      const scope = nock(ANTHROPIC_API_URL)
        .post('/v1/messages', (body) => {
          // Verify messages array structure
          expect(body.messages).toBeDefined();
          expect(Array.isArray(body.messages)).toBe(true);

          // Verify each message has role and content
          body.messages.forEach((message) => {
            expect(message).toHaveProperty('role');
            expect(message).toHaveProperty('content');
            expect(['user', 'assistant']).toContain(message.role);
          });

          return true;
        })
        .reply(200, {
          id: 'msg_structure',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 20,
            output_tokens: 10,
          },
        });

      await generateEdit(testPrompt);

      expect(scope.isDone()).toBe(true);
    });

    test('should use claude-sonnet model family', async () => {
      const testPrompt = 'Test prompt';

      const scope = nock(ANTHROPIC_API_URL)
        .post('/v1/messages', (body) => {
          expect(body.model).toContain('claude');
          expect(body.model).toContain('sonnet');
          return true;
        })
        .reply(200, {
          id: 'msg_model',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 30,
            output_tokens: 15,
          },
        });

      await generateEdit(testPrompt);

      expect(scope.isDone()).toBe(true);
    });

    test('should set max_tokens to 4096', async () => {
      const testPrompt = 'Test prompt';

      const scope = nock(ANTHROPIC_API_URL)
        .post('/v1/messages', (body) => {
          expect(body.max_tokens).toBe(4096);
          return true;
        })
        .reply(200, {
          id: 'msg_tokens',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 25,
            output_tokens: 12,
          },
        });

      await generateEdit(testPrompt);

      expect(scope.isDone()).toBe(true);
    });

    test('should set temperature to 0.3 for consistent output', async () => {
      const testPrompt = 'Test prompt';

      const scope = nock(ANTHROPIC_API_URL)
        .post('/v1/messages', (body) => {
          expect(body.temperature).toBe(0.3);
          return true;
        })
        .reply(200, {
          id: 'msg_temp',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 35,
            output_tokens: 18,
          },
        });

      await generateEdit(testPrompt);

      expect(scope.isDone()).toBe(true);
    });
  });

  describe('Error handling contract', () => {
    test('should handle API errors with proper error structure', async () => {
      const testPrompt = 'Test prompt';

      nock(ANTHROPIC_API_URL)
        .post('/v1/messages')
        .reply(500, {
          type: 'error',
          error: {
            type: 'api_error',
            message: 'Internal server error',
          },
        });

      await expect(generateEdit(testPrompt)).rejects.toThrow();
    });

    test('should handle timeout scenarios', async () => {
      const testPrompt = 'Test prompt';

      nock(ANTHROPIC_API_URL)
        .post('/v1/messages')
        .delayConnection(20000) // 20 second delay to trigger timeout
        .reply(200, {
          id: 'msg_timeout',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                editedBlocks: [],
                unchangedBlocks: [],
                explanation: 'Test',
                reasoning: 'Test',
              }),
            },
          ],
          model: 'claude-sonnet-4-20250514',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 40,
            output_tokens: 20,
          },
        });

      // Timeout should cause rejection
      await expect(generateEdit(testPrompt)).rejects.toThrow();
    });
  });
});
