---
applyTo: "functions/**"
---

# Azure Functions MCP Server Instructions

## Overview

This is an **Azure Functions v4 MCP server** that provides AI-powered content editing for da.live pages.

**Tech Stack**: Node 20, Azure Functions v4, Anthropic SDK, MCP SDK
**Model**: Claude Sonnet 4 (`claude-sonnet-4-20250514`)

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Client    │────▶│ Azure Functions  │────▶│ Claude API with │────▶│   da.live   │
│             │     │  (EditContent)   │     │   MCP Tools     │     │     API     │
└─────────────┘     └──────────────────┘     └─────────────────┘     └─────────────┘
```

**MCP Tools Available**:
- `get_dalive_content(path)` - Fetch HTML from da.live
- `save_dalive_content(path, htmlContent)` - Save edited HTML
- `preview_publish_dalive_content(path)` - Trigger preview publish

## Azure Functions V4 Pattern

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

**❌ Never suggest V3 pattern (deprecated):**
```javascript
module.exports = async function (context, req) { /* deprecated */ };
```

## da.live API Integration

**Critical: Multipart Form Data Required for POST**

```javascript
const formData = new FormData();
formData.append('data', Buffer.from(html), {
    filename: 'content.html',
    contentType: 'text/html'
});

// ✅ POST directly to path (NO /api prefix)
await axios.post(`${DALIVE_API_URL}${path}`, formData, {
    headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
    }
});
```

**URL Rules**:
- ✅ `POST https://admin.da.live/source/owner/site/page.html`
- ❌ `POST https://admin.da.live/api/source/owner/site/page.html` (404 error)

## MCP Server Endpoints

**Two MCP endpoints for different clients:**

| Endpoint | Client Type | Implementation |
|----------|-------------|----------------|
| `POST /api/mcp` | Claude Desktop (stdio bridge) | MCP SDK Server class |
| `POST /api/mcp-streamable` | n8n, HTTP clients | Manual JSON-RPC 2.0 |

**Docker Networking**: Use `host.docker.internal:7071` from containers (not `localhost`).

## Key Files

| File | Purpose |
|------|---------|
| `src/functions/EditContentFunction.js` | Main MCP-enabled editing endpoint |
| `src/functions/McpSessionFunction.js` | MCP server (JSON-RPC 2.0) |
| `src/modules/McpTools.js` | MCP tool implementations |
| `src/modules/DaliveClient.js` | da.live API client (multipart POST) |
| `src/modules/LlmClient.js` | Anthropic API with MCP support |
| `mcp-stdio-bridge.js` | stdio-to-HTTP bridge for Claude Desktop |

## Development Commands

```bash
cd functions
nvm use 20
npm install
npm start       # Start dev server on :7071
npm test        # Run E2E tests
```

## Testing Philosophy

**Real tests only** - No mocks, no stubs:
- `tests/adhoc/` - Quick standalone tests (no harness)
- `tests/e2e/` - Full workflow with real APIs (Jest)

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...    # Required
DALIVE_API_URL=https://admin.da.live  # Default
MCP_SERVER_URL=http://localhost:7071/api/mcp  # Default
```

Bearer token passed via `Authorization` header in requests.

## Error Handling Pattern

```javascript
try {
    const result = await someOperation();
    return { status: 200, jsonBody: result };
} catch (error) {
    Logger.error('Operation failed', { error: error.message });
    return {
        status: error.status >= 500 ? 502 : 400,
        jsonBody: { error: 'Operation failed', message: error.message }
    };
}
```

## Files to Never Modify

- `host.json` - Azure Functions config (already optimized)
- `local.settings.json` - User-specific local settings
- `.env` - Contains secrets

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Content not saving | Not using multipart form | Use FormData with `form-data` package |
| 404 on POST | Using /api prefix | POST directly to path |
| Function timeout | LLM calls take 10-15s | Timeout already set to 30s in host.json |
| Node version error | Wrong Node version | `nvm use 20` |
