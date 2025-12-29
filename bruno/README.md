# Bruno API Testing Collections

HTTP request collections for testing da.live Admin API and Azure Functions MCP endpoints.

## Overview

Bruno is an open-source API client (alternative to Postman/Insomnia) that stores requests as plain text files. This directory contains collections for testing and exploring APIs used in this monorepo.

## Why Bruno?

- **Git-friendly**: Plain text `.bru` files (easy to diff and version)
- **Offline-first**: No cloud sync required
- **Open source**: Free and privacy-focused
- **Fast**: Lightweight and responsive
- **Environments**: Support for multiple environments (local, dev, prod)

## Collections

### 1. `da-live-content/` - da.live Admin API
Test da.live content management endpoints.

**Endpoints**:
- `getcontent.bru` - Fetch page content (GET)
- `savecontent.bru` - Save page content (POST with multipart form data)

**Use Cases**:
- Explore da.live API structure
- Debug content fetching issues
- Test multipart form uploads
- Validate Bearer token authentication

### 2. `local-functions/` - Azure Functions MCP Endpoints
Test local Azure Functions MCP server endpoints.

**Endpoints**:
- `EditContentFunction.bru` - AI-assisted content editing (POST)
- `ClaudeHaiku.bru` - Direct Claude Haiku API call
- `ClaudeMcpGet.bru` - Claude with MCP tools (get_dalive_content)
- `GeminiHaiku.bru` - Direct Gemini API call
- `GeminiMcpGet.bru` - Gemini with MCP tools
- `AzureHaiku.bru` - Direct Azure OpenAI API call
- `AzureMcpGet.bru` - Azure OpenAI with MCP tools

**Use Cases**:
- Test Azure Functions locally (http://localhost:7071)
- Debug MCP tool calling
- Validate multi-LLM support
- Test different model configurations

## Installation

### 1. Install Bruno Desktop App
Download from [usebruno.com](https://www.usebruno.com/)

**macOS**:
```bash
brew install bruno
```

**Windows/Linux**:
Download installer from [GitHub Releases](https://github.com/usebruno/bruno/releases)

### 2. Open Collections
1. Launch Bruno
2. Click "Open Collection"
3. Navigate to `bruno/da-live-content` or `bruno/local-functions`
4. Collections will load automatically

## Configuration

### Environment Variables

Each collection uses environment variables for:
- API URLs
- Bearer tokens
- Request paths

**To configure**:
1. Open collection in Bruno
2. Click "Environments" (left sidebar)
3. Edit environment variables:
   - `baseUrl` - API base URL
   - `bearerToken` - Authentication token
   - `path` - Content path

### Example: da-live-content Environment
```
baseUrl: https://admin.da.live/api
bearerToken: your-dalive-bearer-token-here
path: /source/your-org/your-project/page.html
```

### Example: local-functions Environment
```
baseUrl: http://localhost:7071
bearerToken: your-dalive-bearer-token-here
path: /source/your-org/your-project/page.html
anthropicApiKey: sk-ant-api03-your-key-here
```

## Usage

### Testing da.live API

1. **Open `da-live-content` collection**
2. **Configure environment** with your Bearer token
3. **Run `getcontent.bru`** to fetch a page
4. **Edit response** in your editor
5. **Run `savecontent.bru`** to save changes

**Note**: `savecontent.bru` uses multipart form data (required by da.live API)

### Testing Azure Functions

1. **Start Azure Functions server**:
   ```bash
   cd functions
   npm start
   # Server runs on http://localhost:7071
   ```

2. **Open `local-functions` collection**
3. **Configure environment** with your tokens
4. **Run requests** (e.g., `EditContentFunction.bru`)

**Available Tests**:
- **Direct LLM calls**: Test Claude/Gemini/Azure OpenAI without MCP
- **MCP tool calls**: Test LLMs with get_dalive_content/save_dalive_content
- **Full editing workflow**: Test EditContent endpoint

### Example Workflow

**Test content editing**:
1. Run `ClaudeMcpGet.bru` - Fetch content using Claude + MCP
2. Verify response includes HTML content
3. Run `EditContentFunction.bru` - Edit content with natural language
4. Check edited HTML in response

## File Structure

```
bruno/
├── da-live-content/
│   ├── bruno.json          # Collection metadata
│   ├── collection.bru      # Collection settings
│   ├── getcontent.bru      # GET request
│   └── savecontent.bru     # POST request (multipart)
└── local-functions/
    ├── bruno.json                      # Collection metadata
    ├── collection.bru                  # Collection settings
    ├── EditContentFunction.bru         # Full editing workflow
    ├── ClaudeHaiku.bru                 # Direct Claude call
    ├── ClaudeMcpGet.bru                # Claude + MCP tools
    ├── GeminiHaiku.bru                 # Direct Gemini call
    ├── GeminiMcpGet.bru                # Gemini + MCP tools
    ├── AzureHaiku.bru                  # Direct Azure OpenAI call
    └── AzureMcpGet.bru                 # Azure OpenAI + MCP tools
```

## Adding New Requests

### Via Bruno UI
1. Right-click collection → "New Request"
2. Configure HTTP method, URL, headers, body
3. Save (file auto-created in collection folder)

### Via File Creation
```bash
cd bruno/local-functions
touch new-endpoint.bru
```

Edit with Bruno's `.bru` format:
```
meta {
  name: My New Endpoint
  type: http
  seq: 10
}

post {
  url: {{baseUrl}}/api/my-endpoint
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

## Tips & Tricks

### Quick Testing
- Use `Cmd+Enter` (Mac) or `Ctrl+Enter` (Windows) to send request
- Use environments to switch between local/dev/prod
- Clone requests to test variations

### Debugging
- Check response status, headers, body
- Use Bruno's console for detailed logs
- Copy as cURL to test in terminal

### Collaboration
- Commit `.bru` files to Git
- Share collections with team
- Use environment files (gitignored) for secrets

## Common Issues

### Request Fails with 401 Unauthorized
**Cause**: Bearer token expired or invalid
**Fix**: Update `bearerToken` in environment

### Azure Functions Not Accessible
**Cause**: Functions server not running
**Fix**: Start server with `cd functions && npm start`

### Multipart Upload Fails
**Cause**: Content-Type header incorrect
**Fix**: Use `savecontent.bru` as template (sets proper headers)

## Related Documentation

- [Bruno Documentation](https://docs.usebruno.com/)
- [da.live Admin API](https://admin.da.live/)
- [Azure Functions Testing](../functions/CLAUDE.md)

---

**Last Updated**: 2025-12-29
**Tool**: Bruno API Client
**Purpose**: API exploration and testing
