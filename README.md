# Azure da.live MCP Server Backend

Backend MCP (Model Context Protocol) server for AI-assisted da.live content editing using Azure Functions and Anthropic Claude.

## Overview

This project provides an HTTP API backend that orchestrates AI-powered content editing for da.live pages. It integrates da.live Admin API for content management with Anthropic Claude for intelligent content editing.

**Release**: 1.2 (Claude Desktop Integration)
**Status**: ✅ **WORKING** - MCP tools available in Claude Desktop
**Branch**: `main`

## Features

- ✅ **MCP Server Integration** - JSON-RPC 2.0 protocol for Model Context Protocol
- ✅ **Claude Desktop Support** - stdio-to-HTTP bridge for seamless integration
- ✅ **2 MCP Tools** - `get_dalive_content` and `save_dalive_content`
- ✅ **AI-Powered Editing** using Anthropic Claude Sonnet 4
- ✅ **Session Management** - 24-hour session timeout for long conversations
- ✅ **E2E Testing** - All tests use real APIs (no mocks)
- ✅ **Backward Compatible** - HTTP APIs still available

## API Endpoints

### 1. GET /api/GetContent/{path}
Fetch page content from da.live.

**Request:**
```bash
curl http://localhost:7071/api/GetContent/products/enterprise \
  -H "Authorization: Bearer <your-dalive-token>"
```

**Response:** `200 OK`
```json
{
  "path": "/products/enterprise",
  "blocks": [...],
  "metadata": {...},
  "timestamp": "2025-10-04T10:30:45.123Z"
}
```

### 2. POST /api/EditContent
AI-assisted content editing with full orchestration.

**Request:**
```bash
curl -X POST http://localhost:7071/api/EditContent \
  -H "Authorization: Bearer <your-dalive-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "command": "Make more concise",
    "path": "/products/enterprise"
  }'
```

**Response:** `200 OK`
```json
{
  "requestId": "abc-123-def-456",
  "editedBlocks": [...],
  "unchangedBlocks": [...],
  "explanation": "Reduced hero from 47 to 15 words...",
  "reasoning": "Preserved key value proposition...",
  "timing": {
    "total": 3200,
    "dalive_fetch": 400,
    "llm_call": 2400,
    "validation": 200,
    "dalive_update": 200
  }
}
```

### 3. GET /api/HealthCheck
Runtime health verification.

**Request:**
```bash
curl http://localhost:7071/api/HealthCheck
```

**Response:** `200 OK`
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-10-04T10:30:45.123Z",
  "dependencies": {
    "dalive": "unknown",
    "anthropic": "unknown"
  }
}
```

## Project Structure

```
azure-da-mcp/
└── functions/                     # Azure Functions App
    ├── src/
    │   ├── functions/             # HTTP-triggered Azure Functions
    │   │   ├── EditContentFunction.js    # MCP-enabled editing
    │   │   ├── McpSessionFunction.js     # MCP server endpoint
    │   │   ├── GetContentFunction.js     # Legacy content fetch
    │   │   └── HealthCheckFunction.js    # Health check
    │   ├── modules/               # Shared reusable modules
    │   │   ├── McpTools.js              # MCP tool implementations
    │   │   ├── DaliveClient.js          # da.live API client
    │   │   ├── LlmClient.js             # Anthropic API client
    │   │   ├── PromptBuilder.js         # Prompt construction
    │   │   └── Logger.js                # Logging utility
    │   └── prompts/               # Versioned prompt templates
    │       └── edit-content/
    │           └── v1.0.0.json          # Current prompt version
    ├── tests/
    │   ├── adhoc/                 # Quick standalone tests (no harness)
    │   │   └── test-prompt-array.js     # Prompt format verification
    │   └── e2e/                   # End-to-end tests with real APIs
    │       ├── backward-compat.test.js  # Regression tests
    │       └── mcp-hero-timestamp.test.js  # MCP integration
    ├── package.json
    ├── host.json                  # Azure Functions config
    ├── local.settings.json        # Environment variables
    └── jest.config.js             # Test configuration
