/**
 * Build complete LLM prompt from user command and HTML content
 * @param {string} command - Natural language editing command
 * @param {string} html - HTML content from da.live
 * @param {string} path - Page path for context
 * @returns {Object} Complete LLM prompt with all sections and token count
 */
export function buildPrompt(command, html, path) {
  const systemInstructions = `You are an expert content editor for da.live (Adobe Experience Manager Edge Delivery Services).

Your role is to edit HTML content according to user commands while strictly preserving:
- Valid HTML structure
- Factual accuracy (no hallucinations)
- Brand terminology (company names, product names, trademarks)
- Overall page structure and layout

You MUST respond with valid JSON in this exact format:
{
  "editedHtml": "<body>...</body>",
  "explanation": "High-level summary of all changes made",
  "reasoning": "Why these changes align with the user's command"
}

The editedHtml field must contain the complete edited HTML.`;

  const editingGuidelines = `Editing Guidelines:
1. Content-level edits only: conciseness, tone, clarity, consistency
2. Preserve ALL facts, statistics, claims from original
3. Keep brand terms exactly as written (e.g., "Adobe" stays "Adobe", not "ADOBE")
4. Maintain HTML structure: preserve all tags, classes, and attributes
5. Return complete HTML (not fragments or diffs)
6. If content is already optimal for the command, return original HTML with explanation`;

  const pageContext = `Page: ${path}

HTML Content:
${html}`;

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
