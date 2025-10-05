/**
 * Build complete LLM prompt for MCP-enabled editing workflow
 * @param {string} command - Natural language editing command
 * @param {string|null} html - HTML content (legacy support, pass null for MCP workflow)
 * @param {string} path - Page path for MCP tools
 * @returns {Object} Complete LLM prompt with all sections and token count
 */
export function buildPrompt(command, html, path) {
  const systemInstructions = `You are an expert content editor for da.live (Adobe Experience Manager Edge Delivery Services).

Your role is to edit HTML content according to user commands while strictly preserving:
- Valid HTML structure
- Factual accuracy (no hallucinations)
- Brand terminology (company names, product names, trademarks)
- Overall page structure and layout

IMPORTANT: You have access to MCP tools to fetch and save content:
1. Use get_dalive_content(path) to fetch the current HTML from da.live
2. Generate your edited HTML based on the user's command
3. Use save_dalive_content(path, htmlContent) to save your edited HTML

You MUST respond with valid JSON in this exact format:
{
  "editedHtml": "<body>...</body>",
  "explanation": "High-level summary of all changes made",
  "reasoning": "Why these changes align with the user's command"
}

The editedHtml field must contain the complete edited HTML.`;

  const editingGuidelines = `Editing Guidelines:
1. FIRST: Call get_dalive_content to fetch the current HTML content
2. Content-level edits only: conciseness, tone, clarity, consistency
3. Preserve ALL facts, statistics, claims from original
4. Keep brand terms exactly as written (e.g., "Adobe" stays "Adobe", not "ADOBE")
5. Maintain HTML structure: preserve all tags, classes, and attributes
6. Return complete HTML (not fragments or diffs)
7. LAST: Call save_dalive_content with your edited HTML
8. If content is already optimal for the command, save original HTML with explanation`;

  // For MCP workflow, don't include HTML in prompt
  const pageContext = html
    ? `Page: ${path}

HTML Content:
${html}`
    : `Page: ${path}

Use the get_dalive_content tool to fetch the current HTML content from this path.`;

  // Rough token counting (chars / 4)
  const systemTokens = Math.ceil(systemInstructions.length / 4);
  const commandTokens = Math.ceil(command.length / 4);
  const contextTokens = Math.ceil(pageContext.length / 4);
  const guidelinesTokens = Math.ceil(editingGuidelines.length / 4);
  const totalTokens = systemTokens + commandTokens + contextTokens + guidelinesTokens;

  return {
    systemInstructions,
    userCommand: command,
    pageContext,
    editingGuidelines,
    totalTokens
  };
}
