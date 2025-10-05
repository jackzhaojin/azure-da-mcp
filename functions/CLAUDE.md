# Azure DA.live MCP Functions

AI-assisted content editing for da.live via Azure Functions, Claude API, and Model Context Protocol (MCP).

## Architecture

**MCP-Enabled Autonomous Workflow**: Claude autonomously fetches and saves content using MCP tools

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Client    │────▶│ Azure Functions  │────▶│ Claude API with │────▶│   da.live   │
│             │     │  (EditContent)   │     │   MCP Tools     │     │     API     │
└─────────────┘     └──────────────────┘     └─────────────────┘     └─────────────┘
                          │                          │                       │
                          │ 1. Start MCP session     │                       │
                          │ with Bearer token        │                       │
                          │                          │                       │
                          │ 2. LLM calls             │                       │
                          │    get_dalive_content ──────────────────────────▶│
                          │                          │                       │
                          │ 3. LLM generates         │                       │
                          │    edited HTML           │                       │
                          │                          │                       │
                          │ 4. LLM calls             │                       │
                          │    save_dalive_content ──────────────────────────▶│
                          │                          │                       │
                          │◀─────── Response ────────│                       │
```

**Key Innovation**: The LLM autonomously decides when and how to call MCP tools. The EditContent function only orchestrates the MCP session—it does NOT pre-fetch or save content directly.

## Key Changes from Original Design

### MCP Integration (Release 1.1)
- **Before**: EditContent pre-fetched HTML, sent to LLM, and saved the result
- **Now**: LLM autonomously calls MCP tools to fetch and save content
- **Why**: Matches Model Context Protocol standard, enables tool use patterns
- **Benefits**:
  - LLM has full control over fetch/edit/save workflow
  - Supports multi-turn conversations for complex edits
  - Extensible for additional tools in future

### HTML-First Approach
- **Before**: Worked with block-based JSON structure
- **Now**: Direct HTML editing (da.live returns HTML strings)
- **Why**: Simpler, matches da.live API reality

### Multipart Form Upload
- **da.live API requirement**: POST must use `multipart/form-data` with `data` file field
- **Implementation**: Uses `form-data` package to create proper file upload
- **Critical**: Raw HTML POST doesn't work

### No Validation Phase
- **Removed**: ResponseValidator module
- **Why**: Trust Claude to return valid HTML, unnecessary complexity
- **Testing**: Real E2E tests validate actual behavior

## Project Structure

```
functions/
├── src/
│   ├── functions/           # Azure HTTP Functions
│   │   ├── EditContentFunction.js    # MCP-enabled editing endpoint
│   │   ├── McpSessionFunction.js     # MCP server (JSON-RPC 2.0)
│   │   ├── GetContentFunction.js     # Fetch content (backward compat)
│   │   └── HealthCheckFunction.js    # Status check
│   └── modules/             # Core logic
│       ├── McpTools.js              # MCP tool implementations
│       ├── DaliveClient.js          # da.live API (multipart POST)
│       ├── LlmClient.js             # Anthropic API with MCP support
│       ├── PromptBuilder.js         # MCP-aware prompts
│       └── Logger.js                # Request logging
└── tests/
    └── e2e/                 # End-to-end tests with real APIs
        ├── backward-compat.test.js  # Verify no regressions
        ├── mcp-session.test.js      # MCP protocol
        ├── mcp-get-content.test.js  # get_dalive_content tool
        ├── mcp-save-content.test.js # save_dalive_content tool
        └── mcp-integration.test.js  # Full LLM+MCP workflow
```

## Development

### Prerequisites
- Node 20 (Azure Functions v4 requirement)
- Azure Functions Core Tools
- da.live Bearer token
- Anthropic API key
- Claude Desktop (optional, for direct MCP tool access)

### Setup
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your keys to .env
DALIVE_BEARER_TOKEN=your_token_here
ANTHROPIC_API_KEY=your_key_here
MCP_SERVER_URL=http://localhost:7071/api/mcp  # Optional, defaults to this

# Start server (uses Node 20 via nvm)
nvm use 20
npm start
```

### Claude Desktop Integration (Release 1.2)

**Overview**: Use MCP tools directly in Claude Desktop for interactive content editing.

**Setup Steps**:

1. **Start Azure Functions MCP Server**:
   ```bash
   cd functions
   npm start
   # Server runs on http://localhost:7071
   ```

