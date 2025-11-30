# Release 1.5 - Bearer Token Management

**Release Date**: 2025-11-30
**Status**: ✅ Complete and Tested

## What's New

### Dynamic Bearer Token Support

You can now set and change the da.live Bearer token during an active MCP session without restarting the server or editing configuration files.

### New MCP Tool: `set_token_dalive`

**Purpose**: Set the da.live Bearer token for your current MCP session.

**Usage**:
```javascript
// Using AI in Claude Desktop
"Set token to eyJhbGciOiJSUzI1NiIsIng1dSI6Imltc19uYTEta2V5LWF0..."

// Direct tool call
{
  "name": "set_token_dalive",
  "arguments": {
    "token": "your-bearer-token-here"
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "da.live Bearer token set successfully for this session",
  "tokenLength": 1234,
  "timestamp": "2025-11-30T..."
}
```

### Token Priority System

All da.live tools now support flexible token resolution:

1. **Passed in tool parameters** (highest priority)
   - Token provided directly in `params.token` or `params.bearerToken`
   - Use case: Override token for specific calls

2. **Set via set_token_dalive**
   - Token set during MCP session
   - Persists across all tool calls in the session
   - Use case: Set once, use many times

3. **Environment variable** (fallback)
   - `DALIVE_BEARER_TOKEN` from `.env` or system environment
   - Use case: Default token for local development

## Benefits

✅ **Dynamic Token Switching** - Change tokens mid-session without restarting
✅ **Multi-User Support** - Different sessions can use different tokens
✅ **Per-Call Override** - Override session token for specific calls
✅ **Backward Compatible** - Environment variables still work as before
✅ **Secure** - Tokens stored in memory only, 24-hour session timeout

## Updated Tools

All 6 MCP tools now support the token priority system:

1. `get_dalive_content` - Fetch HTML from da.live
2. `save_dalive_content` - Save edited HTML
3. `create_dalive_content` - Create new content
4. `create_folder_dalive` - Create folders
5. `preview_publish_dalive_content` - Trigger preview publish
6. `set_token_dalive` - Set session token (NEW)

## Implementation Details

### New Files

- `functions/src/mcp/tools/set-token-dalive.js` - Tool implementation
- `functions/src/mcp/schemas/set-token-request.schema.json` - JSON schema
- `functions/tests/adhoc/test-set-token.js` - Test script (all passing ✓)

### Modified Files

- `functions/src/mcp/utils/validator.js` - Added `resolveBearerToken()` function
- `functions/src/mcp/tools/index.js` - Registered new tool
- `functions/src/functions/McpSessionFunction.js` - Added `setSessionToken()` context function
- All 5 existing dalive tools - Updated to use token priority resolution

### Testing

All tests passing ✓:
- Token priority resolution (5/5 tests)
- Backward compatibility with environment variables
- Session token persistence
- Per-call token override

## Usage Examples

### Example 1: Set token once, use multiple times
```
User: "Set token to eyJhbGciOiJSUzI1NiIs..."
AI: ✓ Token set successfully

User: "Get content from /source/owner/site/page1.html"
AI: [Fetches using session token]

User: "Get content from /source/owner/site/page2.html"
AI: [Uses same session token]
```

### Example 2: Override token for specific call
```json
{
  "name": "get_dalive_content",
  "arguments": {
    "path": "/source/owner/site/page.html",
    "token": "different-token-for-this-call-only"
  }
}
```

### Example 3: Fallback to environment variable
```bash
# Set in .env
DALIVE_BEARER_TOKEN=your_default_token

# No need to pass token - uses env variable automatically
```

## Migration Guide

**No migration needed** - This release is fully backward compatible.

Existing code using environment variables will continue to work without any changes. The new token management features are optional enhancements.

## Documentation Updates

- ✅ `functions/CLAUDE.md` - Added Bearer Token Management section
- ✅ `README.md` - Updated tool list and usage examples
- ✅ Release version updated to 1.5
- ✅ All tool descriptions updated

## Breaking Changes

None - fully backward compatible with previous releases.

## Known Issues

None.

## Next Steps

Consider adding:
- Token validation endpoint
- Token expiry warnings
- Multi-token management for team workflows
