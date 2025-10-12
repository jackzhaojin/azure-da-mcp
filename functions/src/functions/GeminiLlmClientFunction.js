import { app } from '@azure/functions';
import { generateWithGemini } from '../modules/llm-clients/GeminiClient.js';
import * as Logger from '../modules/Logger.js';

/**
 * Azure Function: GeminiLlmClient
 *
 * Infrastructure endpoint for Google Gemini API with MCP tool support.
 * This is a thin wrapper - business logic should remain in calling functions.
 *
 * POST /api/GeminiLlmClient
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
 *   "model": "gemini-2.0-flash-exp" // Optional, uses GEMINI_MODEL env var if not specified
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
app.http('GeminiLlmClient', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'GeminiLlmClient',
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

      Logger.info('Gemini LLM client endpoint called', {
        model: model || 'default',
        hasMcpConfig: !!mcpConfig,
        promptLength: JSON.stringify(prompt).length
      });

      // Call Gemini client
      const result = await generateWithGemini(prompt, mcpConfig, model);

      const totalTime = Date.now() - startTime;

      Logger.info('Gemini LLM client endpoint completed', {
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
      Logger.error('Gemini LLM client endpoint failed', {
        error: error.message,
        stack: error.stack
      });

      // Determine appropriate status code
      let statusCode = 500;
      if (error.message?.includes('GEMINI_API_KEY')) {
        statusCode = 401;
      } else if (error.message?.includes('not yet implemented')) {
        statusCode = 501; // Not Implemented
      } else if (error.message?.includes('timeout')) {
        statusCode = 504;
      } else if (error.message?.includes('rate limit')) {
        statusCode = 429;
      }

      return {
        status: statusCode,
        jsonBody: {
          error: 'Gemini API error',
          message: error.message,
          duration: Date.now() - startTime
        }
      };
    }
  }
});
