# Prompt Builder Instructions

## Prompt Construction Pattern

**MCP-Aware Prompts**: Always include tool descriptions and context for autonomous tool calling.

### System Instructions Structure

```javascript
export function buildPrompt(command, pageContext = '') {
    return {
        systemInstructions: `You are an expert content editor for da.live pages. You have access to tools to fetch and save content autonomously.

IMPORTANT: You MUST use the get_dalive_content tool first to fetch the current HTML before making any edits.

After editing, you MUST use the save_dalive_content tool to save your changes.

Content Editing Guidelines:
- Preserve factual information and brand terms exactly
- Maintain HTML structure and formatting
- Focus on content-level changes (text, messaging, structure)
- Do not modify technical elements (scripts, meta tags, tracking codes)
- Return complete edited HTML, not partial changes or diffs

Response Format:
After using tools to fetch, edit, and save content, provide a summary in this JSON format:
{
    "editedHtml": "complete edited HTML content",
    "explanation": "Clear description of changes made",
    "reasoning": "Why these changes improve the content"
}`,
        userCommand: command,
        pageContext: pageContext || 'No additional context provided.',
        editingGuidelines: `
Tool Usage:
1. Use get_dalive_content(path) to fetch current HTML
2. Edit the HTML according to the command
3. Use save_dalive_content(path, editedHtml) to save changes
4. Provide explanation and reasoning in JSON response

Content Standards:
- Keep existing brand voice and terminology
- Ensure accessibility standards are maintained
- Preserve all functional elements (links, forms, navigation)
- Maintain responsive design considerations`
    };
}
```

### Context Enhancement

```javascript
export function addPageContext(basePrompt, additionalContext) {
    return {
        ...basePrompt,
        pageContext: `${basePrompt.pageContext}

Additional Context:
${additionalContext}`
    };
}
```

### Tool Instruction Patterns

**For MCP Integration:**
```javascript
const TOOL_INSTRUCTIONS = `
Available Tools:
- get_dalive_content(path): Fetch HTML content from da.live
- save_dalive_content(path, htmlContent): Save edited HTML to da.live

Workflow:
1. First call get_dalive_content to understand current content
2. Generate your edited version based on the command
3. Call save_dalive_content with the complete edited HTML
4. Provide explanation and reasoning in your final response
`;
```

### Command Processing

```javascript
export function processCommand(rawCommand) {
    // Normalize and enhance commands
    const command = rawCommand.trim();
    
    // Add context hints for common commands
    if (command.toLowerCase().includes('concise')) {
        return `${command}. Focus on reducing wordiness while preserving key information and calls-to-action.`;
    }
    
    if (command.toLowerCase().includes('heading') || command.toLowerCase().includes('title')) {
        return `${command}. Ensure headings maintain proper hierarchy (h1, h2, h3) and SEO best practices.`;
    }
    
    return command;
}
```

### Response Format Guidance

```javascript
const RESPONSE_FORMAT = `
Your final response must be valid JSON with exactly these fields:
{
    "editedHtml": "complete HTML content (not a diff or partial)",
    "explanation": "clear description of what you changed",
    "reasoning": "why these changes improve the content"
}

Important:
- editedHtml must contain the complete, valid HTML document
- explanation should be user-friendly and specific
- reasoning should justify the changes from a content strategy perspective
`;
```

### Provider-Specific Adaptations

**For Claude (Anthropic):**
```javascript
export function buildClaudePrompt(command, pageContext) {
    const basePrompt = buildPrompt(command, pageContext);
    
    // Claude-specific enhancements
    return {
        ...basePrompt,
        systemInstructions: `${basePrompt.systemInstructions}

Claude-specific notes:
- Use your tool calling capabilities to fetch and save content autonomously
- Think step-by-step through the editing process
- Be precise with HTML structure and content changes`
    };
}
```

**For Gemini:**
```javascript
export function buildGeminiPrompt(command, pageContext) {
    const basePrompt = buildPrompt(command, pageContext);
    
    // Gemini-specific adaptations
    return {
        ...basePrompt,
        systemInstructions: `${basePrompt.systemInstructions}

Gemini-specific notes:
- Use function calling to interact with da.live content
- Focus on natural language understanding of the edit command
- Maintain factual accuracy in all content changes`
    };
}
```

## Content Preservation Rules

### Brand Terms Protection
```javascript
const BRAND_PROTECTION = `
CRITICAL: Preserve these elements exactly:
- Company names and product names
- Trademarked terms and brand terminology
- Contact information and legal disclaimers
- Technical specifications and data
- Pricing and financial information
- Regulatory compliance language
`;
```

### HTML Structure Preservation
```javascript
const HTML_STRUCTURE = `
Preserve these HTML elements:
- Document structure (DOCTYPE, html, head, body)
- Meta tags and SEO elements
- Script tags and tracking codes
- CSS classes and IDs (important for styling)
- Form elements and their functionality
- Navigation structure and links
`;
```

## Validation Instructions

### Content Quality Checks
```javascript
const QUALITY_CHECKS = `
Before finalizing edits, verify:
1. All links still work and point to correct destinations
2. Images have proper alt text and accessibility
3. Headings maintain logical hierarchy
4. Content flows naturally and makes sense
5. No grammar or spelling errors introduced
6. Brand voice and tone remain consistent
`;
```

### Technical Validation
```javascript
const TECHNICAL_VALIDATION = `
Ensure technical correctness:
1. HTML is valid and well-formed
2. No broken tags or unclosed elements
3. CSS classes and IDs are preserved
4. JavaScript and tracking codes untouched
5. Meta tags and SEO elements intact
6. Mobile responsiveness maintained
`;
```

## Error Prevention

### Common Pitfalls to Avoid
```javascript
const ERROR_PREVENTION = `
Avoid these common mistakes:
- Don't return partial HTML or diffs
- Don't modify script tags or tracking codes
- Don't change URLs without explicit instruction
- Don't remove important structural elements
- Don't introduce formatting inconsistencies
- Don't change brand-specific terminology
`;
```

### Fallback Instructions
```javascript
const FALLBACK_GUIDANCE = `
If you encounter issues:
1. If content seems incomplete, fetch it again with get_dalive_content
2. If unsure about changes, make minimal conservative edits
3. If HTML structure is complex, focus only on text content
4. If brand terms are unclear, preserve them exactly as found
5. If in doubt, explain what you cannot do rather than guess
`;
```