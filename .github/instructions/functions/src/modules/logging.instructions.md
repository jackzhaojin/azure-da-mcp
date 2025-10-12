# Logging Instructions

## Structured Logging Pattern

**Always use structured logging** with context objects.

### Basic Usage

```javascript
import * as Logger from '../Logger.js';

// Info logging with context
Logger.info('Operation started', {
    operation: 'editContent',
    path: '/source/owner/site/page.html',
    commandLength: command.length
});

// Error logging with details
Logger.error('Operation failed', {
    operation: 'editContent',
    error: error.message,
    status: error.status,
    duration: Date.now() - startTime
});

// Debug logging for development
Logger.debug('Request details', {
    headers: request.headers,
    bodyLength: JSON.stringify(body).length
});
```

### Timing Pattern

```javascript
const startTime = Date.now();

// Operation here

Logger.info('Operation completed', {
    operation: 'llmCall',
    duration: `${Date.now() - startTime}ms`,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens
});
```

### Error Context

```javascript
try {
    const result = await someOperation();
} catch (error) {
    Logger.error('Operation failed', {
        operation: 'operationName',
        error: error.message,
        stack: error.stack,
        context: {
            userId: request.userId,
            path: request.path
        }
    });
    throw error;
}
```

## Log Levels

- `Logger.debug()` - Development debugging, verbose details
- `Logger.info()` - Normal operations, request flow
- `Logger.error()` - Errors and exceptions

## Request Tracking

### Request Start/End Pattern

```javascript
app.http('FunctionName', {
    handler: async (request, context) => {
        const startTime = Date.now();
        const requestId = randomUUID();

        Logger.info('Request started', {
            requestId,
            method: request.method,
            url: request.url,
            userAgent: request.headers.get('user-agent')
        });

        try {
            const result = await processRequest(request);
            
            Logger.info('Request completed', {
                requestId,
                status: 200,
                duration: `${Date.now() - startTime}ms`,
                responseSize: JSON.stringify(result).length
            });

            return { status: 200, jsonBody: result };
        } catch (error) {
            Logger.error('Request failed', {
                requestId,
                error: error.message,
                duration: `${Date.now() - startTime}ms`
            });
            throw error;
        }
    }
});
```

## LLM-Specific Logging

### Token Usage Tracking

```javascript
Logger.info('LLM call completed', {
    provider: 'claude',
    model: 'claude-sonnet-4-5-20250929',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    duration: `${Date.now() - startTime}ms`,
    requestCost: calculateCost(response.usage)
});
```

### Tool Call Logging

```javascript
Logger.info('MCP tool call', {
    toolName: 'get_dalive_content',
    parameters: JSON.stringify(toolInput),
    sessionId: mcpSession.sessionId
});

// After tool execution
Logger.info('MCP tool completed', {
    toolName: 'get_dalive_content',
    status: 'success',
    duration: `${Date.now() - toolStartTime}ms`,
    resultSize: JSON.stringify(toolResult).length
});
```

## API Integration Logging

### da.live API Calls

```javascript
Logger.debug('da.live API call', {
    method: 'GET',
    url: `${DALIVE_API_URL}${path}`,
    hasAuth: !!bearerToken
});

Logger.info('da.live API response', {
    method: 'GET',
    status: response.status,
    contentLength: response.data.length,
    duration: `${Date.now() - startTime}ms`
});
```

## Response Parsing Logging

### JSON Parsing

```javascript
Logger.debug('Parsing LLM response', {
    responseLength: responseText.length,
    startsWithJson: responseText.trim().startsWith('{'),
    hasMarkdown: responseText.includes('```')
});

// After cleaning
Logger.info('Response cleaned for parsing', {
    originalLength: responseText.length,
    cleanedLength: cleanedText.length,
    hadMarkdown: cleanedText !== responseText.trim()
});

// After parsing
try {
    const parsed = JSON.parse(cleanedText);
    Logger.info('Response parsed successfully', {
        parsedKeys: Object.keys(parsed),
        editedHtmlLength: parsed.editedHtml?.length
    });
} catch (parseError) {
    Logger.error('Failed to parse response', {
        parseError: parseError.message,
        responsePreview: cleanedText.substring(0, 200)
    });
}
```

## Environment-Aware Logging

```javascript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Only log debug in development
if (LOG_LEVEL === 'debug') {
    Logger.debug('Detailed request info', {
        fullHeaders: request.headers,
        fullBody: body
    });
}
```

## Security Considerations

### Never Log Sensitive Data

```javascript
// ❌ Don't log sensitive information
Logger.info('Auth details', {
    bearerToken: token,  // Don't log tokens
    apiKey: apiKey       // Don't log API keys
});

// ✅ Log safely
Logger.info('Auth status', {
    hasToken: !!token,
    tokenLength: token?.length,
    hasApiKey: !!apiKey
});
```

### Safe Error Logging

```javascript
Logger.error('Authentication failed', {
    error: error.message,           // Safe - error message
    status: error.status,          // Safe - HTTP status
    // Don't log: error.config.headers (may contain tokens)
    hasAuthHeader: !!error.config?.headers?.Authorization
});
```

## Performance Logging

### Operation Breakdown

```javascript
const timings = {
    fetch: 0,
    llm: 0,
    save: 0
};

const fetchStart = Date.now();
const content = await daliveClient.getContent(path, token);
timings.fetch = Date.now() - fetchStart;

const llmStart = Date.now();
const result = await llmClient.generate(prompt);
timings.llm = Date.now() - llmStart;

const saveStart = Date.now();
await daliveClient.updateContent(path, result.editedHtml, token);
timings.save = Date.now() - saveStart;

Logger.info('Request timing breakdown', {
    total: Object.values(timings).reduce((a, b) => a + b, 0),
    breakdown: timings,
    percentages: {
        fetch: Math.round((timings.fetch / total) * 100),
        llm: Math.round((timings.llm / total) * 100),
        save: Math.round((timings.save / total) * 100)
    }
});
```