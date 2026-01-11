# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Azure Functions MCP server providing AI-assisted content editing for da.live CMS. The LLM autonomously calls MCP tools to fetch, edit, and save HTML content.

**Key Architecture Pattern**: LLM-driven tool orchestration via Model Context Protocol (MCP). The LLM decides when to fetch content, when to save it, and handles multi-turn conversations for complex edits.

## Development Commands

```bash
# Prerequisites: Node 22+ (check package.json engines)
# Use nvm to switch versions if needed
nvm use 22

# Install dependencies
npm install

# Start local development server (Azure Functions runtime)
npm start
# Server runs on http://localhost:7071

# Run all E2E tests (requires .env with real API credentials)
npm test

# Run tests in watch mode
npm run test:watch

# Run ad-hoc tests (standalone, no test framework)
node tests/adhoc/test-prompt-array.js

# Lint code
npm run lint
npm run lint:fix
```

## Environment Setup

**IMPORTANT**: Azure Functions requires configuration in TWO places for local development:

1. **`.env`** - Used by tests and some modules
2. **`local.settings.json`** - Used by Azure Functions runtime

Copy `.env.example` to `.env` and configure:

```bash
# Required for all operations
DALIVE_BEARER_TOKEN=your-jwt-token-here

# LLM Provider Configuration
LLM_PROVIDER=claude  # Options: 'claude' | 'gemini' | 'azure-ai-foundry'

# LLM API Keys (configure only the provider you're using)
ANTHROPIC_API_KEY=sk-ant-api03-...
GEMINI_API_KEY=your-gemini-api-key
AZURE_AI_FOUNDRY_API_KEY=your-azure-key
AZURE_AI_FOUNDRY_ENDPOINT=https://your-endpoint.services.ai.azure.com/

# Default Models (optional, falls back to provider defaults)
CLAUDE_MODEL=claude-sonnet-4-5-20250929
GEMINI_MODEL=gemini-2.5-pro
AZURE_MODEL=gpt-5-mini

# Test Configuration (for E2E tests)
E2E_TEST_PATH=/source/your-org/your-project/page.html
E2E_TEST_COMMAND=Make the hero section more concise
```

Also update `local.settings.json` with the same values:
```json
{
  "IsEncrypted": false,
  "Values": {
    "DALIVE_BEARER_TOKEN": "your-jwt-token-here",
    "ANTHROPIC_API_KEY": "sk-ant-api03-...",
    "LLM_PROVIDER": "claude"
  }
}
```

**Important**:
- Never commit `.env` or `local.settings.json` files - both contain secrets and are gitignored
- When you refresh your da.live Bearer token, update it in BOTH files for local testing

## Architecture

### High-Level Flow

```
Client Request
    ↓
EditContentFunction (POST /api/EditContent)
    ↓
LlmClient (orchestrator) → Routes to provider-specific client
    ↓
[ClaudeClient | GeminiClient | AzureAIFoundryClient]
    ↓
LLM autonomously calls MCP tools:
    - list_dalive_content(path) → DaliveClient.listContent()
    - get_dalive_content(path) → DaliveClient.getContent()
    - save_dalive_content(path, html) → DaliveClient.updateContent()
    ↓
da.live Admin API (GET for list, GET for content, multipart/form-data POST for save)
```

### Key Components

**Functions** (`src/functions/`):
- **EditContentFunction.js**: Main business logic endpoint - orchestrates LLM with MCP tools
- **ClaudeLlmClientFunction.js**: Direct Claude API endpoint (infrastructure/testing)
- **GeminiLlmClientFunction.js**: Direct Gemini API endpoint (infrastructure/testing)
- **AzureAIFoundryLlmClientFunction.js**: Direct Azure AI endpoint (infrastructure/testing)
- **McpSessionFunction.js**: MCP JSON-RPC 2.0 server for Claude Desktop integration
- **McpStreamableFunction.js**: Manual MCP server for n8n/HTTP clients (no SDK dependency)
- **GetContentFunction.js**: Fetch-only endpoint (backward compatibility)
- **HealthCheckFunction.js**: Service status check

