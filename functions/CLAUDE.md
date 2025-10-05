# Azure DA.live MCP Functions

AI-assisted content editing for da.live via Azure Functions and Claude API.

## Architecture

**Simple & Direct**: Fetch HTML from da.live → Claude edits → Save back to da.live

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐     ┌─────────────┐
│   Client    │────▶│    Azure     │────▶│  Claude  │────▶│   da.live   │
│             │     │  Functions   │     │   API    │     │     API     │
└─────────────┘     └──────────────┘     └──────────┘     └─────────────┘
                          │                     │                │
                          │  1. GET /api{path}  │                │
                          │─────────────────────────────────────▶│
                          │                     │                │
                          │  2. Generate edit   │                │
                          │────────────────────▶│                │
                          │                     │                │
                          │  3. POST /api{path} │                │
                          │─────────────────────────────────────▶│
```

## Key Changes from Original Design

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
│   │   ├── EditContentFunction.js    # Main editing endpoint
│   │   ├── GetContentFunction.js     # Fetch content
│   │   └── HealthCheckFunction.js    # Status check
│   └── modules/             # Core logic
│       ├── DaliveClient.js          # da.live API (multipart POST)
│       ├── LlmClient.js             # Anthropic API
│       ├── PromptBuilder.js         # HTML editing prompts
│       └── Logger.js                # Request logging
└── tests/
    └── e2e/                 # End-to-end tests ONLY
        └── manual-test.js   # Real API integration test
```

## Development

### Prerequisites
- Node 20 (Azure Functions v4 requirement)
- Azure Functions Core Tools
- da.live Bearer token
- Anthropic API key

### Setup
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your keys to .env
DALIVE_BEARER_TOKEN=your_token_here
ANTHROPIC_API_KEY=your_key_here

# Start server (uses Node 20 via nvm)
nvm use 20
npm start
```

### Testing Philosophy

**Real tests only**: No mocks, no stubs. If it doesn't test actual behavior with real APIs, delete it.

```bash
# Run E2E test (makes real API calls)
node tests/e2e/manual-test.js

# Customize test
E2E_TEST_COMMAND="your command here" node tests/e2e/manual-test.js
```

## API Endpoints

### POST /api/EditContent
AI-assisted content editing

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
  "editedHtmlLength": 4124,
  "explanation": "Condensed the main hero section...",
  "reasoning": "The original was verbose...",
  "timing": {
    "total": 14515,
    "dalive_fetch": 111,
    "llm_call": 13576,
    "dalive_update": 828
  }
}
```

### GET /api/GetContent/{*path}
Fetch page content from da.live

### GET /api/HealthCheck
Service health status

## Key Implementation Details

### Multipart Form Data (Critical!)
```javascript
const formData = new FormData();
formData.append('data', Buffer.from(html), {
  filename: 'content.html',
  contentType: 'text/html'
});

await axios.post(url, formData, {
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
DALIVE_API_URL=https://admin.da.live  # default
LOG_LEVEL=debug                        # default
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

### POST Not Saving Content
**Cause**: Not using multipart form data
**Fix**: Already implemented in DaliveClient.js (uses form-data package)

### Function Timeout
**Cause**: LLM calls can take 10-15 seconds
**Fix**: Increase timeout in host.json (default: 30s)

## Dependencies

```json
{
  "@anthropic-ai/sdk": "^0.65.0",    // Claude API (v4 model)
  "@azure/functions": "^4.0.0",       // Azure Functions v4
  "form-data": "^4.0.4",              // Multipart POST for da.live
  "axios": "^1.12.2"                  // HTTP client
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
