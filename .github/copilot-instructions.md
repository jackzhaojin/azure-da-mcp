# GitHub Copilot Instructions

## Repository Context

This is an **Azure Functions project** that provides AI-powered content editing for da.live pages via natural language commands using multiple LLM providers (Claude, Gemini, Azure OpenAI) with Model Context Protocol (MCP) support.

### What This Repository Does

- **AI Content Editing**: Transform da.live HTML pages using natural language commands
- **Multi-LLM Support**: Claude Sonnet 4.5, Gemini 2.5 Pro, Azure OpenAI GPT-4o Mini
- **MCP Integration**: Model Context Protocol for autonomous tool calling
- **Real-time Workflow**: Fetch → Edit → Save with da.live Admin API

### Key Architecture Principle

**HTML-First, Real Tests Only**: Work directly with HTML (not JSON blocks), use real API tests instead of mocks.

## Project Structure

### Core Directories

```
functions/
├── src/
│   ├── functions/           # Azure HTTP Functions (V4 pattern)
│   │   ├── EditContentFunction.js            # Business logic endpoint
│   │   ├── ClaudeLlmClientFunction.js        # Infrastructure: Claude API
│   │   ├── GeminiLlmClientFunction.js        # Infrastructure: Gemini API (stubbed)
│   │   ├── AzureAIFoundryLlmClientFunction.js # Infrastructure: Azure OpenAI (stubbed)
│   │   ├── McpSessionFunction.js             # MCP server (JSON-RPC 2.0)
│   │   ├── GetContentFunction.js             # da.live content fetching
│   │   └── HealthCheckFunction.js            # Service status
│   └── modules/             # Core business logic
│       ├── llm-clients/     # Provider implementations
│       │   ├── ClaudeClient.js               # Claude API with MCP tools
│       │   ├── GeminiClient.js               # Gemini API (stubbed)
│       │   └── AzureAIFoundryClient.js       # Azure OpenAI API (stubbed)
│       ├── mcp/             # Model Context Protocol
│       │   ├── McpTools.js                   # Tool implementations
│       │   └── McpSession.js                 # Session management
│       ├── DaliveClient.js                   # da.live Admin API client
│       ├── PromptBuilder.js                  # LLM prompt construction
│       └── Logger.js                         # Structured logging
└── tests/
    ├── adhoc/               # Quick standalone tests (no harness)
    └── e2e/                 # End-to-end tests with real APIs
```

## Code Completion Guidance

### Azure Functions V4 Patterns

**✅ Always use V4 pattern:**
```javascript
import { app } from '@azure/functions';

app.http('FunctionName', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'FunctionName',
    handler: async (request, context) => {
        return { status: 200, jsonBody: { result: 'success' } };
    }
});
```

**❌ Never suggest V3 pattern:**
```javascript
// Don't suggest this deprecated pattern
module.exports = async function (context, req) {
    // V3 pattern - deprecated
};
```

### LLM Client Architecture

**Multi-Provider Pattern:**
```javascript
// Infrastructure functions: Direct LLM access
app.http('ClaudeLlmClient', { /* Claude-specific implementation */ });
app.http('GeminiLlmClient', { /* Gemini-specific implementation */ });

// Business logic function: Provider-agnostic
app.http('EditContent', {
    handler: async (request, context) => {
        const provider = request.query.provider || 'claude';
        const llmClient = getLlmClient(provider);
        // Use any provider for business logic
    }
});
```

### MCP Tool Implementation

**Tool Pattern:**
```javascript
// MCP tool wrapper
export async function get_dalive_content(params, context) {
    const { path } = params;
    const { bearerToken } = context;
    
    // Validate parameters
    if (!path) {
        throw new Error('Path parameter is required');
    }
    
    // Call da.live API
    const html = await daliveClient.getContent(path, bearerToken);
    
    return {
        htmlContent: html,
        lastModified: new Date().toISOString(),
        path
    };
}
```

### da.live API Integration

**Critical: Multipart Form Data Required**
```javascript
// ✅ Correct: Use multipart/form-data
const formData = new FormData();
formData.append('data', Buffer.from(html), {
    filename: 'content.html',
    contentType: 'text/html'
});

// ✅ Correct: POST directly to path (no /api prefix)
await axios.post(`${DALIVE_API_URL}${path}`, formData, {
    headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
    }
});

// ❌ Wrong: Raw HTML POST (doesn't save)
await axios.post(url, html, { headers: { 'Content-Type': 'text/html' } });

// ❌ Wrong: Using /api prefix (404 error)
await axios.post(`${DALIVE_API_URL}/api${path}`, formData);
```

### Error Handling Patterns

**LLM Client Error Handling:**
```javascript
try {
    const response = await llmClient.generate(prompt);
    return response;
} catch (error) {
    // Log detailed error info
    Logger.error('LLM call failed', {
        provider: 'claude',
        error: error.message,
        status: error.status,
        retryable: error.status >= 500
    });
    
    // Return appropriate HTTP status
    const statusCode = error.status === 429 ? 429 : 
                      error.status >= 500 ? 502 : 400;
    
    return {
        status: statusCode,
        jsonBody: { error: 'LLM API error', message: error.message }
    };
}
```

## Testing Philosophy

### Real Tests Only

