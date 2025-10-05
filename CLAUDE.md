# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Azure Functions backend for AI-assisted da.live content editing. Integrates da.live Admin API with Anthropic Claude for intelligent content editing operations.

**Key Technologies:**
- Azure Functions v4 (Node.js programming model V4)
- ES Modules (`type: "module"`)
- Anthropic Claude Sonnet 4
- da.live Admin API

## Development Setup

**Node Version Requirements:**
- **Production/Runtime:** Node 20 (`.nvmrc` specifies `20`)
- **Azure Functions v4 compatibility:** Node 18 or 20 only (Node 24+ NOT supported)
- Use `nvm use 20` before starting the server

**Install & Start:**
```bash
cd functions
npm install
npm start  # Starts on http://localhost:7071
```

**Environment Configuration:**
Edit `functions/local.settings.json`:
```json
{
  "Values": {
    "DALIVE_API_URL": "https://admin.da.live",
    "ANTHROPIC_API_KEY": "sk-ant-api03-...",
    "LOG_LEVEL": "debug"
  }
}
```

**CRITICAL:** `DALIVE_API_URL` must NOT include `/api` suffix (the code adds it).

## Testing Commands

```bash
# All tests
npm test

# Watch mode
npm test:watch

# Coverage report
npm test:coverage

# Single test file
NODE_OPTIONS=--experimental-vm-modules jest tests/unit/DaliveClient.test.js

# Linting
npm run lint
npm run lint:fix
```

**Test Requirements:**
- All tests require `NODE_OPTIONS=--experimental-vm-modules` (ES modules + Jest)
- Coverage thresholds: 80%+ for `src/modules/`, 50%+ globally
- Test categories: unit, integration, contract, e2e

## Architecture

### Request Flow (EditContent)

```
HTTP Request → EditContentFunction.js
  ↓
1. Extract Bearer token from Authorization header
2. DaliveClient.getContent(path, token) → fetch HTML from da.live
3. PromptBuilder.buildPrompt(html, command) → construct LLM prompt
4. LlmClient.generateEdit(prompt) → call Anthropic API
5. ResponseValidator.validate(response) → 5-step validation
6. Merge edited + unchanged blocks
7. DaliveClient.updateContent(path, blocks, token) → POST to da.live
8. Return JSON with timing metrics
```

### Core Modules (`src/modules/`)

**DaliveClient.js** - da.live Admin API integration
- `getContent(path, token)` - GET `/api${path}` returns `{ path, html, blocks, metadata }`
- `updateContent(path, blocks, token)` - POST `/api${path}` with retry logic (3 attempts, exponential backoff)
- **Important:** da.live returns HTML strings, not JSON objects with blocks

**LlmClient.js** - Anthropic Claude API integration
- `generateEdit(prompt, metadata)` - Calls Anthropic with retry logic
- Uses `@anthropic-ai/sdk` package
- Requires `ANTHROPIC_API_KEY` env var

**PromptBuilder.js** - Constructs prompts
- Combines system instructions + user command + page content
- Returns structured prompt for LLM

**ResponseValidator.js** - Multi-layer validation
- Structure validation (required fields)
- ID validation (block IDs match original)
- Schema validation (block structure)
- Hallucination detection
- Brand terms preservation

**Logger.js** - Request correlation and metrics
- `generateRequestId()` - Unique correlation IDs
- `logPhase(phase, duration)` - Phase timing tracking

### Functions (`src/functions/`)

**Entry Point:** `src/functions/index.js` exports all functions for Azure Functions v4 programming model.

**GetContentFunction.js** - `GET /api/GetContent/{*path}`
- Wildcard route `{*path}` captures full paths with slashes and dots
- Path validation: `/^[a-z0-9\-\/\.]+$/` (allows lowercase, numbers, hyphens, slashes, dots)
- Returns `{ path, blocks, metadata, timestamp, duration }`

**EditContentFunction.js** - `POST /api/EditContent`
- Body: `{ command, path, metadata? }`
- Path validation same as GetContent
- Full orchestration flow with timing metrics

**HealthCheckFunction.js** - `GET /api/HealthCheck`
- Runtime health verification
- Returns `{ status, version, timestamp, dependencies }`

## Common Gotchas

**1. da.live API Endpoint Construction**
- `DALIVE_API_URL` is `https://admin.da.live` (no `/api` suffix)
- Code constructs: `${DALIVE_API_URL}/api${path}`
- Example: `https://admin.da.live/api/source/user/project/page.html`

**2. da.live Response Format**
- da.live Admin API returns HTML **strings**, not JSON objects
- `Content-Type: application/json` but body is HTML string
- DaliveClient wraps HTML: `{ path, html: "<body>...</body>", blocks: [], metadata: {} }`

**3. Node Version Compatibility**
- Azure Functions v4 requires Node 18 or 20
- Node 24+ will fail with "Incompatible Node.js version" error
- Always use `nvm use 20` before starting server

**4. Path Validation**
- Paths must include dots for filenames: `/source/.../page.html`
- Regex must include `\.`: `/^[a-z0-9\-\/\.]+$/`
- Both GetContentFunction and EditContentFunction have path validation

**5. ES Modules + Jest**
- All tests require `NODE_OPTIONS=--experimental-vm-modules`
- Package.json has `"type": "module"`
- Use `import`/`export`, not `require`/`module.exports`

**6. Azure Functions Entry Point**
- `src/functions/index.js` must export all functions
- Each function uses `app.http()` from `@azure/functions`
- Programming model V4 (not V3)

## E2E Testing

**Test File:** `tests/e2e/manual-test.js`

**Requirements:**
- Create `.env` file in `functions/` directory (gitignored)
- Get Bearer token from browser DevTools → Network → Authorization header
- Add to `.env`:
  ```bash
  DALIVE_BEARER_TOKEN=eyJhbGci...
  E2E_TEST_PATH=/source/user/project/page.html
  E2E_TEST_COMMAND=Make the hero section more concise
  ```

**Run E2E Test:**
```bash
# Start server in one terminal
npm start

# Run test in another terminal
node tests/e2e/manual-test.js
```

## Error Handling

HTTP status codes follow standard conventions:
- `400` - Invalid request format or path
- `401` - Missing/invalid Bearer token
- `404` - Page path not found in da.live
- `422` - Validation failed (hallucination, schema, etc.)
- `502` - LLM API unavailable (after retries)
- `503` - da.live API unavailable (after retries)

All errors include:
```json
{
  "requestId": "abc-123",
  "error": "Short description",
  "details": "Detailed error message"
}
```

## TDD Workflow

This project follows strict TDD:
1. **Red** - Write failing test first
2. **Green** - Implement minimal code to pass
3. **Refactor** - Clean up while tests pass

When adding features:
- Write unit tests in `tests/unit/` first
- Implement module functionality
- Add integration tests in `tests/integration/`
- Verify coverage meets thresholds (80%+ for modules)

## File Cleanup

**Never commit temporary test files to the root:**
- ❌ `functions/*.test.js` (debugging scripts)
- ❌ `functions/check-*.js` (temp validation)
- ✅ `functions/tests/**/*.test.js` (proper test structure)

Delete any debugging scripts created in `functions/` root after use.
