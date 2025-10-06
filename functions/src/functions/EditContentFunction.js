import { app } from '@azure/functions';
import { generateEdit } from '../modules/LlmClient.js';
import { buildPrompt } from '../modules/PromptBuilder.js';
import * as Logger from '../modules/Logger.js';

/**
 * Azure HTTP Function: POST /api/EditContent
 * MCP-enabled AI-assisted content editing
 *
 * The LLM autonomously calls MCP tools (get_dalive_content, save_dalive_content)
 * to fetch and save content. This function orchestrates the LLM with MCP configuration.
 */
app.http('EditContent', {
  methods: ['POST'],
  route: 'EditContent',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const requestId = Logger.generateRequestId();
    const overallStartTime = Date.now();
    const timing = {};

    try {
      // Parse request body
      const body = await request.json();
      const { command, path, metadata } = body;

      Logger.info('EditContent request received', {
        requestId,
        command: command?.substring(0, 100), // Truncate for logging
        path,
        hasMetadata: !!metadata
      }, context);

      // Validate request
      if (!command || typeof command !== 'string' || command.trim().length === 0) {
        return {
          status: 400,
          jsonBody: {
            requestId,
            error: 'Invalid request body',
            details: 'Field \'command\' is required and must be a non-empty string'
          }
        };
      }

      if (!path || typeof path !== 'string') {
        return {
          status: 400,
          jsonBody: {
            requestId,
            error: 'Invalid request body',
            details: 'Field \'path\' is required and must be a string'
          }
        };
      }

      // Validate path format
      const pathPattern = /^\/[a-z0-9\-\/\.]+$/;
      if (!pathPattern.test(path)) {
        return {
          status: 400,
          jsonBody: {
            requestId,
            error: 'Invalid path format',
            details: 'Path must start with \'/\' and contain only lowercase letters, numbers, hyphens, dots, and slashes'
          }
        };
      }

      // Extract Bearer token
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
          status: 401,
          jsonBody: {
            requestId,
            error: 'Unauthorized',
            details: 'Missing or invalid Authorization header'
          }
        };
      }

      const bearerToken = authHeader.substring(7);

      // Log request phase
      Logger.logPhase(requestId, 'request', { command, path, metadata }, null, 'success');

      Logger.info('Building LLM prompt', {
        requestId,
        path,
        hasMcp: true
      }, context);

      // Build LLM prompt (no pre-fetched HTML - LLM will fetch via MCP tools)
      const llmPrompt = buildPrompt(command, null, path);

      // Get MCP server URL from environment
      const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:7071/api/mcp';

      Logger.info('Initializing MCP configuration', {
        requestId,
        mcpServerUrl,
        hasBearerToken: !!bearerToken
      }, context);

      // MCP Configuration - pass Bearer token for tool authentication
      const mcpConfig = {
        serverUrl: mcpServerUrl,
        bearerToken: bearerToken
      };

      // Call LLM with MCP tools enabled
      // The LLM will autonomously:
      // 1. Call get_dalive_content to fetch HTML
      // 2. Generate edits
      // 3. Call save_dalive_content to save edited HTML
      Logger.info('Starting LLM edit generation with MCP tools', {
        requestId,
        command: command.substring(0, 100)
      }, context);

      const llmCallStart = Date.now();
      let llmResponse;
      try {
        llmResponse = await generateEdit(llmPrompt, mcpConfig);
        timing.llm_call = Date.now() - llmCallStart;

        // Extract MCP tool call timings
        if (llmResponse.mcpToolCalls) {
          llmResponse.mcpToolCalls.forEach(toolCall => {
            if (toolCall.toolName === 'get_dalive_content') {
              timing.mcp_get_content = toolCall.duration;
            } else if (toolCall.toolName === 'save_dalive_content') {
              timing.mcp_save_content = toolCall.duration;
            }
          });
        }

        Logger.info('LLM edit generation completed successfully', {
          requestId,
          duration: `${timing.llm_call}ms`,
          inputTokens: llmResponse.tokenUsage?.inputTokens,
          outputTokens: llmResponse.tokenUsage?.outputTokens,
          mcpToolCalls: llmResponse.mcpToolCalls?.length || 0,
          editedHtmlLength: llmResponse.editedHtml?.length || 0
        }, context);

        Logger.logPhase(requestId, 'llm_call', {
          prompt: llmPrompt,
          response: llmResponse,
          tokenUsage: llmResponse.tokenUsage,
          mcpToolCalls: llmResponse.mcpToolCalls
        }, timing.llm_call, 'success');
      } catch (error) {
        timing.llm_call = Date.now() - llmCallStart;

        Logger.error('LLM edit generation failed', {
          requestId,
          error: error.message,
          stack: error.stack,
          duration: `${timing.llm_call}ms`
        }, context);

        Logger.logPhase(requestId, 'llm_call', { error: error.message }, timing.llm_call, 'error');

        // Check for specific error types from MCP tools
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          return {
            status: 401,
            jsonBody: {
              requestId,
              error: 'Unauthorized',
              details: 'Invalid or expired Bearer token'
            }
          };
        }

        if (error.message.includes('404') || error.message.includes('not found')) {
          return {
            status: 404,
            jsonBody: {
              requestId,
              error: 'Page not found',
              details: error.message
            }
          };
        }

        return {
          status: 502,
          jsonBody: {
            requestId,
            error: 'LLM API or MCP workflow failed',
            details: error.message
          }
        };
      }

      // Calculate total timing
      timing.total = Date.now() - overallStartTime;

      // Log response phase
      Logger.logPhase(requestId, 'response', {
        statusCode: 200,
        htmlLength: llmResponse.editedHtml?.length,
        mcpToolCallsCount: llmResponse.mcpToolCalls?.length || 0
      }, null, 'success');

      // Return success response
      return {
        status: 200,
        jsonBody: {
          requestId,
          editedHtmlLength: llmResponse.editedHtml?.length,
          explanation: llmResponse.explanation,
          reasoning: llmResponse.reasoning,
          timing,
          mcpToolCalls: llmResponse.mcpToolCalls // Include MCP tool call details
        }
      };
    } catch (error) {
      context.log('EditContent error:', error.message, error.stack);

      return {
        status: 500,
        jsonBody: {
          requestId,
          error: 'Internal server error',
          details: error.message
        }
      };
    }
  }
});

export { app };
