/**
 * LLM Client Orchestrator
 *
 * Routes requests to specific LLM provider clients based on configuration.
 * This module does NOT contain provider-specific logic - it only routes.
 *
 * Provider-specific implementations:
 * - Claude: ./llm-clients/ClaudeClient.js
 * - Gemini: ./llm-clients/GeminiClient.js
 * - Azure AI Foundry: ./llm-clients/AzureAIFoundryClient.js
 */

import { generateWithClaude } from './llm-clients/ClaudeClient.js';
import { generateWithGemini } from './llm-clients/GeminiClient.js';
import { generateWithAzureAI } from './llm-clients/AzureAIFoundryClient.js';
import * as Logger from './Logger.js';

/**
 * Generate content edit using configured LLM provider with MCP tool support
 * @param {Object} prompt - Complete LLM prompt with all sections
 * @param {Object} mcpConfig - MCP configuration
 * @param {string} mcpConfig.serverUrl - MCP server URL (e.g., 'http://localhost:7071/api/mcp')
 * @param {string} mcpConfig.bearerToken - da.live Bearer token for MCP session
 * @param {string} provider - LLM provider to use ('claude' | 'gemini' | 'azure-ai-foundry')
 * @param {string} model - Model to use (optional, uses provider default if not specified)
 * @returns {Promise<Object>} LLM response with edited HTML, explanation, reasoning, token usage, and MCP tool calls
 * @throws {Error} On API failure, timeout, or invalid provider
 */
export async function generateEdit(prompt, mcpConfig = null, provider = null, model = null) {
  // Determine provider from parameter or environment variable
  const llmProvider = provider || process.env.LLM_PROVIDER || 'claude';

  Logger.info('LLM orchestrator routing request', {
    provider: llmProvider,
    model: model || 'default',
    hasMcpConfig: !!mcpConfig
  });

  // Route to appropriate provider client
  switch (llmProvider.toLowerCase()) {
    case 'claude':
      return await generateWithClaude(prompt, mcpConfig, model);

    case 'gemini':
      return await generateWithGemini(prompt, mcpConfig, model);

    case 'azure-ai-foundry':
    case 'azure':
      return await generateWithAzureAI(prompt, mcpConfig, model);

    default:
      throw new Error(`Invalid LLM provider: ${llmProvider}. Supported providers: 'claude', 'gemini', 'azure-ai-foundry'`);
  }
}
