# MCP (Model Context Protocol) Instructions

## MCP Implementation Requirements

**JSON-RPC 2.0 Protocol**: All MCP communication uses JSON-RPC 2.0 format.

### Session Management

```javascript
// MCP session lifecycle
async function initializeMcpSession(serverUrl, bearerToken) {
    // 1. Initialize
    const initResponse = await axios.post(serverUrl, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {} },
            clientInfo: { name: 'claude-llm-client', version: '1.0.0' }
        },
        id: `init-${randomUUID()}`
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bearerToken}`
        }
    });

    const sessionId = initResponse.headers['mcp-session-id'];

    // 2. Send initialized notification
    await axios.post(serverUrl, {
        jsonrpc: '2.0',
        method: 'initialized',
        params: {}
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bearerToken}`,
            'Mcp-Session-Id': sessionId
        }
    });

    return { serverUrl, sessionId, bearerToken };
}
```

### Tool Implementation Pattern

```javascript
// MCP tool wrapper (in McpTools.js)
export async function get_dalive_content(params, context) {
    const { path } = params;
    const { bearerToken } = context;
    
    // Validate parameters
    if (!path) {
        throw new Error('Path parameter is required');
    }
    
    // Call underlying service
    const html = await daliveClient.getContent(path, bearerToken);
    
    // Return MCP-formatted response
    return {
        htmlContent: html,
        lastModified: new Date().toISOString(),
        path
    };
}

export async function save_dalive_content(params, context) {
    const { path, htmlContent } = params;
    const { bearerToken } = context;
    
    // Validate parameters
    if (!path || !htmlContent) {
        throw new Error('Path and htmlContent parameters are required');
    }
    
    // Call underlying service
    await daliveClient.updateContent(path, htmlContent, bearerToken);
    
    // Return success response
    return {
        success: true,
        path,
        lastModified: new Date().toISOString()
    };
}
```

### MCP Server Function Pattern

```javascript
// McpSessionFunction.js handles JSON-RPC 2.0 protocol
app.http('McpSession', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'mcp',
    handler: async (request, context) => {
        const body = await request.json();
        const { method, params, id } = body;

        switch (method) {
            case 'initialize':
                // Start new session
                break;
            case 'initialized':
                // Confirm session ready (notification)
                break;
            case 'tools/list':
                // Return available tools
                break;
            case 'tools/call':
                // Execute tool
                break;
            default:
                // Method not found error
        }
    }
});
```

## Available Tools

### get_dalive_content
**Description**: Fetch HTML content from da.live
**Parameters**:
- `path` (string, required): da.live content path (e.g., '/source/owner/site/page.html')

**Response**:
```javascript
{
    htmlContent: "<html>...</html>",
    lastModified: "2025-01-01T00:00:00.000Z", 
    path: "/source/owner/site/page.html"
}
```

### save_dalive_content
**Description**: Save edited HTML content to da.live
**Parameters**:
- `path` (string, required): da.live content path to update
- `htmlContent` (string, required): Complete edited HTML content

**Response**:
```javascript
{
    success: true,
    path: "/source/owner/site/page.html",
    lastModified: "2025-01-01T00:00:00.000Z"
}
```

## JSON-RPC 2.0 Format

### Request Format
```javascript
{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
        "name": "get_dalive_content",
        "arguments": { "path": "/source/owner/site/page.html" }
    },
    "id": "unique-request-id"
}
```

### Response Format
```javascript
{
    "jsonrpc": "2.0",
    "result": {
        "htmlContent": "<html>...</html>",
        "path": "/source/owner/site/page.html"
    },
    "id": "unique-request-id"
}
```

### Error Format
```javascript
{
    "jsonrpc": "2.0",
    "error": {
        "code": -32602,
        "message": "Invalid params",
        "data": { "field": "path" }
    },
    "id": "unique-request-id"
}
```

## Error Codes

- `-32700`: Parse error
- `-32600`: Invalid Request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

## Session Context

**Bearer Token**: Always included in session context for tool calls
**Session ID**: Tracked via `Mcp-Session-Id` header
**Timeout**: 24-hour session timeout for long conversations

## Tool Registration for LLMs

**For Anthropic Claude**:
```javascript
const tools = [
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
];
```