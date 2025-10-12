import { app } from '@azure/functions';
import { generateWithAzureAI } from '../modules/llm-clients/AzureAIFoundryClient.js';
import * as Logger from '../modules/Logger.js';

/**
 * Azure Function: AzureAIFoundryLlmClient
 *
 * Infrastructure endpoint for Azure AI Foundry API with MCP tool support.
 * This is a thin wrapper - business logic should remain in calling functions.
 *
 * POST /api/AzureAIFoundryLlmClient
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
 *   "model": "gpt-4o" // Optional, uses AZURE_MODEL env var if not specified
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
app.http('AzureAIFoundryLlmClient', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'AzureAIFoundryLlmClient',
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

      Logger.info('Azure AI Foundry LLM client endpoint called', {
        model: model || 'default',
        hasMcpConfig: !!mcpConfig,
        promptLength: JSON.stringify(prompt).length
      });

      // Call Azure AI Foundry client
      const result = await generateWithAzureAI(prompt, mcpConfig, model);

      const totalTime = Date.now() - startTime;

      Logger.info('Azure AI Foundry LLM client endpoint completed', {
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
      Logger.error('Azure AI Foundry LLM client endpoint failed', {
        error: error.message,
        stack: error.stack
      });

      // Determine appropriate status code
      let statusCode = 500;
      if (error.message?.includes('AZURE_AI_FOUNDRY_API_KEY')) {
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
          error: 'Azure AI Foundry API error',
          message: error.message,
          duration: Date.now() - startTime
        }
      };
    }
  }
});