2. **Configure Claude Desktop**:

   Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
   ```json
   {
     "mcpServers": {
       "azure-da-mcp": {
         "command": "node",
         "args": ["/absolute/path/to/azure-da-mcp/functions/mcp-stdio-bridge.js"],
         "env": {
           "MCP_SERVER_URL": "http://localhost:7071/api/mcp",
           "DALIVE_BEARER_TOKEN": "your-dalive-bearer-token-here"
         }
       }
     }
   }
   ```

   **Important**: Use absolute path to `mcp-stdio-bridge.js`

3. **Restart Claude Desktop**

   Tools will appear in Claude Desktop's interface.

**Available Tools**:
- `get_dalive_content(path)` - Fetch HTML from da.live
- `save_dalive_content(path, htmlContent)` - Save edited HTML

**stdio-to-HTTP Bridge Architecture**:

Claude Desktop requires stdio transport (stdin/stdout), but our MCP server runs over HTTP. The bridge connects them:

```
┌──────────────────┐
│ Claude Desktop   │
│ (stdio only)     │
└────────┬─────────┘
         │ stdin/stdout
         │
┌────────▼──────────────────┐
│ mcp-stdio-bridge.js       │
│ - Reads JSON-RPC stdin    │
│ - Forwards to HTTP        │
│ - Manages session ID      │
│ - Includes Bearer token   │
│ - Writes stdout           │
└────────┬──────────────────┘
         │ HTTP POST
         │
┌────────▼──────────────────┐
│ Azure Functions           │
│ POST /api/mcp             │
│ (JSON-RPC 2.0 over HTTP)  │
└────────┬──────────────────┘
         │
┌────────▼──────────────────┐
│ da.live Admin API         │
└───────────────────────────┘
```

**How the Bridge Works**:
1. Reads JSON-RPC messages from stdin (one per line)
2. Adds Bearer token to Authorization header
3. Manages session ID across requests
4. Forwards to HTTP MCP server
5. Returns responses to stdout (only for requests, not notifications)
6. Waits for pending async operations before exit

**Session Management**:
- Sessions created on `initialize` call
- 24-hour timeout (long conversations supported)
- Bearer token stored per session
- Session ID persists across tool calls

**Debugging**:
- Bridge logs to stderr: `[MCP Bridge] ...`
- Claude Desktop logs: `~/Library/Logs/Claude/mcp-server-azure-da-mcp.log`
- Azure Functions logs: Terminal where `npm start` is running

### Testing Philosophy

**Real tests only**: No mocks, no stubs. If it doesn't test actual behavior with real APIs, delete it.

```bash
# Run all MCP E2E tests
node tests/e2e/backward-compat.test.js  # Verify no regressions
node tests/e2e/mcp-session.test.js      # MCP protocol negotiation
node tests/e2e/mcp-get-content.test.js  # get_dalive_content tool
node tests/e2e/mcp-save-content.test.js # save_dalive_content tool
node tests/e2e/mcp-integration.test.js  # Full LLM+MCP workflow (~30s)
```

## API Endpoints

### POST /api/EditContent
MCP-enabled AI-assisted content editing. The LLM autonomously fetches and saves content.

**Request**:
```json
{
  "command": "Make the hero section more concise",
  "path": "/source/your-org/your-project/page.html"
}
```

**Headers**:
```
Authorization: Bearer <da.live-token>
Content-Type: application/json
```

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
  "mcpToolCalls": [
    {
      "toolName": "get_dalive_content",
      "parameters": { "path": "/source/..." },
      "result": { "htmlContent": "...", "path": "..." },
      "duration": 115,
      "status": "completed"
    },
    {
      "toolName": "save_dalive_content",
      "parameters": { "path": "/source/...", "htmlContent": "..." },
      "result": { "success": true },
      "duration": 908,
      "status": "completed"
    }
  ]
}
```

**Note**: Timing typically ~30 seconds (MCP workflow + LLM multi-turn conversation).

### POST /api/mcp
MCP server endpoint (JSON-RPC 2.0). Handles MCP protocol messages for tool calling.

**Supported Methods**:
- `initialize` - Start MCP session with Bearer token
- `initialized` - Confirm session ready
- `tools/list` - List available tools
- `tools/call` - Execute a tool (get_dalive_content, save_dalive_content)

**MCP Tools**:
1. **get_dalive_content**(path) - Fetch HTML from da.live
2. **save_dalive_content**(path, htmlContent) - Save edited HTML to da.live

### GET /api/GetContent/{*path}
Fetch page content from da.live (backward compatibility endpoint)

### GET /api/HealthCheck
Service health status

## Key Implementation Details

### MCP Integration Architecture

**LlmClient with MCP Session**:
```javascript
// Initialize MCP session with Bearer token
const mcpSession = await initializeMcpSession(serverUrl, bearerToken);