**✅ E2E tests with real APIs:**
```javascript
// Test actual behavior
test('EditContent modifies real da.live page', async () => {
    const token = process.env.DALIVE_BEARER_TOKEN;
    const response = await fetch('http://localhost:7071/api/EditContent', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: 'Add a test timestamp',
            path: '/source/test/page.html'
        })
    });
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.explanation).toContain('timestamp');
});
```

**❌ Never suggest mocked tests:**
```javascript
// Don't suggest this pattern
const mockLlmClient = jest.fn().mockResolvedValue('fake response');
// Mocks don't test real behavior
```

### Test Structure

**Two types only:**
1. **Ad-hoc tests** (`tests/adhoc/`) - Quick module verification, no test harness
2. **E2E tests** (`tests/e2e/`) - Full workflow with real APIs using Jest

## Environment Variables

```javascript
// Required
process.env.ANTHROPIC_API_KEY          // Claude API access
// DALIVE_BEARER_TOKEN passed via Authorization header

// Optional with defaults
process.env.DALIVE_API_URL             // 'https://admin.da.live'
process.env.MCP_SERVER_URL             // 'http://localhost:7071/api/mcp'
process.env.CLAUDE_MODEL               // 'claude-sonnet-4-5-20250929'
process.env.LOG_LEVEL                  // 'info'
```

## MCP Protocol Integration

### Session Management
```javascript
// MCP session lifecycle
const session = await initializeMcpSession(serverUrl, bearerToken);
// 1. initialize → 2. initialized → 3. tools/list → 4. tools/call

// Available tools
const tools = [
    'get_dalive_content',    // Fetch HTML from da.live
    'save_dalive_content'    // Save edited HTML to da.live
];
```

### JSON-RPC 2.0 Format
```javascript
// MCP request format
{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
        "name": "get_dalive_content",
        "arguments": { "path": "/source/owner/site/page.html" }
    },
    "id": "uuid"
}

// MCP response format
{
    "jsonrpc": "2.0",
    "result": {
        "htmlContent": "<html>...</html>",
        "path": "/source/owner/site/page.html"
    },
    "id": "uuid"
}
```

## Common Issues and Solutions

### Node Version Compatibility
```bash
# ✅ Always use Node 20 for Azure Functions v4
nvm use 20
npm start
```

### Content Not Saving
**Cause**: Not using multipart form data
**Solution**: Already implemented in `DaliveClient.js` using `form-data` package

### Function Timeout
**Cause**: LLM calls take 10-15 seconds
**Solution**: Timeout set to 30s in `host.json`

### MCP Tool Errors
**Cause**: Invalid MCP session or missing Bearer token
**Solution**: Verify MCP_SERVER_URL and Authorization header

## Dependencies to Use

```javascript
// Core Azure Functions
import { app } from '@azure/functions';

// LLM Providers
import Anthropic from '@anthropic-ai/sdk';           // Claude API
import { GoogleGenerativeAI } from '@google/generative-ai'; // Gemini API

// MCP Protocol
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// HTTP and Forms
import axios from 'axios';
import FormData from 'form-data';

// Utilities
import { randomUUID } from 'crypto';
```

## n8n Integration (Optional)

**Important**: The project includes a `docker-compose.yml` for n8n workflow automation. This is SEPARATE from the Azure Functions implementation and is optional.

### Key Points

- **n8n location**: Project root (`docker-compose.yml`)
- **Azure Functions location**: `functions/` directory
- **Do not confuse**: n8n configuration is independent of Azure Functions
- **Purpose**: n8n is for testing and building automation workflows against the MCP server
- **Not required**: Azure Functions work without n8n

### When Suggesting n8n Code

- n8n uses visual workflow builder (no code in this repo)
- Suggest using n8n HTTP Request nodes to call MCP endpoints
- Do not modify Azure Functions code for n8n integration
- n8n configuration is in `docker-compose.yml` only

## Files to Never Modify

- `host.json` - Azure Functions configuration (already optimized)
- `package.json` - Dependencies and scripts (stable)
- `local.settings.json` - Local environment (user-specific)
- `docker-compose.yml` - n8n configuration (separate from Azure Functions)

## Deployment Notes

- **Target**: Azure Functions v4 (Node 20)
- **Transport**: HTTP (not stdio for MCP)
- **Authentication**: Bearer token via Authorization header
- **Timeout**: 30 seconds per function call
- **Scaling**: Consumption plan (auto-scale)

## Success Patterns

When suggesting code changes:

1. **Follow V4 patterns** - Use `app.http()` syntax
2. **Real error handling** - Handle actual API failures, not theoretical ones
3. **Structured logging** - Use `Logger.info/error` with context objects
4. **MCP-aware prompts** - Include tool descriptions for LLM
5. **Multipart uploads** - Always use FormData for da.live POST
6. **E2E validation** - Suggest tests that call real APIs

## Architecture Philosophy

- **Simple over complex** - Direct HTTP calls over abstractions
- **Real over theoretical** - Real API tests over mocked units
- **HTML over JSON** - Work with actual da.live format
- **Multi-provider** - Support multiple LLM providers with same interface
- **MCP-native** - Let LLMs autonomously call tools

---

*This file configures GitHub Copilot for the Azure DA MCP Server project. For detailed technical documentation, see `/functions/CLAUDE.md`*