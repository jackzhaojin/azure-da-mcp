# Bruno API Testing Collections

HTTP request collections for testing da.live and Azure Functions APIs.

## What This Is

Bruno collections (`.bru` files) for API testing and exploration. Bruno is a Postman/Insomnia alternative that stores requests as plain text files.

## Quick Context

**Tool**: Bruno API Client
**Purpose**: Test da.live Admin API and Azure Functions MCP endpoints
**Storage**: Plain text `.bru` files (Git-friendly)
**Usage**: Open in Bruno desktop app

## Collections

### da-live-content/
**Purpose**: Test da.live Admin API endpoints

**Files**:
- `getcontent.bru` - Fetch page content (GET)
- `savecontent.bru` - Save page content (POST multipart)

**Key Learnings**:
- da.live requires `multipart/form-data` for POST
- Bearer token in Authorization header
- POST URL structure: `${baseUrl}${path}` (NOT `${baseUrl}/api${path}`)

### local-functions/
**Purpose**: Test Azure Functions MCP server endpoints

**Files**:
- `EditContentFunction.bru` - Full MCP-enabled editing workflow
- `ClaudeHaiku.bru` / `ClaudeMcpGet.bru` - Claude API tests
- `GeminiHaiku.bru` / `GeminiMcpGet.bru` - Gemini API tests
- `AzureHaiku.bru` / `AzureMcpGet.bru` - Azure OpenAI API tests

**Key Learnings**:
- MCP tool calls are multi-turn conversations
- Direct LLM calls vs. MCP-enabled calls have different response structures
- EditContent orchestrates full fetch→edit→save workflow

## Development Workflow

### Testing da.live API

**Scenario**: Verify multipart form upload works

1. Open Bruno
2. Load `da-live-content` collection
3. Set environment variables:
   - `baseUrl`: `https://admin.da.live/api`
   - `bearerToken`: (your token)
   - `path`: `/source/org/project/page.html`
4. Run `getcontent.bru` (should return HTML)
5. Run `savecontent.bru` (should save successfully)

**Common Issues**:
- 401: Bearer token expired
- 404: Path doesn't exist
- 500: Multipart form not properly formatted

### Testing Azure Functions

**Scenario**: Test MCP tool calling with Claude

1. Start Azure Functions:
   ```bash
   cd functions
   npm start
   ```

2. Open Bruno
3. Load `local-functions` collection
4. Set environment variables:
   - `baseUrl`: `http://localhost:7071`
   - `bearerToken`: (your da.live token)
   - `anthropicApiKey`: (your Claude API key)

5. Run `ClaudeMcpGet.bru`
6. Check response for tool calls

**Expected Response Structure**:
```json
{
  "content": [
    {
      "type": "tool_use",
      "name": "get_dalive_content",
      "input": { "path": "..." }
    }
  ],
  "stop_reason": "tool_use"
}
```

### Adding New Endpoints

**When to add**:
- Testing new Azure Functions endpoints
- Exploring new da.live API features
- Debugging API issues

**How to add**:
1. Right-click collection → "New Request"
2. Configure HTTP method, URL, headers, body
3. Save (auto-creates `.bru` file)
4. Commit to Git

**Template**:
```
meta {
  name: Test Endpoint
  type: http
}

post {
  url: {{baseUrl}}/api/test
  body: json
  auth: bearer
}

auth:bearer {
  token: {{bearerToken}}
}

body:json {
  {
    "key": "value"
  }
}
```

## File Format

Bruno uses `.bru` files (plain text):

```
meta {
  name: Request Name
  type: http
  seq: 1
}

get {
  url: https://api.example.com/endpoint
  auth: bearer
}

auth:bearer {
  token: {{bearerToken}}
}

headers {
  Content-Type: application/json
}

body:json {
  {
    "field": "value"
  }
}
```

**Advantages**:
- Human-readable
- Git-friendly (easy diffs)
- No cloud sync needed
- Environment variable support

## Environment Variables

**Purpose**: Avoid hardcoding secrets in `.bru` files

**Common Variables**:
- `baseUrl` - API base URL
- `bearerToken` - da.live authentication
- `anthropicApiKey` - Claude API key
- `path` - Content path for testing

**Setup**:
1. Open collection in Bruno
2. Click "Environments" (left sidebar)
3. Create environment (e.g., "Local")
4. Add variables
5. Select active environment

**Note**: Environment files are gitignored (contain secrets)

## Integration with Azure Functions

Bruno collections complement Azure Functions development:

1. **Start Functions**: `cd functions && npm start`
2. **Test with Bruno**: Quick API validation
3. **Write E2E tests**: Convert successful Bruno requests to Jest tests
4. **Debug issues**: Use Bruno to isolate problems

**Workflow**:
```
Bruno (manual) → E2E test (automated) → Production deploy
```

## Common Use Cases

### 1. Debug Multipart Form Upload
**Collection**: `da-live-content`
**Request**: `savecontent.bru`
**Purpose**: Verify multipart/form-data structure

### 2. Test MCP Tool Calling
**Collection**: `local-functions`
**Request**: `ClaudeMcpGet.bru`
**Purpose**: Verify LLM calls MCP tools correctly

### 3. Compare LLM Providers
**Collection**: `local-functions`
**Requests**: `ClaudeHaiku.bru`, `GeminiHaiku.bru`, `AzureHaiku.bru`
**Purpose**: Test provider-specific behavior

### 4. Validate EditContent Workflow
**Collection**: `local-functions`
**Request**: `EditContentFunction.bru`
**Purpose**: Test full fetch→edit→save flow

## Debugging Tips

### Request Fails
1. Check Bruno console (bottom panel)
2. Verify environment variables
3. Copy as cURL and test in terminal
4. Compare with working E2E tests

### Response Not Expected
1. Check response status code
2. Inspect response headers
3. Validate request body format
4. Test with minimal request first

### Authentication Issues
1. Verify Bearer token in environment
2. Check token expiration
3. Test token with curl
4. Regenerate token if needed

## Memory Management

**For Claude Code**: When working with Bruno collections:

1. Open Bruno app (don't edit `.bru` files in text editor)
2. Use Bruno UI for request creation
3. Test requests before committing
4. Update environment variables (not committed)
5. Don't load unrelated subprojects

**Context needed**:
- High: The specific `.bru` file being edited
- Medium: Collection settings (`collection.bru`)
- Low: Other collections
- Minimal: Azure Functions implementation details

## Related Documentation

- [Bruno Official Docs](https://docs.usebruno.com/)
- [functions/CLAUDE.md](../functions/CLAUDE.md) - Azure Functions API details
- [da.live Admin API](https://admin.da.live/) - API reference

## Next Steps

1. Add more test scenarios for edge cases
2. Create collection for MCP Inspector testing
3. Document successful request patterns
4. Build request templates for common operations

---

**Last Updated**: 2025-12-29
**Tool**: Bruno API Client
**Collections**: da-live-content, local-functions
**Purpose**: API testing and exploration