```

## Prerequisites

- **Docker Desktop** (for local Azure Functions runtime)
- **Node.js 22+** (LTS)
- **Azure Functions Core Tools v4**
  ```bash
  npm install -g azure-functions-core-tools@4 --unsafe-perm true
  ```
- **API Keys:**
  - da.live Bearer token (from browser network tab)
  - Anthropic API key (from https://www.anthropic.com/)

## Quick Start

### 1. Install Dependencies

```bash
cd functions
npm install
```

### 2. Configure Environment

Update `local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "DALIVE_API_URL": "https://admin.da.live/api",
    "ANTHROPIC_API_KEY": "sk-ant-api03-...",
    "LOG_LEVEL": "debug"
  }
}
```

### 3. Start Server

**Make sure you're using Node 20:**

```bash
nvm use 20
```

**Start the server:**

```bash
npm start
# Or: func start
```

Server will start on `http://localhost:7071`

### 4. Verify Health

```bash
curl http://localhost:7071/api/HealthCheck
```

## Testing

### Testing Philosophy

**Real tests only**: No mocks, no stubs. If it doesn't test actual behavior with real APIs, delete it.

### Test Types

1. **Ad-hoc Tests** (`tests/adhoc/`) - Quick standalone tests for specific modules
   - No test harness (Jest) required
   - Fast execution
   - Focused on single module verification

2. **E2E Tests** (`tests/e2e/`) - Full workflow tests with real APIs
   - Uses Jest test framework
   - Tests actual behavior with real da.live and Anthropic APIs
   - Validates complete request/response cycles

### Run Tests

```bash
# Ad-hoc tests (fast, no dependencies)
node tests/adhoc/test-prompt-array.js

# E2E tests (comprehensive, real APIs)
npm test                                # Run all E2E tests
node tests/e2e/backward-compat.test.js  # Regression tests
node tests/e2e/mcp-hero-timestamp.test.js  # MCP integration (~30s)
```

### Why This Approach?

- ❌ **No mocking** - Mocks don't catch real API issues
- ❌ **No stubs** - Stubs test fake behavior, not reality
- ✅ **Real APIs** - Catches actual integration problems
- ✅ **Ad-hoc tests** - Fast verification without overhead
- ✅ **Simple** - Easy to understand and maintain

## Development

### Hot Reload

Azure Functions Core Tools supports hot reload:
1. Keep `func start` running
2. Edit JavaScript files
3. Changes auto-reload

### Linting

```bash
npm run lint          # Check code quality
npm run lint:fix      # Auto-fix issues
```

### Development Workflow

1. **Write ad-hoc test** - Quick verification test in `tests/adhoc/`
2. **Implement feature** - Build the functionality
3. **Run ad-hoc test** - Verify module works in isolation
4. **Add E2E test** - Test with real APIs (if needed)
5. **Verify** - Run full test suite

## Logging

### Overview

The project uses a multi-level logging system compatible with both local development and Azure Application Insights.

### Log Levels

Controlled via `LOG_LEVEL` environment variable in `local.settings.json`:

- **`DEBUG` (0)** - Most verbose, includes full LLM request/response content
- **`INFO` (1)** - Default, logs all MCP calls, LLM calls, and major operations
- **`WARN` (2)** - Potential issues and warnings
- **`ERROR` (3)** - Errors and exceptions with stack traces

### Local Development

**Where logs appear**:
- **stdout/stderr** - All logs appear in the **terminal/console where you run `npm start`**
- **No log files** - Azure Functions local development does NOT write to log files
- Logs stream in real-time to your terminal

**Configure log level** in `local.settings.json`:
```json
{
  "Values": {
    "LOG_LEVEL": "debug"
  }
}
```

**What gets logged**:
- Every MCP request (session creation, tool calls, timing)
- Every LLM API call with duration and token usage
- Full LLM request/response content (DEBUG level only)
- Request IDs for correlation
- Error stack traces