**Modules** (`src/modules/`):
- **LlmClient.js**: Router that dispatches to provider-specific clients based on `LLM_PROVIDER` env var
- **llm-clients/ClaudeClient.js**: Anthropic Messages API with MCP tool calling
- **llm-clients/GeminiClient.js**: Google Gemini API with function calling
- **llm-clients/AzureAIFoundryClient.js**: Azure AI Foundry with tool calling
- **DaliveClient.js**: da.live Admin API wrapper (GET/POST with multipart form data)
- **PromptBuilder.js**: Constructs LLM prompts with system instructions
- **PathNormalizer.js**: Validates and normalizes da.live paths
- **Logger.js**: Structured logging with request IDs

**MCP Tools** (`src/mcp/tools/`):
- **get-dalive-content.js**: Fetch HTML from da.live (read operation)
- **save-dalive-content.js**: Save edited HTML to da.live (write operation)
- **list-dalive-content.js**: List directory contents (files and folders)
- **create-dalive-content.js**: Create new content at path
- **create-folder-dalive.js**: Create folder structure
- **preview-publish-dalive-content.js**: Preview/publish workflow
- **index.js**: Tool registry and executor

### Multi-Provider LLM Support

The codebase supports three LLM providers with identical capabilities:

1. **Claude (Anthropic)**: Premium option, best for complex edits
   - Uses Messages API with tool calling
   - Model: `claude-sonnet-4-5-20250929`
   - Requires: `ANTHROPIC_API_KEY`

2. **Gemini (Google)**: Free tier available, good performance
   - Uses Gemini API with function calling
   - Model: `gemini-2.5-pro`
   - Requires: `GEMINI_API_KEY`

3. **Azure AI Foundry**: Enterprise option, cost-effective
   - Uses Azure OpenAI with tool calling
   - Model: `gpt-5-mini`
   - Requires: `AZURE_AI_FOUNDRY_API_KEY` and `AZURE_AI_FOUNDRY_ENDPOINT`

**Switching Providers**: Change `LLM_PROVIDER` env var or pass `provider` param in request body.

### MCP Tool Calling Pattern

All LLM providers follow the same tool calling pattern:

1. **Initialize MCP Session**: Create session with Bearer token at MCP server
2. **Define Tools**: Register MCP tools in LLM request (list_dalive_content, get_dalive_content, save_dalive_content, etc.)
3. **Multi-Turn Conversation**: LLM autonomously decides when to call tools
4. **Execute Tools**: Forward tool calls to MCP server, receive results
5. **Continue Conversation**: Add tool results to conversation, LLM processes and may call more tools
6. **Final Response**: LLM returns edited content explanation

**Key Insight**: The LLM has full autonomy. It can:
- Discover content by listing directories first
- Fetch content when needed (not pre-fetched by function)
- Make multiple edits and save incrementally
- Handle errors and retry with different approaches
- Explain its reasoning for each edit

### da.live API Integration

**Critical Implementation Detail**: da.live Admin API requires `multipart/form-data` POST for saving content.

```javascript
// CORRECT: Multipart form data with 'data' field
const formData = new FormData();
formData.append('data', Buffer.from(html), {
  filename: 'content.html',
  contentType: 'text/html'
});

// POST directly to path (NOT /api/{path})
await axios.post(`${DALIVE_API_URL}${path}`, formData, {
  headers: {
    'Authorization': `Bearer ${token}`,
    ...formData.getHeaders()  // Critical for boundary
  }
});
```

**Common Mistakes**:
- ❌ POST to `/api/{path}` instead of `{path}` directly
- ❌ Send raw HTML without multipart form wrapper
- ❌ Missing form-data boundary in headers

### Directory Listing API

**da.live List API**: GET request to `/list/{path}` returns directory contents.

