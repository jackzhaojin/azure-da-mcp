# Azure Functions MCP Server

AI-powered content editing for da.live via Azure Functions and Model Context Protocol (MCP).

## What is this?

HTTP MCP server providing tools for LLMs to autonomously fetch, edit, and save content on da.live. The LLM decides when to list directories, fetch content, make edits, and save changes - no pre-fetching required.

## Authentication

The deployed function is a **per-request bearer pass-through**. It does not store a da.live token; every MCP request must include `Authorization: Bearer <ims-token>` and that token is forwarded verbatim to `admin.da.live`. There is no server-side OAuth state.

The easiest way for a caller to obtain a valid IMS token is the [`da-auth-helper`](https://github.com/adobe-rnd/da-auth-helper) CLI, which drives Adobe's public `darkalley` IMS app through a local browser OAuth flow and caches the result at `~/.aem/da-token.json`:

```bash
TOKEN=$(npx github:adobe-rnd/da-auth-helper token)
# first run opens a browser; subsequent runs return the cached token until expiry
```

Tokens are valid ~24 hours and carry the full DA scope set (`aem.frontend.all`, `ab.manage`, …) — sufficient for list / get / save / create / preview-publish.

> **Do not set `DALIVE_BEARER_TOKEN` in the deployed Azure Function's app settings.** The function falls back to that variable when callers don't supply their own Authorization header. With it set in production, anyone who knows the function URL can read and write da.live content as whoever owns the token. Local `.env` / `local.settings.json` is fine for development — production should rely solely on per-request bearers.

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

**For local development**, Azure Functions reads configuration from two places:

1. **`.env`** - Used by tests and some modules
2. **`local.settings.json`** - Used by Azure Functions runtime

A `DALIVE_BEARER_TOKEN` set in either file is only consumed as a fallback for callers that omit the Authorization header — convenient when running E2E tests locally. Refresh it via `npx github:adobe-rnd/da-auth-helper token` rather than digging through DevTools. For the deployed function in Azure, see the [Authentication](#authentication) section — `DALIVE_BEARER_TOKEN` must not be set there.

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

```bash
# Grab an IMS token once per ~24h — opens a browser the first time
TOKEN=$(npx github:adobe-rnd/da-auth-helper token)
```

### List directory contents
```bash
curl -X POST http://localhost:7071/api/mcp-streamable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
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
  -H "Authorization: Bearer $TOKEN" \
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

**Refreshing local tokens**: Run `npx github:adobe-rnd/da-auth-helper token` to mint a fresh IMS bearer; paste it into BOTH `.env` and `local.settings.json` if you use the env-var fallback for local tests. The helper caches at `~/.aem/da-token.json` and re-runs as a no-op while the cached token is valid.

**Azure deploy gotcha**: If `DALIVE_BEARER_TOKEN` ever shows up in the deployed function's app settings, the function silently serves anonymous callers as the token's owner. Keep it unset in Azure — see [Authentication](#authentication).

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

**Last Updated**: 2026-05-15
**Status**: Production-ready
