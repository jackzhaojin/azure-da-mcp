import { app } from '@azure/functions';
import { getContent, updateContent } from '../modules/DaliveClient.js';
import { generateEdit } from '../modules/LlmClient.js';
import { buildPrompt } from '../modules/PromptBuilder.js';
import { validate } from '../modules/ResponseValidator.js';
import { generateRequestId, logPhase } from '../modules/Logger.js';

/**
 * Azure HTTP Function: POST /api/EditContent
 * Main MCP orchestration endpoint for AI-assisted content editing
 */
app.http('EditContent', {
  methods: ['POST'],
  route: 'EditContent',
  authLevel: 'anonymous',
  handler: async (request, context) => {
    const requestId = generateRequestId();
    const overallStartTime = Date.now();
    const timing = {};

    try {
      // Parse request body
      const body = await request.json();
      const { command, path, metadata } = body;

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
      const pathPattern = /^\/[a-z0-9\-\/]+$/;
      if (!pathPattern.test(path)) {
        return {
          status: 400,
          jsonBody: {
            requestId,
            error: 'Invalid path format',
            details: 'Path must start with \'/\' and contain only lowercase letters, numbers, hyphens, and slashes'
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
      logPhase(requestId, 'request', { command, path, metadata }, null, 'success');

      // PHASE 1: Fetch content from da.live
      const daliveFetchStart = Date.now();
      let pageContent;
      try {
        pageContent = await getContent(path, bearerToken);
        timing.dalive_fetch = Date.now() - daliveFetchStart;
        logPhase(requestId, 'dalive_fetch', { blocks: pageContent.blocks, blockCount: pageContent.blocks?.length }, timing.dalive_fetch, 'success');
      } catch (error) {
        timing.dalive_fetch = Date.now() - daliveFetchStart;
        logPhase(requestId, 'dalive_fetch', { error: error.message }, timing.dalive_fetch, 'error');

        if (error.message.includes('401')) {
          return {
            status: 401,
            jsonBody: { requestId, error: 'Unauthorized', details: 'Invalid or expired Bearer token' }
          };
        }
        if (error.message.includes('404')) {
          return {
            status: 404,
            jsonBody: { requestId, error: 'Page not found', details: error.message }
          };
        }
        return {
          status: 503,
          jsonBody: { requestId, error: 'da.live API unavailable', retryAfter: 30 }
        };
      }

      // PHASE 2: Build LLM prompt
      const llmPrompt = buildPrompt(command, pageContent);

      // PHASE 3: Call LLM API
      const llmCallStart = Date.now();
      let llmResponse;
      try {
        llmResponse = await generateEdit(llmPrompt);
        timing.llm_call = Date.now() - llmCallStart;
        logPhase(requestId, 'llm_call', {
          prompt: llmPrompt,
          response: llmResponse,
          tokenUsage: llmResponse.tokenUsage
        }, timing.llm_call, 'success');
      } catch (error) {
        timing.llm_call = Date.now() - llmCallStart;
        logPhase(requestId, 'llm_call', { error: error.message }, timing.llm_call, 'error');

        return {
          status: 502,
          jsonBody: {
            requestId,
            error: 'LLM API unavailable',
            details: error.message
          }
        };
      }

      // PHASE 4: Validate LLM response
      const validationStart = Date.now();
      const validationResult = validate(llmResponse, pageContent);
      timing.validation = Date.now() - validationStart;
      logPhase(requestId, 'validation', { valid: validationResult.valid, errors: validationResult.errors }, timing.validation, validationResult.valid ? 'success' : 'error');

      if (!validationResult.valid) {
        return {
          status: 422,
          jsonBody: {
            requestId,
            error: 'Validation failed',
            validationErrors: validationResult.errors,
            llmResponse
          }
        };
      }

      // PHASE 5: Merge blocks (edited + unchanged)
      const originalBlocksMap = new Map(pageContent.blocks.map((b) => [b.id, b]));
      const mergedBlocks = [];

      // Add all edited blocks
      for (const editedBlock of llmResponse.editedBlocks) {
        mergedBlocks.push(editedBlock);
        originalBlocksMap.delete(editedBlock.id);
      }

      // Add unchanged blocks (in original order)
      for (const block of pageContent.blocks) {
        if (originalBlocksMap.has(block.id)) {
          mergedBlocks.push(block);
        }
      }

      // PHASE 6: Update content in da.live
      const daliveUpdateStart = Date.now();
      try {
        await updateContent(path, mergedBlocks, bearerToken);
        timing.dalive_update = Date.now() - daliveUpdateStart;
        logPhase(requestId, 'dalive_update', {
          updatedBlockIds: llmResponse.editedBlocks.map((b) => b.id),
          success: true
        }, timing.dalive_update, 'success');
      } catch (error) {
        timing.dalive_update = Date.now() - daliveUpdateStart;
        logPhase(requestId, 'dalive_update', { error: error.message }, timing.dalive_update, 'error');

        return {
          status: 503,
          jsonBody: {
            requestId,
            error: 'Failed to update da.live',
            details: error.message
          }
        };
      }

      // Calculate total timing
      timing.total = Date.now() - overallStartTime;

      // Log response phase
      logPhase(requestId, 'response', {
        statusCode: 200,
        editedBlockCount: llmResponse.editedBlocks.length
      }, null, 'success');

      // Return success response
      return {
        status: 200,
        jsonBody: {
          requestId,
          editedBlocks: llmResponse.editedBlocks,
          unchangedBlocks: llmResponse.unchangedBlocks,
          explanation: llmResponse.explanation,
          reasoning: llmResponse.reasoning,
          timing
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
