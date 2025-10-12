import { app } from '@azure/functions';
import { generateWithClaude } from '../modules/llm-clients/ClaudeClient.js';
import * as Logger from '../modules/Logger.js';

/**
 * Azure Function: ClaudeLlmClient
 *
 * Infrastructure endpoint for Claude API with MCP tool support.
 * This is a thin wrapper - business logic should remain in calling functions.
 *
 * POST /api/ClaudeLlmClient
 *
 * Request body:
 * {
 *   "prompt": {
 *     "systemInstructions": "...",
 *     "userCommand": "...",
 *     "pageContext": "...",
 *     "editingGuidelines": "..."
 *   },
 *   "mcpConfig": {
 *     "serverUrl": "http://localhost:7071/api/mcp",
 *     "bearerToken": "your-dalive-token"
 *   },
 *   "model": "claude-sonnet-4-20250514" // Optional, uses CLAUDE_MODEL env var if not specified
 * }
 *
 * Response:
 * {
 *   "editedHtml": "...",
 *   "explanation": "...",
 *   "reasoning": "...",
 *   "tokenUsage": { "inputTokens": 123, "outputTokens": 456 },
 *   "mcpToolCalls": [...]
 * }
 */
app.http('ClaudeLlmClient', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ClaudeLlmClient',
  handler: async (request, context) => {
    const startTime = Date.now();

    try {
      // Parse request body
      const body = await request.json();
      const { prompt, mcpConfig, model } = body;

      // Validate required fields
      if (!prompt) {
        return {
          status: 400,
          jsonBody: {
            error: 'Missing required field: prompt',
            message: 'Request body must include a prompt object with systemInstructions, userCommand, pageContext, and editingGuidelines'
          }
        };
      }

      Logger.info('Claude LLM client endpoint called', {
        model: model || 'default',
        hasMcpConfig: !!mcpConfig,
        promptLength: JSON.stringify(prompt).length
      });

      // Call Claude client
      const result = await generateWithClaude(prompt, mcpConfig, model);

      const totalTime = Date.now() - startTime;

      Logger.info('Claude LLM client endpoint completed', {
        duration: `${totalTime}ms`,
        inputTokens: result.tokenUsage?.inputTokens,
        outputTokens: result.tokenUsage?.outputTokens,
        toolCallsCount: result.mcpToolCalls?.length || 0
      });

      return {
        status: 200,
        jsonBody: {
          ...result,
          timing: {
            total: totalTime
          }
        }
      };

    } catch (error) {
      Logger.error('Claude LLM client endpoint failed', {
        error: error.message,
        stack: error.stack
      });

      // Determine appropriate status code
      let statusCode = 500;
      if (error.message?.includes('ANTHROPIC_API_KEY')) {
        statusCode = 401;
      } else if (error.message?.includes('timeout')) {
        statusCode = 504;
      } else if (error.message?.includes('rate limit')) {
        statusCode = 429;
      }

      return {
        status: statusCode,
        jsonBody: {
          error: 'Claude API error',
          message: error.message,
          duration: Date.now() - startTime
        }
      };
    }
  }
});
