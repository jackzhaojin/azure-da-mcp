import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { randomUUID } from 'crypto';
import * as Logger from '../Logger.js';

const MAX_TOKENS = 4096;
const TEMPERATURE = 0.3;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const MAX_TOOL_ITERATIONS = 10;

/**
 * Generate content using Google Gemini API with MCP tool support
 * @param {Object} prompt - Complete LLM prompt with all sections
 * @param {Object} mcpConfig - MCP configuration
 * @param {string} mcpConfig.serverUrl - MCP server URL
 * @param {string} mcpConfig.bearerToken - da.live Bearer token for MCP session
 * @param {string} model - Gemini model to use (e.g., 'gemini-2.5-pro')
 * @returns {Promise<Object>} LLM response with edited HTML, explanation, reasoning, token usage, and MCP tool calls
 * @throws {Error} On API failure or timeout
 */
export async function generateWithGemini(prompt, mcpConfig = null, model = null) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey === '<placeholder>' || apiKey === 'your-gemini-api-key-here') {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  // Use provided model or fall back to environment variable or default
  const geminiModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-pro';

  const genAI = new GoogleGenerativeAI(apiKey);

  // Initialize MCP session if config provided
  let mcpSession = null;
  if (mcpConfig && mcpConfig.serverUrl) {
    mcpSession = await initializeMcpSession(mcpConfig.serverUrl, mcpConfig.bearerToken);
  }

  // Define function declarations for Gemini (equivalent to Claude's tools)
  const tools = mcpSession ? [
    {
      functionDeclarations: [
        {
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
        },
        {
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
      ]
    }
  ] : [];

  // Build the prompt text
  const promptText = `${prompt.systemInstructions}

Command: ${prompt.userCommand}

${prompt.pageContext}

Guidelines:
${prompt.editingGuidelines}`;

  const mcpToolCalls = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Create model instance
      const modelInstance = genAI.getGenerativeModel({
        model: geminiModel,
        generationConfig: {
          maxOutputTokens: MAX_TOKENS,
          temperature: TEMPERATURE
        },
        tools: tools.length > 0 ? tools : undefined
      });

      // Start chat session
      const chat = modelInstance.startChat({
        history: []
      });

      // Multi-turn conversation loop for function calling
      let iterationCount = 0;
      let finalResponse = null;
      let currentPrompt = promptText;

      while (iterationCount < MAX_TOOL_ITERATIONS) {
        iterationCount++;

        Logger.info('Gemini API call starting', {
          model: geminiModel,
          iteration: iterationCount,
          hasTools: tools.length > 0,
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS
        });

        const llmCallStart = Date.now();
        const result = await chat.sendMessage(currentPrompt);
        const llmCallDuration = Date.now() - llmCallStart;

        const response = result.response;

        // Track token usage (Gemini provides this in usageMetadata)
        if (response.usageMetadata) {
          totalInputTokens += response.usageMetadata.promptTokenCount || 0;
          totalOutputTokens += response.usageMetadata.candidatesTokenCount || 0;
        }

        Logger.info('Gemini API call completed', {
          iteration: iterationCount,
          duration: `${llmCallDuration}ms`,
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0
        });

        // Check for function calls
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0 && mcpSession) {
          // Gemini wants to use functions
          const functionCall = functionCalls[0]; // Handle first function call
          const functionName = functionCall.name;
          const functionArgs = functionCall.args;

          Logger.info('Gemini requested function call', {
            iteration: iterationCount,
            functionName,
            functionArgs: JSON.stringify(functionArgs)
          });

          // Call MCP server to execute tool
          const toolStartTime = Date.now();
          let toolResult;
          let toolStatus = 'completed';

          try {
            toolResult = await callMcpTool(mcpSession, functionName, functionArgs);
            Logger.info('Tool call completed successfully', {
              toolName: functionName,
              duration: `${Date.now() - toolStartTime}ms`
            });
          } catch (toolError) {
            toolStatus = 'failed';
            toolResult = {
              error: toolError.message
            };
            Logger.error('Tool call failed', {
              toolName: functionName,
              error: toolError.message,
              duration: `${Date.now() - toolStartTime}ms`
            });
          }

          const toolDuration = Date.now() - toolStartTime;

          // Track tool call for logging
          mcpToolCalls.push({
            toolName: functionName,
            parameters: functionArgs,
            result: toolResult,
            duration: toolDuration,
            status: toolStatus
          });

          // Send function response back to Gemini
          currentPrompt = [{
            functionResponse: {
              name: functionName,
              response: toolResult
            }
          }];

          // Continue conversation loop
          continue;
        }

        // No function calls - this is the final response
        const responseText = response.text();

        Logger.info('Gemini raw response text', {
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

        Logger.info('Cleaned Gemini response for parsing', {
          originalLength: responseText.length,
          cleanedLength: cleanedResponseText.length,
          hadMarkdown: cleanedResponseText !== responseText.trim(),
          cleanedResponse: cleanedResponseText.substring(0, 200) + '...'
        });

        let llmResponse;
        try {
          llmResponse = JSON.parse(cleanedResponseText);
          Logger.info('Gemini response parsed successfully', {
            parsedKeys: Object.keys(llmResponse)
          });
        } catch (parseError) {
          Logger.error('Failed to parse Gemini response as JSON', {
            parseError: parseError.message,
            originalResponse: responseText.substring(0, 300),
            cleanedResponse: cleanedResponseText.substring(0, 300),
            responseType: typeof cleanedResponseText
          });
          throw new Error(`Gemini returned invalid JSON: ${parseError.message}. Cleaned response: ${cleanedResponseText.substring(0, 500)}...`);
        }

        Logger.info('Gemini generation completed successfully', {
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
        Logger.error('Gemini did not return final response', {
          iterations: iterationCount,
          maxIterations: MAX_TOOL_ITERATIONS
        });
        throw new Error('Gemini did not return a final response after tool iterations');
      }

      return finalResponse;

    } catch (error) {
      lastError = error;

      Logger.error('Gemini API call failed in attempt', {
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        errorMessage: error.message,
        errorStatus: error.status,
        errorType: error.constructor.name,
        willRetry: attempt < MAX_RETRIES - 1
      });

      // Retry on rate limiting
      if (error.message?.includes('rate limit') && attempt < MAX_RETRIES - 1) {
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
        Logger.error('Final Gemini API failure', {
          totalAttempts: MAX_RETRIES,
          finalError: error.message,
          errorDetails: {
            status: error.status,
            type: error.constructor.name,
            stack: error.stack
          }
        });
        throw new Error(`Gemini API failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw new Error(`Gemini API failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
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
          name: 'gemini-llm-client',
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