```javascript
// List directory contents
const response = await axios.get(`${DALIVE_API_URL}/list${path}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Response is an array of items
// Files have: path, name, ext, lastModified
// Folders have: path, name (no ext or lastModified)
```

**Important Distinction**:
- **Files**: Have `ext` and `lastModified` fields
- **Folders**: Only have `path` and `name` (missing `ext` and `lastModified`)

**Example Response**:
```json
[
  {
    "path": "/jackzhaojin/da-live-postal-2025-07/index.html",
    "name": "index",
    "ext": "html",
    "lastModified": 1763823402473
  },
  {
    "path": "/jackzhaojin/da-live-postal-2025-07/block-collection",
    "name": "block-collection"
  }
]
```

## Testing Philosophy

**Real tests only**. No mocks, no stubs. If it doesn't test actual behavior with real APIs, it doesn't belong here.

### Test Types

1. **Ad-hoc tests** (`tests/adhoc/`): Quick standalone verification of specific modules
   - No test framework, just Node.js scripts
   - Fast, focused, no dependencies
   - Run directly: `node tests/adhoc/test-prompt-array.js`

2. **E2E tests** (`tests/e2e/`): Full workflow tests with real APIs using Jest
   - Requires `.env` with real API credentials
   - Tests actual LLM + MCP + da.live integration
   - Run with: `npm test`
   - Examples:
     - `backward-compat.test.js`: Verify no regressions
     - `mcp-hero-timestamp.test.js`: Full LLM+MCP workflow (~30s)

3. **Azure-specific tests** (`tests/azure/`): Azure deployment validation
   - Tests against deployed Azure Functions
   - Requires Azure credentials

### Running Tests

```bash
# All E2E tests
npm test

# Single test file
npm test -- tests/e2e/backward-compat.test.js

# Watch mode for development
npm run test:watch

# Ad-hoc test (no framework)
node tests/adhoc/test-prompt-array.js
```

## API Endpoints

### POST /api/EditContent
Main endpoint for AI-assisted content editing.

**Request**:
```json
{
  "command": "Make the hero section more concise",
  "path": "/source/org/project/page.html",
  "provider": "claude",  // optional: 'claude' | 'gemini' | 'azure-ai-foundry'
  "model": "claude-sonnet-4-5-20250929"  // optional, uses provider default if omitted
}
```

**Headers**: `Authorization: Bearer <dalive-token>`

**Response**:
```json
{
  "requestId": "uuid",
  "editedHtmlLength": 4355,
  "explanation": "Condensed the main hero section...",
  "reasoning": "The original was verbose...",
  "timing": {
    "total": 30953,
    "llm_call": 30953,
    "mcp_get_content": 115,
    "mcp_save_content": 908
  },
  "mcpToolCalls": [...]
}
```

### POST /api/mcp
MCP server endpoint (JSON-RPC 2.0) for Claude Desktop integration.

Supports: `initialize`, `initialized`, `tools/list`, `tools/call`

**Use Case**: Claude Desktop via `mcp-stdio-bridge.js` (stdio-to-HTTP bridge)

### POST /api/mcp-streamable
Manual MCP server for n8n and HTTP-based MCP clients.

**Key Differences from `/api/mcp`**:
- No MCP SDK dependency (manual JSON-RPC 2.0 implementation)
- Stateless Bearer token fallback for compatibility
- Works with Docker containers via `host.docker.internal:7071`

### Direct LLM Endpoints (Infrastructure/Testing)

- **POST /api/ClaudeLlmClient**: Direct Claude API call
- **POST /api/GeminiLlmClient**: Direct Gemini API call
- **POST /api/AzureAIFoundryLlmClient**: Direct Azure AI API call

These bypass the `LLM_PROVIDER` router and call specific providers directly.

## Common Development Tasks

### Adding a New MCP Tool

1. Create tool implementation in `src/mcp/tools/your-tool-name.js`:
```javascript
export const definition = {
  name: 'your_tool_name',
  description: 'What this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Parameter description' }
    },
    required: ['param1']
  }
};

export async function execute(params, context) {
  // Tool logic here
  // Access context.bearerToken for da.live API calls
  return {
    content: [{ type: 'text', text: 'Result' }],
    structuredContent: { data: 'value' }
  };
}
```

2. Register in `src/mcp/tools/index.js`:
```javascript
import * as YourToolName from './your-tool-name.js';

export const tools = {
  'your_tool_name': YourToolName,
  // ... existing tools
};
```

3. Tool is automatically available in all MCP endpoints

### Adding a New LLM Provider

1. Create client in `src/modules/llm-clients/YourProviderClient.js`:
```javascript
export async function generateWithYourProvider(prompt, mcpConfig, model) {
  // Implement provider-specific API calls
  // Handle MCP tool calling if mcpConfig provided
  // Return standardized response format
}
```

2. Add to router in `src/modules/LlmClient.js`:
```javascript
import { generateWithYourProvider } from './llm-clients/YourProviderClient.js';

