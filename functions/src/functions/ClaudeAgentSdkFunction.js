import { app } from '@azure/functions';
import { generateWithClaudeAgentSdk } from '../modules/llm-clients/ClaudeAgentSdkClient.js';
import * as Logger from '../modules/Logger.js';

/**
 * Azure Function: ClaudeAgentSdk
 *
 * Infrastructure endpoint for Claude API using the Claude Agent SDK with MCP tool support.
 * This is a thin wrapper - business logic should remain in calling functions.
 *
 * POST /api/ClaudeAgentSdk
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
app.http('ClaudeAgentSdk', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ClaudeAgentSdk',
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

      Logger.info('Claude Agent SDK endpoint called', {
        model: model || 'default',
        hasMcpConfig: !!mcpConfig,
        promptLength: JSON.stringify(prompt).length
      });

      // Call Claude Agent SDK client
      const result = await generateWithClaudeAgentSdk(prompt, mcpConfig, model);

      const totalTime = Date.now() - startTime;

      Logger.info('Claude Agent SDK endpoint completed', {
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
      Logger.error('Claude Agent SDK endpoint failed', {
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
          error: 'Claude Agent SDK error',
          message: error.message,
          duration: Date.now() - startTime
        }
      };
    }
  }
});
