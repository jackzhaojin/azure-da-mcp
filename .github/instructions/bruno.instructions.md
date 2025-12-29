---
applyTo: "bruno/**"
---

# Bruno API Testing Collections Instructions

## Overview

HTTP request collections for testing da.live and Azure Functions APIs using Bruno.

**Tool**: Bruno API Client (Postman/Insomnia alternative)
**Storage**: Plain text `.bru` files (Git-friendly)
**Usage**: Open in Bruno desktop app

## Collections

### da-live-content/
**Purpose**: Test da.live Admin API endpoints

| File | Purpose |
|------|---------|
| `getcontent.bru` | Fetch page content (GET) |
| `savecontent.bru` | Save page content (POST multipart) |

### local-functions/
**Purpose**: Test Azure Functions MCP server endpoints

| File | Purpose |
|------|---------|
| `EditContentFunction.bru` | Full MCP-enabled editing workflow |
| `ClaudeHaiku.bru` / `ClaudeMcpGet.bru` | Claude API tests |
| `GeminiHaiku.bru` / `GeminiMcpGet.bru` | Gemini API tests |

## Key Learnings

**da.live API Requirements:**
- POST requires `multipart/form-data`
- Bearer token in Authorization header
- URL structure: `${baseUrl}${path}` (NOT `${baseUrl}/api${path}`)

**MCP Testing:**
- Tool calls are multi-turn conversations
- Check for `stop_reason: "tool_use"` in responses
- Session management via `Mcp-Session-Id` header

## Testing Workflow

### Testing da.live API

1. Open Bruno
2. Load `da-live-content` collection
3. Set environment variables:
   - `baseUrl`: `https://admin.da.live`
   - `bearerToken`: (your token)
   - `path`: `/source/org/project/page.html`
4. Run `getcontent.bru` (should return HTML)
5. Run `savecontent.bru` (should save successfully)

### Testing Azure Functions

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
5. Run test requests

## Common Error Codes

| Status | Cause | Fix |
|--------|-------|-----|
| 401 | Bearer token expired | Get new token from da.live |
| 404 | Path doesn't exist | Check path format |
| 500 | Multipart form issue | Verify form-data format |

## Bruno File Format

`.bru` files are plain text:
```
meta {
  name: Get Content
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}{{path}}
  body: none
  auth: bearer
}

auth:bearer {
  token: {{bearerToken}}
}
```

## Adding New Requests

1. Create new `.bru` file in appropriate collection
2. Define request metadata, URL, headers
3. Set auth type (usually bearer)
4. Test and commit

## Code Suggestions

**When adding requests:**
- Use Bruno's `.bru` format
- Reference environment variables with `{{variable}}`
- Include appropriate auth headers
- Document expected responses

**Don't suggest:**
- JavaScript code (Bruno handles this via UI)
- Postman/Insomnia formats
