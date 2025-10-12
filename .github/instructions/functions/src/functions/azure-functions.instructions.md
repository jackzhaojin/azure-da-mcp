# Azure Functions Instructions

## V4 Pattern Requirements

**Always use Azure Functions V4 programming model:**

```javascript
import { app } from '@azure/functions';

app.http('FunctionName', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'FunctionName',
    handler: async (request, context) => {
        return { status: 200, jsonBody: { result: 'success' } };
    }
});
```

**Never suggest V3 pattern** (module.exports functions).

## Function Categories

### Business Logic Functions
- `EditContentFunction.js` - Main content editing endpoint
- Provider-agnostic, uses any LLM client
- Handles MCP orchestration

### Infrastructure Functions
- `ClaudeLlmClientFunction.js` - Direct Claude API access
- `GeminiLlmClientFunction.js` - Direct Gemini API access (stubbed)
- `AzureAIFoundryLlmClientFunction.js` - Direct Azure OpenAI access (stubbed)
- Thin wrappers around LLM providers

### Support Functions
- `McpSessionFunction.js` - MCP server (JSON-RPC 2.0)
- `GetContentFunction.js` - da.live content fetching
- `HealthCheckFunction.js` - Service status

## Error Handling Pattern

```javascript
try {
    const result = await someOperation();
    return { status: 200, jsonBody: result };
} catch (error) {
    Logger.error('Operation failed', {
        operation: 'operationName',
        error: error.message,
        status: error.status
    });
    
    const statusCode = error.status === 429 ? 429 : 
                      error.status >= 500 ? 502 : 400;
    
    return {
        status: statusCode,
        jsonBody: { error: 'Operation failed', message: error.message }
    };
}
```

## Request/Response Patterns

### Standard Request Body Validation
```javascript
const body = await request.json();
if (!body.requiredField) {
    return {
        status: 400,
        jsonBody: { error: 'Missing required field: requiredField' }
    };
}
```

### Bearer Token Extraction
```javascript
const authHeader = request.headers.get('authorization');
const bearerToken = authHeader?.replace('Bearer ', '');
if (!bearerToken) {
    return {
        status: 401,
        jsonBody: { error: 'Authorization header required' }
    };
}
```

## Function Naming

- **Function names**: PascalCase (e.g., `EditContent`)
- **Route names**: Same as function name
- **File names**: FunctionName + `Function.js` (e.g., `EditContentFunction.js`)

## Dependencies

Always import these for Azure Functions:
```javascript
import { app } from '@azure/functions';
import * as Logger from '../modules/Logger.js';
```