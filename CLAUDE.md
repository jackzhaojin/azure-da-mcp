# Azure DA MCP Server

AI-powered content editing for da.live pages via natural language commands.

## What This Project Does

```
User: "Make the hero section more concise"
  ↓
Server fetches HTML from da.live
  ↓
Claude edits the HTML
  ↓
Server saves back to da.live
  ↓
User gets: explanation + reasoning + timing metrics
```

## Quick Start

```bash
cd functions
npm install

# Add your tokens to local.settings.json
# ANTHROPIC_API_KEY and Bearer token via Authorization header

nvm use 20
npm start

# Test with real APIs
node tests/e2e/manual-test.js
```

## Project Structure

```
/
├── functions/              # Azure Functions implementation
│   ├── src/
│   │   ├── functions/      # HTTP endpoints (EditContent, GetContent, HealthCheck)
│   │   └── modules/        # Core logic (DaliveClient, LlmClient, PromptBuilder)
│   ├── tests/e2e/          # E2E tests with REAL APIs only
│   └── CLAUDE.md           # 📖 Detailed developer guide
├── specs/                  # Feature specs and planning docs
│   └── 001-let-s-build/    # Current implementation spec
└── ai-docs/                # Implementation insights
    ├── REALITY-CHECK.md    # What we learned (plan vs reality)
    └── CHANGES.md          # Migration guide and changelog
```

## Key Learnings

### 1. HTML-First Architecture
**Discovery**: da.live API returns HTML strings, not JSON blocks
**Decision**: Work directly with HTML
**Impact**: Simpler architecture that matches reality

### 2. Multipart Form Required
**Discovery**: da.live POST requires `multipart/form-data` with `data` file field
**Implementation**: Uses `form-data` package
**Critical**: Raw HTML POST doesn't save content

### 3. Real Tests Only
**Decision**: Deleted all mocks/stubs, kept E2E tests with real APIs
**Reasoning**: Only real API tests caught actual issues
**Result**: Simpler, faster, more reliable testing

### 4. Trust the LLM
**Decision**: No validation phase needed
**Reasoning**: Claude consistently returns valid HTML
**Impact**: Removed ResponseValidator module, system works better

## Documentation Map

- **`/functions/CLAUDE.md`** - Complete developer guide (setup, API docs, architecture, troubleshooting)
- **`/specs/001-let-s-build/spec-UPDATED.md`** - What we actually built vs what we planned
- **`/ai-docs/REALITY-CHECK.md`** - Lessons learned, plan vs reality comparison
- **`/ai-docs/CHANGES.md`** - Changelog and migration guide

## What We Built

### API Endpoints
- **POST /api/EditContent** - AI-assisted content editing
- **GET /api/GetContent/{*path}** - Fetch page content from da.live
- **GET /api/HealthCheck** - Service status

### Core Workflow (4 phases)
1. **Fetch**: GET HTML from da.live Admin API
2. **Edit**: Claude generates edited HTML
3. **Save**: POST via multipart form to da.live
4. **Respond**: Return explanation + reasoning + timing

### Technologies
- Azure Functions v4 (Node 20)
- Anthropic Claude Sonnet 4
- da.live Admin API
- ES Modules (`type: "module"`)

## What We Removed

- ❌ Block-based architecture (da.live uses HTML)
- ❌ ResponseValidator module (complexity without value)
- ❌ Unit tests (mocking doesn't test reality)
- ❌ Integration tests (fake APIs don't validate)
- ❌ Contract tests (APIs change, mocks lie)
- ❌ Validation phase (Claude returns valid HTML)

## Testing Philosophy

**Real tests only**: No mocks, no stubs. If it doesn't test actual behavior with real APIs, we deleted it.

```bash
# The only tests that matter
tests/e2e/manual-test.js    # Manual E2E test with real APIs
tests/e2e/real-api.test.js  # Automated E2E test with real APIs
```

## Performance

**Typical Request** (tested with real APIs):
- Total: ~14-15 seconds
- da.live fetch: 100-150ms (1%)
- LLM call: 13-14 seconds (95%)
- da.live update: 500-800ms (4%)

**Insight**: LLM call dominates everything. Optimize prompts for speed.

## Architecture Decisions

### Version 1 (Planned - Too Complex)
```
Client → API → Validator → Block Parser → LLM → Response Validator → Block Builder → da.live
              ↓                                    ↓
        Unit Tests                          Contract Tests
```

### Version 2 (Actual - Simple & Works)
```
Client → API → da.live (GET HTML) → Claude → da.live (POST multipart) → Client
                                                        ↓
                                              E2E Test (real APIs)
```

## Common Issues

### Node Version Error
```
Error: Incompatible Node.js version
```
**Fix**: `nvm use 20 && npm start`

### Content Not Saving
**Cause**: Not using multipart form data
**Status**: Already fixed in DaliveClient.js

### Function Timeout
**Cause**: LLM calls take 10-15 seconds
**Fix**: Already set to 30s in host.json

## Success Metrics

✅ E2E tests pass with real APIs
✅ Content actually saves to da.live
✅ Response includes explanation + reasoning
✅ Multipart form POST works
✅ Codebase is simpler (7 modules vs 12 planned)
✅ Tests are faster (no mocking overhead)
✅ Easy to understand and debug

## Next Steps

1. Add more E2E test scenarios
2. Optimize LLM prompts for speed
3. Add request queuing for concurrent requests
4. Monitor production errors

## Get Started

For detailed setup instructions, API documentation, and troubleshooting:

👉 **See `/functions/CLAUDE.md`** - Complete developer guide
