# Claude Agent SDK Integration

## Overview

This document describes the Claude Agent SDK integration in the Azure DA MCP Functions project.

## What We Built

### New Endpoint

**POST /api/ClaudeAgentSdk** - Alternative LLM client using the official `@anthropic-ai/claude-agent-sdk`

**Files Created:**
- `src/modules/llm-clients/ClaudeAgentSdkClient.js` - LLM client module using Agent SDK
- `src/functions/ClaudeAgentSdkFunction.js` - Azure Function HTTP endpoint
- `tests/e2e/claude-agent-sdk-haiku.test.js` - E2E test for simple use case
- `tests/e2e/claude-agent-sdk-mcp-get.test.js` - E2E test for MCP integration (does not pass)
- `tests/e2e/claude-agent-sdk-mcp-streamable-get.test.js` - E2E test for MCP streamable (does not pass)

## What Works

✅ **Simple LLM Calls (No MCP)**
- The Agent SDK works perfectly for basic Claude API calls
- JSON response parsing works correctly
- Token usage tracking works
- Test: `claude-agent-sdk-haiku.test.js` ✅ PASSING

## What Doesn't Work

❌ **MCP Integration**

The Claude Agent SDK cannot connect to our HTTP-based MCP servers due to fundamental architectural incompatibility.

**Error:** `Claude Code process exited with code 1`

**Root Cause:**
1. The SDK tries to spawn a `claude` CLI subprocess when MCP servers are configured
2. This subprocess approach is designed for client-side applications (like Claude Desktop), not server-side APIs
3. Our MCP servers use HTTP JSON-RPC 2.0, but the SDK expects:
   - stdio-based MCP servers (local processes communicating via stdin/stdout)
   - SSE-based MCP servers (Server-Sent Events for streaming)

**Why This Limitation Exists:**

The Claude Agent SDK is designed for:
- ✅ Client-side applications (desktop apps, CLIs)
- ✅ Applications that can spawn subprocesses
- ✅ Local development environments

The Claude Agent SDK is NOT designed for:
- ❌ Server-side HTTP APIs (like Azure Functions)
- ❌ Serverless environments
- ❌ Connecting to existing HTTP MCP servers

## Recommended Approach

For our use case (server-side Azure Functions with HTTP MCP integration), continue using:

**POST /api/ClaudeLlmClient** - Our existing implementation using `@anthropic-ai/sdk`
- ✅ Works with HTTP MCP servers
- ✅ Server-to-server MCP communication
- ✅ Full MCP tool support (get_dalive_content, save_dalive_content)
- ✅ All E2E tests passing

## When to Use Each Endpoint

### Use ClaudeAgentSdk (`/api/ClaudeAgentSdk`)
- Simple LLM calls without MCP tools
- Quick JSON-based Claude API interactions
- Non-MCP workflows

### Use ClaudeLlmClient (`/api/ClaudeLlmClient`)
- MCP tool integration required
- Content fetching and saving workflows
- Full autonomous agent behavior with MCP tools

## Test Results

### Simple Test (No MCP)
```bash
$ node tests/e2e/claude-agent-sdk-haiku.test.js
✅ Test passed!
📜 Haiku: [Generated successfully]
📊 Metrics: 7496ms duration
```

### MCP Test (With MCP)
```bash
$ node tests/e2e/claude-agent-sdk-mcp-get.test.js
❌ Test failed: Claude Code process exited with code 1
```

## Technical Details

### Message Structure

The Agent SDK returns messages with a different structure than the standard Anthropic SDK:

```javascript
{
  "type": "assistant",  // Note: 'type' not 'role'
  "message": {
    "model": "claude-sonnet-4-5-20250929",
    "id": "msg_...",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "```json\n{...}\n```"
      }
    ]
  }
}
```

### Token Usage

Token usage is available in the `result` message:

```javascript
{
  "type": "result",
  "usage": {
    "input_tokens": 234,
    "output_tokens": 156
  }
}
```

## Future Considerations

If Anthropic updates the Claude Agent SDK to support:
- HTTP MCP servers (non-SSE)
- Server-side runtime environments
- Explicit HTTP transport configuration

Then we could revisit MCP integration with the Agent SDK. Until then, our existing `ClaudeLlmClient` implementation is the recommended approach for MCP workflows.

## References

- [Claude Agent SDK Documentation](https://docs.claude.com/en/api/agent-sdk/typescript)
- [Claude Agent SDK MCP Integration](https://docs.claude.com/en/api/agent-sdk/mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- Existing implementation: `src/modules/llm-clients/ClaudeClient.js`
