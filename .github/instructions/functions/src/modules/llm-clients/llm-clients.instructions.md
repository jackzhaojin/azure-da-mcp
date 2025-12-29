---
applyTo: "functions/src/modules/llm-clients/**/*.js"
---

# LLM Clients Instructions

## Architecture Pattern

**Multi-Provider Support**: Each LLM provider has its own client implementation.

### Client Structure

```javascript
// Provider-specific client (e.g., ClaudeClient.js)
export async function generateWithClaude(prompt, mcpConfig = null, model = null) {
    // 1. Initialize MCP session if config provided
    // 2. Set up tools for Anthropic API
    // 3. Multi-turn conversation loop for tool calling
    // 4. Return structured response
}
```

### MCP Integration Required

**Always include MCP support** in LLM clients:

```javascript
// Initialize MCP session
let mcpSession = null;
if (mcpConfig && mcpConfig.serverUrl) {
    mcpSession = await initializeMcpSession(mcpConfig.serverUrl, mcpConfig.bearerToken);
}

// Define tools for LLM API
const tools = mcpSession ? [
    {
        name: 'get_dalive_content',
        description: 'Fetch HTML content from da.live',
        input_schema: { /* schema */ }
    },
    {
        name: 'save_dalive_content', 
        description: 'Save edited HTML content to da.live',
        input_schema: { /* schema */ }
    }
] : [];
```

### Tool Calling Loop Pattern

```javascript
// Multi-turn conversation for tool use
let iterationCount = 0;
while (iterationCount < MAX_TOOL_ITERATIONS) {
    iterationCount++;
    
    const response = await client.messages.create({
        model,
        tools,
        messages
    });
    
    // Check for tool use
    const toolUseBlock = response.content.find(block => block.type === 'tool_use');
    
    if (toolUseBlock && mcpSession) {
        // Execute tool via MCP
        const toolResult = await callMcpTool(mcpSession, toolName, toolInput);
        
        // Add to conversation and continue
        messages.push(/* assistant message */);
        messages.push(/* tool result */);
        continue;
    }
    
    // Final response - parse and return
    break;
}
```

## Response Format

**Standardized response structure** across all providers:

```javascript
return {
    editedHtml: llmResponse.editedHtml || '',
    explanation: llmResponse.explanation || '',
    reasoning: llmResponse.reasoning || '',
    tokenUsage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens
    },
    mcpToolCalls: mcpToolCalls.length > 0 ? mcpToolCalls : undefined
};
```

## Error Handling

### Provider-Specific Errors
```javascript
try {
    const response = await providerClient.generate(params);
} catch (error) {
    // Provider-specific error handling
    if (error.status === 429) {
        // Rate limiting - retry with backoff
    } else if (error.status >= 500) {
        // Server error - retry once
    } else {
        // Client error - don't retry
    }
    throw error;
}
```

### JSON Response Parsing
```javascript
// Handle LLM responses that may include markdown formatting
let cleanedResponseText = responseText.trim();

// Remove ```json and ``` wrapper if present
if (cleanedResponseText.startsWith('```json')) {
    cleanedResponseText = cleanedResponseText.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
} else if (cleanedResponseText.startsWith('```')) {
    cleanedResponseText = cleanedResponseText.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
}

try {
    const llmResponse = JSON.parse(cleanedResponseText);
} catch (parseError) {
    Logger.error('Failed to parse LLM response as JSON', {
        parseError: parseError.message,
        originalResponse: responseText.substring(0, 300),
        cleanedResponse: cleanedResponseText.substring(0, 300)
    });
    throw new Error(`LLM returned invalid JSON: ${parseError.message}`);
}
```

## Provider-Specific Patterns

### Claude (Anthropic)
```javascript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: REQUEST_TIMEOUT_MS
});

// Use claude-sonnet-4-5-20250929 model by default
const claudeModel = model || process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';
```

### Gemini (Google)
```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
```

### Azure OpenAI
```javascript
import { AzureOpenAI } from 'openai';

const client = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: '2024-02-01'
});
```

## Constants

```javascript
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.3;
const MAX_RETRIES = 1; // Set to 1 for debugging, 3 for production
const INITIAL_BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 120000; // 120 seconds
const MAX_TOOL_ITERATIONS = 10; // Prevent infinite tool calling loops
```