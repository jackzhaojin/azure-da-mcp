/**
 * Azure Functions Entry Point
 *
 * This file imports all HTTP-triggered functions for Azure Functions v4 programming model.
 * Each function self-registers with the app when imported.
 */

// Business Logic Endpoints
import './EditContentFunction.js';

// Infrastructure LLM Client Endpoints
import './ClaudeLlmClientFunction.js';
import './ClaudeAgentSdkFunction.js';
import './GeminiLlmClientFunction.js';
import './AzureAIFoundryLlmClientFunction.js';

// Legacy/Support Endpoints
import './GetContentFunction.js';
import './HealthCheckFunction.js';
import './McpSessionFunction.js';
import './McpStreamableFunction.js';
