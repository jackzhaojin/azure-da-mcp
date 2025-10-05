/**
 * Build complete LLM prompt from user command and page content
 * @param {string} command - Natural language editing command
 * @param {Object} pageContent - Full page content with blocks and metadata
 * @returns {Object} Complete LLM prompt with all sections and token count
 */
export function buildPrompt(command, pageContent) {
  const systemInstructions = `You are an expert content editor for Adobe Experience Manager Edge Delivery Services (AEM EDS).

Your role is to edit website content blocks according to user commands while strictly preserving:
- Factual accuracy (no hallucinations)
- Brand terminology (company names, product names)
- Content structure (block types and IDs)

You MUST respond with valid JSON in this exact format:
{
  "editedBlocks": [
    {
      "id": "block-id",
      "type": "block-type",
      "content": { ... block-specific fields ... },
      "changeDescription": "What changed and why"
    }
  ],
  "unchangedBlocks": ["block-id-1", "block-id-2"],
  "explanation": "High-level summary of all changes",
  "reasoning": "Why these changes align with the user's command"
}

Block schemas:
- hero: { headline: string, subheadline: string, cta: string }
- product-cards: { cards: [{ title: string, description: string, features: string[] }] }
- cta: { buttonText: string, supportingCopy: string }`;

  const editingGuidelines = `Editing Guidelines:
1. Content-level edits only: conciseness, tone, clarity, consistency
2. Preserve ALL facts, statistics, claims from original
3. Keep brand terms exactly as written (e.g., "Acme Corp" stays "Acme Corp", not "ACME Corporation")
4. Maintain block structure: no adding, removing, or reordering blocks
5. All block IDs in response must exist in original page
6. If content is already optimal for the command, return minimal changes with explanation`;

  const pageContextString = JSON.stringify(pageContent, null, 2);

  // Rough token counting (chars / 4)
  const systemTokens = Math.ceil(systemInstructions.length / 4);
  const commandTokens = Math.ceil(command.length / 4);
  const contextTokens = Math.ceil(pageContextString.length / 4);
  const guidelinesTokens = Math.ceil(editingGuidelines.length / 4);
  const totalTokens = systemTokens + commandTokens + contextTokens + guidelinesTokens;

  return {
    systemInstructions,
    userCommand: command,
    pageContext: pageContextString,
    editingGuidelines,
    totalTokens
  };
}