export async function generateEdit(prompt, mcpConfig, provider, model) {
  switch (provider.toLowerCase()) {
    case 'your-provider':
      return await generateWithYourProvider(prompt, mcpConfig, model);
    // ... existing providers
  }
}
```

3. Add to `.env.example`:
```bash
YOUR_PROVIDER_API_KEY=your-key-here
YOUR_PROVIDER_MODEL=your-default-model
```

### Debugging MCP Tool Calls

1. Check Azure Functions logs (terminal where `npm start` is running)
2. Look for `[MCP Tool]` log entries showing tool execution
3. Verify MCP session was initialized with Bearer token
4. Check tool parameter validation errors
5. Test tool directly via `/api/mcp-streamable` with curl:

```bash
curl -X POST http://localhost:7071/api/mcp-streamable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_dalive_content",
      "arguments": { "path": "/source/org/project/page.html" }
    },
    "id": "1"
  }'
```

## Common Issues

### Node Version Errors
**Symptom**: `Error: Incompatible Node.js version`
**Fix**: Use Node 22+ (check `package.json` engines field)
```bash
nvm use 22
npm start
```

### Content Saves But UI Doesn't Update
**Cause**: Using `/api` prefix in POST URL
**Fix**: POST to `${DALIVE_API_URL}${path}` NOT `${DALIVE_API_URL}/api${path}`
**Location**: `src/modules/DaliveClient.js`

### Function Timeout
**Cause**: MCP workflow can take 30+ seconds (multi-turn LLM conversation)
**Fix**: Already configured in `host.json` with 2-minute timeout
**Note**: Typical completion time is 30-60 seconds depending on edit complexity

### MCP Session Initialization Failed
**Symptom**: "MCP session initialization failed"
**Causes**:
- MCP server not running (start with `npm start`)
- Invalid Bearer token
- Wrong MCP_SERVER_URL

### n8n Docker Connection Issues
**Symptom**: "Could not connect to your MCP server" from n8n
**Cause**: Docker container trying to access `localhost:7071` (container localhost ≠ host localhost)
**Fix**: Use `host.docker.internal:7071` instead of `localhost:7071`

```bash
# ❌ Wrong
http://localhost:7071/api/mcp-streamable

# ✅ Correct
http://host.docker.internal:7071/api/mcp-streamable
```

## Important Patterns

### Error Handling
- Retry logic: 500+ errors with exponential backoff
- No retry: 4xx client errors
- Timeout handling: Anthropic API (15s), da.live API (5s)
- MCP errors use JSON-RPC 2.0 error format with codes

### Prompt Engineering
System instructions in `PromptBuilder.js` emphasize:
- Preserve facts and brand terms (never invent content)
- Maintain HTML structure (only content-level edits)
- Return complete HTML (not diffs or partial updates)
- Explain reasoning for transparency

### Session Management
- MCP sessions created on `initialize` call
- 24-hour timeout for long conversations
- Bearer token stored per session
- Session ID persists across tool calls

## File Paths and Naming Conventions

- Functions: PascalCase with `Function` suffix (e.g., `EditContentFunction.js`)
- Modules: PascalCase (e.g., `LlmClient.js`, `DaliveClient.js`)
- MCP Tools: kebab-case (e.g., `get-dalive-content.js`)
- Tests: kebab-case with `.test.js` suffix (e.g., `backward-compat.test.js`)
- Environment files: lowercase (`.env`, `.env.example`)

## What We Intentionally Don't Have

- ❌ Unit tests with mocks (doesn't validate real behavior)
- ❌ Integration tests with stubs (APIs change, stubs lie)
- ❌ Response validation layer (trust LLM output, complexity without value)
- ❌ Block-based architecture (da.live returns HTML, not blocks)
- ❌ Pre-fetching content (LLM fetches on demand via MCP tools)

## Azure Functions Specifics

- **Runtime**: Azure Functions v4 (Node.js 22+)
- **Programming Model**: v4 (uses `@azure/functions` app registration)
- **Route Prefix**: `/api` (configured in `host.json`)
- **CORS**: Enabled for all origins (development configuration)
- **Timeout**: 2 minutes (for LLM processing)
- **Logging**: Debug level for development

## Related Documentation

- Root monorepo `CLAUDE.md`: Context about other projects in monorepo
- `.env.example`: Environment variable reference
- `package.json`: Dependencies and script definitions
- `host.json`: Azure Functions configuration
