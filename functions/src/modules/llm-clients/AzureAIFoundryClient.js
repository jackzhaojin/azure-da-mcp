import { AzureOpenAI } from 'openai';
import '@azure/openai/types';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as Logger from '../Logger.js';

const MAX_TOKENS = 4096;
const TEMPERATURE = 0.3;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_TOOL_ITERATIONS = 10;

/**
 * Generate content using Azure AI Foundry API with MCP tool support
 * @param {Object} prompt - Complete LLM prompt with all sections
 * @param {Object} mcpConfig - MCP configuration
 * @param {string} mcpConfig.serverUrl - MCP server URL
 * @param {string} mcpConfig.bearerToken - da.live Bearer token for MCP session
 * @param {string} model - Azure model to use (e.g., 'gpt-4o-mini')
 * @returns {Promise<Object>} LLM response with edited HTML, explanation, reasoning, token usage, and MCP tool calls
 * @throws {Error} On API failure or timeout
 */
export async function generateWithAzureAI(prompt, mcpConfig = null, model = null) {
  const apiKey = process.env.AZURE_AI_FOUNDRY_API_KEY;
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;

  if (!apiKey || apiKey === '<placeholder>' || apiKey === 'your-azure-ai-foundry-key-here') {
    throw new Error('AZURE_AI_FOUNDRY_API_KEY environment variable is not set');
  }

  if (!endpoint) {
    throw new Error('AZURE_AI_FOUNDRY_ENDPOINT environment variable is not set');
  }

  // Use provided model or fall back to environment variable or default
  const azureModel = model || process.env.AZURE_MODEL || 'gpt-4o-mini';

  const client = new AzureOpenAI({
    apiKey,
    endpoint,
    deployment: azureModel,
    apiVersion: '2024-10-21'
  });

  // Initialize MCP session if config provided
  let mcpSession = null;
  if (mcpConfig && mcpConfig.serverUrl) {
    mcpSession = await initializeMcpSession(mcpConfig.serverUrl, mcpConfig.bearerToken);
  }

  // Define function/tool declarations for Azure OpenAI
  const tools = mcpSession ? [
    {
      type: 'function',
      function: {
        name: 'get_dalive_content',
        description: 'Fetch HTML content from da.live. Use this to retrieve the current content before editing.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: "da.live content path (e.g., '/products/enterprise')"
            }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'save_dalive_content',
        description: 'Save edited HTML content to da.live. Use this after you have generated the edited HTML.',
        parameters: {
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
    }
  ] : [];

  // Build messages array
  const messages = [
    {
      role: 'system',
      content: prompt.systemInstructions
    },
    {
      role: 'user',
      content: `Command: ${prompt.userCommand}

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
      // Multi-turn conversation loop for function calling
      let iterationCount = 0;
      let finalResponse = null;

      while (iterationCount < MAX_TOOL_ITERATIONS) {
        iterationCount++;

        const requestParams = {
          messages,
          max_completion_tokens: MAX_TOKENS
        };

        if (tools.length > 0) {
          requestParams.tools = tools;
          requestParams.tool_choice = 'auto';
        }

        Logger.info('Azure AI Foundry API call starting', {
          model: azureModel,
          iteration: iterationCount,
          messagesCount: messages.length,
          hasTools: tools.length > 0,
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS
        });

        const llmCallStart = Date.now();
        const result = await client.chat.completions.create(requestParams);
        const llmCallDuration = Date.now() - llmCallStart;

        totalInputTokens += result.usage?.prompt_tokens || 0;
        totalOutputTokens += result.usage?.completion_tokens || 0;

        Logger.info('Azure AI Foundry API call completed', {
          iteration: iterationCount,
          duration: `${llmCallDuration}ms`,
          inputTokens: result.usage?.prompt_tokens || 0,
          outputTokens: result.usage?.completion_tokens || 0,
          finishReason: result.choices[0]?.finish_reason
        });

        const choice = result.choices[0];

        // Check if response contains tool calls
        if (choice.message.tool_calls && choice.message.tool_calls.length > 0 && mcpSession) {
          // Azure OpenAI wants to use tools
          const toolCall = choice.message.tool_calls[0];
          const toolName = toolCall.function.name;
          const toolInput = JSON.parse(toolCall.function.arguments);
          const toolCallId = toolCall.id;

          Logger.info('Azure AI Foundry requested function call', {
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

          // Add assistant message with tool call
          messages.push({
            role: 'assistant',
            content: choice.message.content || null,
            tool_calls: choice.message.tool_calls
          });

          // Add tool response
          messages.push({
            role: 'tool',
            tool_call_id: toolCallId,
            content: JSON.stringify(toolResult)
          });

          // Continue conversation loop
          continue;
        }

        // No tool calls - this is the final response
        const responseText = choice.message.content;

        Logger.info('Azure AI Foundry raw response text', {
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

        Logger.info('Cleaned Azure AI Foundry response for parsing', {
          originalLength: responseText.length,
          cleanedLength: cleanedResponseText.length,
          hadMarkdown: cleanedResponseText !== responseText.trim(),
          cleanedResponse: cleanedResponseText.substring(0, 200) + '...'
        });

        let llmResponse;
        try {
          llmResponse = JSON.parse(cleanedResponseText);
          Logger.info('Azure AI Foundry response parsed successfully', {
            parsedKeys: Object.keys(llmResponse)
          });
        } catch (parseError) {
          Logger.error('Failed to parse Azure AI Foundry response as JSON', {
            parseError: parseError.message,
            originalResponse: responseText.substring(0, 300),
            cleanedResponse: cleanedResponseText.substring(0, 300),
            responseType: typeof cleanedResponseText
          });
          throw new Error(`Azure AI Foundry returned invalid JSON: ${parseError.message}. Cleaned response: ${cleanedResponseText.substring(0, 500)}...`);
        }

        Logger.info('Azure AI Foundry generation completed successfully', {
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

        break; // Exit iteration loop
      }

      if (!finalResponse) {
        Logger.error('Azure AI Foundry did not return final response', {
          iterations: iterationCount,
          maxIterations: MAX_TOOL_ITERATIONS
        });
        throw new Error('Azure AI Foundry did not return a final response after tool iterations');
      }

      return finalResponse;

    } catch (error) {
      lastError = error;

      Logger.error('Azure AI Foundry API call failed in attempt', {
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

      // Retry on timeout
      if (error.message?.includes('timeout') && attempt < MAX_RETRIES - 1) {
        const backoffTime = INITIAL_BACKOFF_MS;
        Logger.info('Retrying after timeout', { backoffTime });
        await sleep(backoffTime);
        continue;
      }

      // Don't retry on other errors
      if (attempt === MAX_RETRIES - 1) {
        Logger.error('Final Azure AI Foundry API failure', {
          totalAttempts: MAX_RETRIES,
          finalError: error.message,
          errorDetails: {
            status: error.status,
            type: error.constructor.name,
            stack: error.stack
          }
        });
        throw new Error(`Azure AI Foundry API failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw new Error(`Azure AI Foundry API failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
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
          name: 'azure-ai-llm-client',
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

  // Step 2: Send initialized notification
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
      }
    }
  );

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