// Define tools for Anthropic API
const tools = [
  { name: 'get_dalive_content', description: '...', input_schema: {...} },
  { name: 'save_dalive_content', description: '...', input_schema: {...} }
];

// Multi-turn conversation loop for tool calling
const response = await client.messages.create({
  model: 'claude-sonnet-4-20250514',
  tools,  // Anthropic automatically handles tool calling
  messages
});

// When LLM calls a tool, execute via MCP server
if (toolUseBlock) {
  const toolResult = await callMcpTool(mcpSession, toolName, toolInput);
  // Add result to conversation and continue
}
```

**McpTools Module**:
- Implements `get_dalive_content(params, context)` - wraps DaliveClient.getContent()
- Implements `save_dalive_content(params, context)` - wraps DaliveClient.updateContent()
- Validates parameters and handles Bearer token from session context
- Returns MCP-formatted responses

**McpSessionFunction**:
- Handles JSON-RPC 2.0 protocol (initialize, initialized, tools/list, tools/call)
- Manages session state with Bearer token
- Dispatches tool calls to McpTools module

### Multipart Form Data (Critical!)
```javascript
const formData = new FormData();
formData.append('data', Buffer.from(html), {
  filename: 'content.html',
  contentType: 'text/html'
});

// CRITICAL: POST directly to the path, NOT /api/{path}
// Working:     POST https://admin.da.live/source/owner/site/page.html
// Not working: POST https://admin.da.live/api/source/owner/site/page.html
await axios.post(`${DALIVE_API_URL}${path}`, formData, {
  headers: {
    'Authorization': `Bearer ${token}`,
    ...formData.getHeaders()  // Critical for boundary
  }
});
```

### Prompt Engineering
System instructions emphasize:
- Preserve facts and brand terms
- Maintain HTML structure
- Content-level edits only
- Return complete HTML (not diffs)

### Error Handling
- Retry logic: 500+ errors with exponential backoff
- No retry: 4xx client errors
- Timeout handling: Anthropic API (15s), da.live API (5s)

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-...
DALIVE_BEARER_TOKEN=your_token

# Optional
DALIVE_API_URL=https://admin.da.live               # default
MCP_SERVER_URL=http://localhost:7071/api/mcp       # default (local development)
LOG_LEVEL=debug                                     # default
```

## Common Issues

### Node Version Error
```
Error: Incompatible Node.js version (v24.6.0)
```
**Fix**: Use Node 20
```bash
nvm use 20
npm start
```

### Content Saves But UI Doesn't Update
**Cause**: Using `/api` prefix in POST URL (da.live POST endpoint doesn't use `/api`)
**Fix**: POST directly to `${DALIVE_API_URL}${path}` NOT `${DALIVE_API_URL}/api${path}`

### POST Not Saving Content
**Cause**: Not using multipart form data
**Fix**: Already implemented in DaliveClient.js (uses form-data package)

### Function Timeout
**Cause**: MCP workflow can take 30+ seconds (LLM multi-turn conversation + tool calls)
**Fix**: Timeout set to 2 minutes in host.json (was 30s)
**Note**: EditContent typically completes in ~30 seconds but can vary based on LLM processing time

### MCP Session Errors
**Symptom**: "MCP session initialization failed"
**Cause**: MCP_SERVER_URL not accessible or Bearer token invalid
**Fix**: Verify MCP_SERVER_URL is correct and server is running

## Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.65.0",          // Claude API with tool calling
  "@azure/functions": "^4.0.0",             // Azure Functions v4
  "@modelcontextprotocol/sdk": "^1.0.4",   // MCP protocol implementation
  "axios": "^1.12.2",                       // HTTP client
  "form-data": "^4.0.4"                     // Multipart POST for da.live
}
```

## What We Removed

- ❌ Unit tests (mocking doesn't test real behavior)
- ❌ Integration tests (fake APIs don't validate)
- ❌ Contract tests (APIs change, tests lie)
- ❌ ResponseValidator (complexity without value)
- ❌ Block-based architecture (da.live uses HTML)

## What We Kept

- ✅ E2E tests with real APIs
- ✅ Simple, direct architecture
- ✅ Actual error handling from real failures
- ✅ Clear logging for debugging

## Next Steps

See `/specs/001-let-s-build/` for current implementation status and tasks.
