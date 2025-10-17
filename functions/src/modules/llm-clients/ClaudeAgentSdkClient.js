import { query } from '@anthropic-ai/claude-agent-sdk';
import * as Logger from '../Logger.js';

const REQUEST_TIMEOUT_MS = 120000; // 120 seconds

/**
 * Generate content using Claude Agent SDK with MCP tool support
 * @param {Object} prompt - Complete LLM prompt with all sections
 * @param {Object} mcpConfig - MCP configuration
 * @param {string} mcpConfig.serverUrl - MCP server URL (e.g., 'http://localhost:7071/api/mcp')
 * @param {string} mcpConfig.bearerToken - da.live Bearer token for MCP session
 * @param {string} model - Claude model to use (e.g., 'claude-sonnet-4-20250514')
 * @returns {Promise<Object>} LLM response with edited HTML, explanation, reasoning, token usage, and MCP tool calls
 * @throws {Error} On API failure or timeout
 */
export async function generateWithClaudeAgentSdk(prompt, mcpConfig = null, model = null) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === '<placeholder>') {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // Use provided model or fall back to environment variable or default
  const claudeModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

  // Build the complete prompt with strong JSON enforcement
  const fullPrompt = `${prompt.systemInstructions}

Command: ${prompt.userCommand}

${prompt.pageContext}

Guidelines:
${prompt.editingGuidelines}

CRITICAL: You MUST respond with valid JSON only. Do not include any conversational text, explanations outside the JSON structure, or apologies. Return ONLY a JSON object with the exact structure requested.`;

  Logger.info('Claude Agent SDK client starting', {
    model: claudeModel,
    hasMcpConfig: !!mcpConfig,
    promptLength: fullPrompt.length
  });

  try {
    // Configure query options
    const queryOptions = {
      apiKey,
      model: claudeModel,
      permissionMode: 'bypassPermissions' // Auto-approve all tool calls
    };

    // If MCP config provided, set up MCP server connection
    if (mcpConfig && mcpConfig.serverUrl) {
      queryOptions.mcpServers = {
        'dalive-mcp': {
          // Note: Omitting 'type' field - let SDK auto-detect
          // Our MCP server uses HTTP JSON-RPC 2.0, not SSE
          url: mcpConfig.serverUrl,
          headers: {
            'Authorization': `Bearer ${mcpConfig.bearerToken}`
          }
        }
      };

      // Allow the MCP tools
      queryOptions.allowedTools = ['get_dalive_content', 'save_dalive_content'];

      Logger.info('Claude Agent SDK MCP server configured', {
        serverUrl: mcpConfig.serverUrl,
        hasBearerToken: !!mcpConfig.bearerToken
      });
    }

    const startTime = Date.now();

    Logger.info('Query options being passed to SDK', {
      queryOptions: JSON.stringify(queryOptions, null, 2)
    });

    // Execute query
    let queryResult;
    try {
      queryResult = query({
        prompt: fullPrompt,
        options: queryOptions
      });
    } catch (queryError) {
      Logger.error('Failed to create query', {
        error: queryError.message,
        stack: queryError.stack
      });
      throw queryError;
    }

    // Collect all messages from the async iterator
    const messages = [];
    let lastMessage = null;

    for await (const message of queryResult) {
      Logger.debug('Claude Agent SDK message received', {
        type: message.type,
        role: message.role
      });

      messages.push(message);
      lastMessage = message;
    }

    const duration = Date.now() - startTime;

    Logger.info('Claude Agent SDK query completed', {
      duration: `${duration}ms`,
      messageCount: messages.length
    });

    // Find the assistant message with the response
    const assistantMessage = messages.find(msg => msg.type === 'assistant');

    if (!assistantMessage) {
      throw new Error('No assistant response received from Claude Agent SDK');
    }

    // Debug: Log the full structure
    console.error('FULL ASSISTANT MESSAGE:', JSON.stringify(assistantMessage, null, 2));

    Logger.info('Assistant message structure', {
      keys: Object.keys(assistantMessage),
      hasMessage: !!assistantMessage.message,
      hasContent: !!assistantMessage.content,
      messageType: typeof assistantMessage.message,
      hasMessageContent: !!(assistantMessage.message && assistantMessage.message.content),
      messagePreview: JSON.stringify(assistantMessage).substring(0, 500)
    });

    // Get the text content from the assistant message
    // The SDK wraps the response in a message object with content array
    let responseText = '';
    if (assistantMessage.message && assistantMessage.message.content && Array.isArray(assistantMessage.message.content)) {
      const textContent = assistantMessage.message.content.find(c => c.type === 'text');
      if (textContent) {
        responseText = textContent.text;
      }
    } else if (typeof assistantMessage.message === 'string') {
      responseText = assistantMessage.message;
    } else if (Array.isArray(assistantMessage.content)) {
      const textContent = assistantMessage.content.find(c => c.type === 'text');
      if (textContent) {
        responseText = textContent.text;
      }
    }

    if (!responseText) {
      throw new Error('No text content in Claude Agent SDK response');
    }

    Logger.debug('Claude Agent SDK response text', {
      responseTextLength: responseText.length,
      preview: responseText.substring(0, 200)
    });

    // Parse the JSON response
    let cleanedResponseText = responseText.trim();

    // Remove ```json and ``` wrapper if present
    if (cleanedResponseText.startsWith('```json')) {
      cleanedResponseText = cleanedResponseText.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
    } else if (cleanedResponseText.startsWith('```')) {
      cleanedResponseText = cleanedResponseText.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    let llmResponse;
    try {
      llmResponse = JSON.parse(cleanedResponseText);
      Logger.info('Claude Agent SDK response parsed successfully', {
        parsedKeys: Object.keys(llmResponse)
      });
    } catch (parseError) {
      Logger.error('Failed to parse Claude Agent SDK response as JSON', {
        parseError: parseError.message,
        cleanedResponse: cleanedResponseText.substring(0, 300)
      });
      throw new Error(`Claude returned invalid JSON: ${parseError.message}`);
    }

    // Extract token usage from messages if available
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Try to find result message with usage info
    const resultMessage = messages.find(msg => msg.type === 'result');
    if (resultMessage && resultMessage.usage) {
      totalInputTokens = resultMessage.usage.input_tokens || 0;
      totalOutputTokens = resultMessage.usage.output_tokens || 0;
    }

    // Build response
    const result = {
      editedHtml: llmResponse.editedHtml || '',
      explanation: llmResponse.explanation || '',
      reasoning: llmResponse.reasoning || '',
      tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
      }
    };

    // Extract MCP tool calls from messages
    const mcpToolCalls = [];
    for (const message of messages) {
      if (message.role === 'assistant' && Array.isArray(message.content)) {
        for (const content of message.content) {
          if (content.type === 'tool_use') {
            mcpToolCalls.push({
              toolName: content.name,
              parameters: content.input,
              // Note: We don't have the result or timing here from SDK
              // The SDK handles tool execution internally
              status: 'completed'
            });
          }
        }
      }
    }

    if (mcpToolCalls.length > 0) {
      result.mcpToolCalls = mcpToolCalls;
    }

    Logger.info('Claude Agent SDK generation completed successfully', {
      totalMessages: messages.length,
      totalInputTokens,
      totalOutputTokens,
      toolCallsCount: mcpToolCalls.length,
      editedHtmlLength: result.editedHtml?.length || 0
    });

    return result;

  } catch (error) {
    Logger.error('Claude Agent SDK call failed', {
      errorMessage: error.message,
      errorType: error.constructor.name,
      stack: error.stack
    });

    throw new Error(`Claude Agent SDK failed: ${error.message}`);
  }
}