**Example output**:
```
[2025-10-05T14:30:45.123Z] [INFO] MCP request received {
  method: 'tools/call',
  sessionId: 'abc-123',
  toolName: 'get_dalive_content',
  requestId: 'req-456'
}

[2025-10-05T14:30:45.234Z] [INFO] LLM API call starting {
  model: 'claude-sonnet-4-20250514',
  iteration: 1,
  messagesCount: 1,
  hasTools: true,
  toolsCount: 2
}

[2025-10-05T14:30:45.235Z] [DEBUG] LLM API request content {
  requestParams: '{"model":"claude-sonnet-4-20250514",...}'
}

[2025-10-05T14:30:58.456Z] [INFO] LLM API call completed {
  iteration: 1,
  duration: '13221ms',
  inputTokens: 1234,
  outputTokens: 567,
  stopReason: 'end_turn'
}

[2025-10-05T14:30:58.457Z] [DEBUG] LLM API response content {
  response: '[{"type":"text","text":"..."}]'
}
```

**Testing logging locally**:
```bash
# 1. Set log level to debug
# Edit local.settings.json -> "LOG_LEVEL": "debug"

# 2. Start server
cd functions
npm start

# 3. Make a test request (in another terminal)
curl -X POST http://localhost:7071/api/EditContent \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"command":"Make more concise","path":"/products/enterprise"}'

# 4. Watch terminal for logs
# You should see INFO logs for MCP calls
# You should see DEBUG logs with full LLM content
```

### Azure Production

**Where logs appear**: Azure Application Insights

**Access logs**:
1. Go to Azure Portal
2. Navigate to your Function App
3. Select "Application Insights" or "Logs"
4. Query with Kusto (KQL)

**Example queries**:

```kql
// All logs for a specific request ID
traces
| where customDimensions.requestId == "abc-123-def-456"
| order by timestamp desc

// All MCP tool calls
traces
| where message contains "MCP tool call"
| order by timestamp desc

// All LLM API calls with timing
traces
| where message contains "LLM API call completed"
| extend duration = customDimensions.duration
| project timestamp, duration, customDimensions
| order by timestamp desc

// Errors only
traces
| where severityLevel >= 3
| order by timestamp desc
```

**Log level configuration**:
- Set `LOG_LEVEL` application setting in Azure Portal
- Default: `INFO` (recommended for production)
- Change to `DEBUG` only for troubleshooting (increases log volume)

**Structured metadata**:
All logs include structured metadata for easy querying:
- `requestId` - Unique ID for each request
- `sessionId` - MCP session ID
- `toolName` - MCP tool being called
- `duration` - Operation timing
- `inputTokens`, `outputTokens` - LLM usage
- `error`, `stack` - Error details

### Key Logging Points

**EditContentFunction.js**:
- Request received with command and path
- LLM prompt building
- MCP configuration initialization
- LLM call start and completion
- Final response timing

**McpSessionFunction.js**:
- Every MCP request (method, session ID)
- Session creation and initialization
- Tool call start with arguments
- Tool call completion with timing
- Tool call failures with error details

**LlmClient.js**:
- LLM API call start (model, iteration, message count)
- Full request parameters (DEBUG level)
- LLM API call completion (duration, tokens, stop reason)
- Full response content (DEBUG level)
- Tool use requests from LLM
- Final response parsing

**Implementation**:
- Logger module: `/functions/src/modules/Logger.js`
- Uses `context.log` API for Azure Functions
- Falls back to `console.*` for local development
- Level-based filtering to reduce noise

## Architecture

### Core Modules

- **McpTools**: MCP tool implementations (get_dalive_content, save_dalive_content)
- **DaliveClient**: HTTP client for da.live Admin API with multipart form upload
- **LlmClient**: Anthropic Claude API with MCP session management
- **PromptBuilder**: Constructs prompts from versioned templates (supports array format)
- **PromptLoader**: Loads and caches versioned prompt files
- **Logger**: Request correlation and structured logging

### MCP-Enabled Flow (EditContent)

