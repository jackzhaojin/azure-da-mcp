---
applyTo: "functions/tests/**/*.js"
---

# Testing Instructions

## Testing Philosophy

**Real Tests Only**: No mocks, no stubs. Only test with real APIs.

### Why No Mocks

- Mocks don't catch real API changes
- Stubs don't validate actual behavior  
- Contract tests get out of sync
- Real E2E tests found all the actual issues

## Test Types

### 1. Ad-hoc Tests (`tests/adhoc/`)

**Purpose**: Quick module verification without test harness
**Pattern**: Standalone Node.js scripts

```javascript
// tests/adhoc/test-module.js
import { someFunction } from '../../src/modules/SomeModule.js';

console.log('Testing someFunction...');
const result = someFunction('test input');
console.log('Result:', result);
console.log('✅ Test passed');
```

**Run**: `node tests/adhoc/test-module.js`

### 2. E2E Tests (`tests/e2e/`)

**Purpose**: Full workflow testing with real APIs
**Framework**: Jest
**Pattern**: Real API calls, real Azure Functions

```javascript
// tests/e2e/feature.test.js
import { beforeAll, afterAll, test, expect } from '@jest/globals';

test('EditContent modifies real da.live page', async () => {
    const token = process.env.DALIVE_BEARER_TOKEN;
    
    const response = await fetch('http://localhost:7071/api/EditContent', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            command: 'Add a test timestamp',
            path: '/source/test/page.html'
        })
    });
    
    expect(response.ok).toBe(true);
    const result = await response.json();
    expect(result.explanation).toContain('timestamp');
});
```

## Required Environment Variables

```bash
# Required for E2E tests
DALIVE_BEARER_TOKEN=your_real_token
ANTHROPIC_API_KEY=your_real_key

# Optional
DALIVE_API_URL=https://admin.da.live  # default
```

## Test Data Management

### Use Real Test Paths
```javascript
// Good: Use dedicated test paths
const testPath = '/source/test/integration/test-page.html';

// Bad: Don't test on production content
const prodPath = '/source/mycompany/homepage/index.html';
```

### Test Cleanup Pattern
```javascript
test('modify content and verify', async () => {
    const originalContent = await daliveClient.getContent(testPath, token);
    
    try {
        // Perform test operations
        await daliveClient.updateContent(testPath, modifiedContent, token);
        
        // Verify results
        const updatedContent = await daliveClient.getContent(testPath, token);
        expect(updatedContent).toContain('expected change');
        
    } finally {
        // Always restore original content
        await daliveClient.updateContent(testPath, originalContent, token);
    }
});
```

## Test Structure

### E2E Test Organization
```
tests/e2e/
├── api-endpoints.test.js      # Test all API endpoints
├── llm-integration.test.js    # Test LLM provider integration
├── mcp-workflow.test.js       # Test MCP tool calling
├── dalive-api.test.js         # Test da.live API integration
└── error-handling.test.js     # Test error scenarios
```

### Test Naming Convention
- File: `feature-name.test.js`
- Test: `'should do something when condition'`

## Test Execution

### Run Individual Tests
```bash
# Ad-hoc tests
node tests/adhoc/test-prompt-builder.js

# Individual E2E test
npm test -- tests/e2e/api-endpoints.test.js

# Specific test case
npm test -- --testNamePattern="EditContent"
```

### Run All Tests
```bash
npm test                    # All E2E tests
npm run test:adhoc         # All ad-hoc tests (if script exists)
```

## Performance Testing

### Timing Assertions
```javascript
test('API response time within limits', async () => {
    const startTime = Date.now();
    
    const response = await fetch(apiUrl, options);
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(60000); // 60 second max
    
    const result = await response.json();
    expect(result.timing.total).toBeDefined();
});
```

## Error Testing

### Test Real Error Scenarios
```javascript
test('handles invalid Bearer token', async () => {
    const response = await fetch(apiUrl, {
        headers: { 'Authorization': 'Bearer invalid-token' }
    });
    
    expect(response.status).toBe(401);
    const result = await response.json();
    expect(result.error).toContain('token');
});

test('handles malformed request', async () => {
    const response = await fetch(apiUrl, {
        method: 'POST',
        body: 'invalid json'
    });
    
    expect(response.status).toBe(400);
});
```

## Integration Test Patterns

### Azure Functions Testing
```javascript
// Test requires running server: npm start
beforeAll(async () => {
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
});

test('function endpoint responds', async () => {
    const response = await fetch('http://localhost:7071/api/HealthCheck');
    expect(response.ok).toBe(true);
});
```

### MCP Protocol Testing
```javascript
test('MCP session lifecycle', async () => {
    // Test initialize
    const initResponse = await axios.post(mcpUrl, {
        jsonrpc: '2.0',
        method: 'initialize',
        params: { protocolVersion: '2025-03-26' },
        id: 'test-1'
    });
    
    expect(initResponse.data.result).toBeDefined();
    
    // Test tools/list
    const toolsResponse = await axios.post(mcpUrl, {
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 'test-2'
    });
    
    expect(toolsResponse.data.result.tools).toHaveLength(2);
});
```

## What Not To Test

- ❌ Mocked LLM responses
- ❌ Stubbed API calls  
- ❌ Unit tests in isolation
- ❌ Contract tests
- ❌ Validation logic without real data

## What To Test

- ✅ Real API endpoints
- ✅ Real LLM responses
- ✅ Real da.live integration
- ✅ Error handling with real errors
- ✅ Performance with real operations
- ✅ End-to-end workflows