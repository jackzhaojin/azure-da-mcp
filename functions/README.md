# Azure Functions MCP Server

AI-powered content editing for da.live via Azure Functions and Model Context Protocol (MCP).

## What is this?

HTTP MCP server providing tools for LLMs to autonomously fetch, edit, and save content on da.live. The LLM decides when to list directories, fetch content, make edits, and save changes - no pre-fetching required.

## Quick Start

```bash
# Prerequisites: Node 22+
npm install

# Configure environment (create .env and local.settings.json)
cp .env.example .env
# Edit both .env and local.settings.json with your tokens

# Start server
npm start
# Server runs on http://localhost:7071
```

## Available MCP Tools

The server provides 6 MCP tools for da.live content management:

1. **list_dalive_content** - List directory contents (files and folders)
2. **get_dalive_content** - Fetch HTML content from a path
3. **save_dalive_content** - Save edited HTML to a path
4. **create_dalive_content** - Create new content at a path
5. **create_folder_dalive** - Create folder structure
6. **preview_publish_dalive_content** - Trigger preview/publish

### File vs Folder Detection

- **Files**: Have `ext` and `lastModified` fields (e.g., `buttons.html`)
- **Folders**: Only have `path` and `name` fields (e.g., `block-collection`)

## MCP Endpoints

### `/api/mcp` - Claude Desktop Integration
JSON-RPC 2.0 endpoint for Claude Desktop via stdio bridge (`mcp-stdio-bridge.js`)

### `/api/mcp-streamable` - HTTP Clients
Manual JSON-RPC 2.0 endpoint for n8n, MCP Inspector, and other HTTP-based clients. Works with Docker containers via `host.docker.internal:7071`

### `/api/EditContent` - Business Logic
Main endpoint for AI-assisted content editing. Routes to provider-specific LLM clients.

## Multi-LLM Support

Supports 3 LLM providers with identical capabilities:

- **Claude** (Anthropic) - Premium, best for complex edits
- **Gemini** (Google) - Free tier available
- **Azure AI Foundry** - Enterprise, cost-effective

Configure via `LLM_PROVIDER` environment variable or request body.

## Configuration Files

**IMPORTANT**: Azure Functions requires configuration in TWO places:

1. **`.env`** - Used by tests and some modules
2. **`local.settings.json`** - Used by Azure Functions runtime

Update your da.live Bearer token in BOTH files when it expires.

## Testing

```bash
# Run all E2E tests (requires real API credentials)
npm test

# Run specific test
npm test -- tests/e2e/backward-compat.test.js

# Watch mode for development
npm run test:watch
```

**Testing Philosophy**: Real tests only. No mocks, no stubs. Tests use actual Anthropic and da.live APIs.

## Example Usage

### List directory contents
```bash
curl -X POST http://localhost:7071/api/mcp-streamable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "list_dalive_content",
      "arguments": {"path": "/owner/site/folder"}
    },
    "id": "1"
  }'
```

### Get content
```bash
curl -X POST http://localhost:7071/api/mcp-streamable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_dalive_content",
      "arguments": {"path": "/source/owner/site/page.html"}
    },
    "id": "2"
  }'
```

## Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Detailed developer guide for Claude Code
- **[.env.example](./.env.example)** - Environment variable reference
- **Root [README.md](../README.md)** - Monorepo overview

## Common Issues

**Node Version Error**: Use Node 22+ (check `package.json` engines field)

**Two Config Files**: Remember to update BOTH `.env` and `local.settings.json` when refreshing Bearer tokens

**Docker Connection**: Use `host.docker.internal:7071` instead of `localhost:7071` when calling from Docker containers (n8n, etc.)

## Architecture

```
Client → EditContentFunction → LlmClient (router)
           ↓
  [ClaudeClient | GeminiClient | AzureAIFoundryClient]
           ↓
  LLM autonomously calls MCP tools:
    - list_dalive_content
    - get_dalive_content
    - save_dalive_content
           ↓
  da.live Admin API
```

## Tech Stack

- **Runtime**: Azure Functions v4, Node.js 22+
- **LLM SDKs**: Anthropic SDK, Google Gemini, Azure OpenAI
- **MCP**: `@modelcontextprotocol/sdk`
- **Testing**: Jest with real API integration

---

**Last Updated**: 2026-01-11
**Status**: Production-ready