```
1. Extract auth token from request
2. Initialize MCP session with Bearer token
3. Build LLM prompt from versioned template
4. Start LLM conversation with MCP tools
5. LLM autonomously calls get_dalive_content
6. LLM generates edited HTML
7. LLM autonomously calls save_dalive_content
8. Return explanation + reasoning + timing metrics
```

### Error Handling

Structured errors with appropriate HTTP status codes:
- `400 Bad Request`: Invalid request format
- `401 Unauthorized`: Invalid/expired token
- `404 Not Found`: Page path not found
- `422 Unprocessable Entity`: Validation failed
- `502 Bad Gateway`: LLM API unavailable
- `503 Service Unavailable`: da.live unavailable

## Performance Targets

From spec.md requirements:

- End-to-end latency: **P95 < 5 seconds**
- LLM API call: **P95 < 4 seconds**
- da.live operations: **P95 < 500ms**
- Test coverage: **80%+**
- Zero critical errors in **10 consecutive runs**

## Claude Desktop Integration

### Setup

1. **Ensure Azure Functions MCP Server is Running**
   ```bash
   cd functions
   npm start
   # Server runs on http://localhost:7071
   ```

2. **Configure Claude Desktop**

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

3. **Restart Claude Desktop**

   The MCP tools will appear in Claude Desktop's tool palette.

### Available MCP Tools

- **`get_dalive_content`** - Fetch HTML content from da.live
  - Input: `path` (e.g., `/products/enterprise`)
  - Returns: HTML content, last modified timestamp, content length

- **`save_dalive_content`** - Save edited HTML to da.live
  - Input: `path`, `htmlContent`
  - Returns: Success confirmation with updated timestamp

### stdio-to-HTTP Bridge

Claude Desktop requires stdio transport, but the MCP server runs over HTTP. The `mcp-stdio-bridge.js` bridges this gap:

```
Claude Desktop (stdio)
  ↓
mcp-stdio-bridge.js
  ↓
HTTP MCP Server (localhost:7071/api/mcp)
  ↓
da.live Admin API
```

**How it works:**
1. Reads JSON-RPC messages from stdin
2. Forwards to HTTP MCP server with Bearer token
3. Manages session ID across requests
4. Writes responses to stdout

**Session Management:**
- Sessions created on `initialize` call
- 24-hour timeout for long conversations
- Bearer token stored in session for all tool calls

## Configuration

### Azure Functions (host.json)

```json
{
  "functionTimeout": "00:00:30",
  "http": {
    "cors": {
      "allowedOrigins": ["*"]
    }
  }
}
```

### ESLint Rules

- ES2022 features
- ESLint recommended rules
- Standard JavaScript best practices

## Documentation

Detailed documentation available in `/specs/001-let-s-build/`:

- **spec.md**: Feature specification
- **plan.md**: Implementation plan
- **data-model.md**: Entity relationships
- **research.md**: Technical decisions
- **quickstart.md**: Developer guide
- **contracts/**: API specifications
- **tasks.md**: Implementation tasks

## Known Issues

⚠️ **Jest cleanup hanging**
E2E tests execute successfully but Jest cleanup sometimes hangs. All assertions pass. This is a known Jest issue with ES modules and async operations. Use Ctrl+C to exit after tests complete.

## Next Steps

Remaining tasks (7/29):

1. ⏳ Contract tests for da.live API
2. ⏳ Contract tests for Anthropic API
3. ⏳ End-to-end smoke test
4. ⏳ Full test suite with coverage validation
5. ⏳ Verify quickstart.md works end-to-end
6. ⏳ Final validation
7. ⏳ Merge to main branch

## Contributing

This project follows:
- **Real tests only**: No mocks, no stubs - test with real APIs
- **Ad-hoc tests**: Quick module verification in `tests/adhoc/`
- **E2E tests**: Full workflow tests with real APIs in `tests/e2e/`
- **Constitution principles**: Simplicity, no premature abstractions
- **ES modules**: `type: "module"` throughout
- **Azure Functions v4**: Node.js programming model

## License

MIT

---

**Generated with** [Claude Code](https://claude.com/claude-code)
**Feature Branch**: `001-let-s-build`
**Implementation Date**: October 2025
