import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as Logger from '../Logger.js';

const MAX_TOKENS = 4096;
const TEMPERATURE = 0.3;
const MAX_RETRIES = 1; // Reduced to 1 for debugging
const INITIAL_BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 120000; // 120 seconds for Claude API
const MAX_TOOL_ITERATIONS = 10; // Prevent infinite tool calling loops

/**
 * Generate content using Claude API with MCP tool support
 * @param {Object} prompt - Complete LLM prompt with all sections
 * @param {Object} mcpConfig - MCP configuration
 * @param {string} mcpConfig.serverUrl - MCP server URL (e.g., 'http://localhost:7071/api/mcp')
 * @param {string} mcpConfig.bearerToken - da.live Bearer token for MCP session
 * @param {string} model - Claude model to use (e.g., 'claude-sonnet-4-20250514')
 * @returns {Promise<Object>} LLM response with edited HTML, explanation, reasoning, token usage, and MCP tool calls
 * @throws {Error} On API failure or timeout
 */
export async function generateWithClaude(prompt, mcpConfig = null, model = null) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === '<placeholder>') {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // Use provided model or fall back to environment variable or default
  const claudeModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

  const client = new Anthropic({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS
  });

  // Initialize MCP session if config provided
  let mcpSession = null;
  if (mcpConfig && mcpConfig.serverUrl) {
    mcpSession = await initializeMcpSession(mcpConfig.serverUrl, mcpConfig.bearerToken);
  }

  // Define tools for Anthropic API
  const tools = mcpSession ? [
    {
      name: 'get_dalive_content',
      description: 'Fetch HTML content from da.live. Use this to retrieve the current content before editing.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: "da.live content path (e.g., '/products/enterprise')"
          }
        },
        required: ['path']
      }
    },
    {
      name: 'save_dalive_content',
      description: 'Save edited HTML content to da.live. Use this after you have generated the edited HTML.',
      input_schema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'da.live content path to update'
          },
          htmlContent: {
            type: 'string',
            description: 'Complete edited HTML content to save'
          }
        },
        required: ['path', 'htmlContent']
      }
    }
  ] : [];

  const messages = [
    {
      role: 'user',
      content: `${prompt.systemInstructions}

Command: ${prompt.userCommand}

${prompt.pageContext}

Guidelines:
${prompt.editingGuidelines}`
    }
  ];

  const mcpToolCalls = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Multi-turn conversation loop for tool use
      let iterationCount = 0;
      let finalResponse = null;

      while (iterationCount < MAX_TOOL_ITERATIONS) {
        iterationCount++;

        const requestParams = {
          model: claudeModel,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          messages
        };

        if (tools.length > 0) {
          requestParams.tools = tools;
        }

        Logger.info('Claude API call starting', {
          model: claudeModel,
          iteration: iterationCount,
          messagesCount: messages.length,
          hasTools: tools.length > 0,
          toolsCount: tools.length,
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS
        });

        Logger.debug('Claude API request content', {
          requestParams: JSON.stringify(requestParams, null, 2)
        });

        const llmCallStart = Date.now();
        const response = await client.messages.create(requestParams);
        const llmCallDuration = Date.now() - llmCallStart;

        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;

        Logger.info('Claude API call completed', {
          iteration: iterationCount,
          duration: `${llmCallDuration}ms`,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          stopReason: response.stop_reason,
          contentBlocks: response.content.length
        });

        Logger.debug('Claude API response content', {
          response: JSON.stringify(response.content, null, 2)
        });

        // Check if response contains tool use
        const toolUseBlock = response.content.find(block => block.type === 'tool_use');

        if (toolUseBlock && mcpSession) {
          // Claude wants to use a tool
          const toolName = toolUseBlock.name;
          const toolInput = toolUseBlock.input;
          const toolUseId = toolUseBlock.id;

          Logger.info('Claude requested tool call', {
            iteration: iterationCount,
            toolName,
            toolInput: JSON.stringify(toolInput)
          });

          // Call MCP server to execute tool
          const toolStartTime = Date.now();
          let toolResult;
          let toolStatus = 'completed';

          try {
            toolResult = await callMcpTool(mcpSession, toolName, toolInput);
            Logger.info('Tool call completed successfully', {
              toolName,
              duration: `${Date.now() - toolStartTime}ms`
            });
          } catch (toolError) {
            toolStatus = 'failed';
            toolResult = {
              error: toolError.message
            };
            Logger.error('Tool call failed', {
              toolName,
              error: toolError.message,
              duration: `${Date.now() - toolStartTime}ms`
            });
          }

          const toolDuration = Date.now() - toolStartTime;

          // Track tool call for logging
          mcpToolCalls.push({
            toolName,
            parameters: toolInput,
            result: toolResult,
            duration: toolDuration,
            status: toolStatus
          });

          // Add tool result to conversation
          messages.push({
            role: 'assistant',
            content: response.content
          });

          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolUseId,
                content: JSON.stringify(toolResult)
              }
            ]
          });

          // Continue conversation loop
          continue;
        }

        // No tool use - this is the final response
        const textBlock = response.content.find(block => block.type === 'text');
        if (textBlock) {
          const responseText = textBlock.text;

          Logger.debug('Parsing final Claude response', {
            responseTextLength: responseText.length
          });

          Logger.info('Claude raw response text', {
            rawResponse: responseText
          });

          // Strip markdown code blocks if present
          let cleanedResponseText = responseText.trim();
          
          // Remove ```json and ``` wrapper if present
          if (cleanedResponseText.startsWith('```json')) {
            cleanedResponseText = cleanedResponseText.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
          } else if (cleanedResponseText.startsWith('```')) {
            cleanedResponseText = cleanedResponseText.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
          }

          Logger.info('Cleaned Claude response for parsing', {
            originalLength: responseText.length,
            cleanedLength: cleanedResponseText.length,
            hadMarkdown: cleanedResponseText !== responseText.trim(),
            cleanedResponse: cleanedResponseText.substring(0, 200) + '...'
          });

          let llmResponse;
          try {
            llmResponse = JSON.parse(cleanedResponseText);
            Logger.info('Claude response parsed successfully', {
              parsedKeys: Object.keys(llmResponse)
            });
          } catch (parseError) {
            Logger.error('Failed to parse Claude response as JSON', {
              parseError: parseError.message,
              originalResponse: responseText.substring(0, 300),
              cleanedResponse: cleanedResponseText.substring(0, 300),
              responseType: typeof cleanedResponseText
            });
            throw new Error(`Claude returned invalid JSON: ${parseError.message}. Cleaned response: ${cleanedResponseText.substring(0, 500)}...`);
          }

          Logger.info('Claude edit generation completed successfully', {
            totalIterations: iterationCount,
            totalInputTokens,
            totalOutputTokens,
            toolCallsCount: mcpToolCalls.length,
            editedHtmlLength: llmResponse.editedHtml?.length || 0
          });

          finalResponse = {
            editedHtml: llmResponse.editedHtml || '',
            explanation: llmResponse.explanation || '',
            reasoning: llmResponse.reasoning || '',
            tokenUsage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens
            },
            mcpToolCalls: mcpToolCalls.length > 0 ? mcpToolCalls : undefined
          };
        }

        break; // Exit iteration loop
      }

      if (!finalResponse) {
        Logger.error('Claude did not return final response', {
          iterations: iterationCount,
          maxIterations: MAX_TOOL_ITERATIONS
        });
        throw new Error('Claude did not return a final response after tool iterations');
      }

      return finalResponse;

    } catch (error) {
      lastError = error;

      Logger.error('Claude API call failed in attempt', {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        errorMessage: error.message,
        errorStatus: error.status,
        errorType: error.constructor.name,
        willRetry: attempt < MAX_RETRIES - 1
      });

      // Retry on rate limiting (429)
      if (error.status === 429 && attempt < MAX_RETRIES - 1) {
        const backoffTime = INITIAL_BACKOFF_MS * (2 ** attempt);
        Logger.info('Retrying after rate limit', { backoffTime });
        await sleep(backoffTime);
        continue;
      }

      // Retry once on timeout
      if (error.message?.includes('timeout') && attempt < MAX_RETRIES - 1) {
        const backoffTime = INITIAL_BACKOFF_MS;
        Logger.info('Retrying after timeout', { backoffTime });
        await sleep(backoffTime);
        continue;
      }

      // Don't retry on other errors
      if (attempt === MAX_RETRIES - 1) {
        Logger.error('Final Claude API failure', {
          totalAttempts: MAX_RETRIES,
          finalError: error.message,
          errorDetails: {
            status: error.status,
            type: error.constructor.name,
            stack: error.stack
          }
        });
        throw new Error(`Claude API failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw new Error(`Claude API failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Initialize MCP session with the server
 * @param {string} serverUrl - MCP server URL
 * @param {string} bearerToken - Bearer token for MCP session
 * @returns {Promise<Object>} MCP session info with sessionId
 */
async function initializeMcpSession(serverUrl, bearerToken) {
  // Step 1: Initialize
  const initResponse = await axios.post(
    serverUrl,
    {
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'claude-llm-client',
          version: '1.0.0'
        }
      },
      id: `init-${randomUUID()}`
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`
      }
    }
  );

  const sessionId = initResponse.headers['mcp-session-id'];

  // Step 2: Send initialized notification (best effort - notifications don't require responses)
  try {
    await axios.post(
      serverUrl,
      {
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`,
          'Mcp-Session-Id': sessionId
        },
        validateStatus: () => true // Accept any status code for notification
      }
    );
  } catch (notificationError) {
    // Ignore notification errors - it's optional per JSON-RPC spec
    Logger.warn('Initialized notification failed (non-fatal)', {
      error: notificationError.message
    });
  }

  return {
    serverUrl,
    sessionId,
    bearerToken
  };
}

/**
 * Call MCP tool via server
 * @param {Object} session - MCP session info
 * @param {string} toolName - Name of tool to call
 * @param {Object} toolInput - Tool parameters
 * @returns {Promise<Object>} Tool result
 */
async function callMcpTool(session, toolName, toolInput) {
  const response = await axios.post(
    session.serverUrl,
    {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: toolInput
      },
      id: `call-${randomUUID()}`
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.bearerToken}`,
        'Mcp-Session-Id': session.sessionId
      }
    }
  );

  if (response.data.error) {
    throw new Error(response.data.error.message);
  }

  return response.data.result;
}

/**
 * Sleep utility for retry backoff
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
