import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.3;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Generate content edit using Anthropic Claude API
 * @param {Object} prompt - Complete LLM prompt with all sections
 * @returns {Promise<Object>} LLM response with edited blocks, explanation, reasoning, and token usage
 * @throws {Error} On API failure or timeout
 */
export async function generateEdit(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey === '<placeholder>') {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  const client = new Anthropic({
    apiKey,
    timeout: REQUEST_TIMEOUT_MS
  });

  const messages = [
    {
      role: 'user',
      content: `${prompt.systemInstructions}

Command: ${prompt.userCommand}

Page Context:
${prompt.pageContext}

Guidelines:
${prompt.editingGuidelines}`
    }
  ];

  let lastError;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        messages
      });

      // Parse the LLM response from the first content block
      const responseText = response.content[0].text;
      const llmResponse = JSON.parse(responseText);

      return {
        editedBlocks: llmResponse.editedBlocks || [],
        unchangedBlocks: llmResponse.unchangedBlocks || [],
        explanation: llmResponse.explanation || '',
        reasoning: llmResponse.reasoning || '',
        tokenUsage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens
        }
      };
    } catch (error) {
      lastError = error;

      // Retry on rate limiting (429)
      if (error.status === 429 && attempt < MAX_RETRIES - 1) {
        const backoffTime = INITIAL_BACKOFF_MS * (2 ** attempt);
        await sleep(backoffTime);
        continue;
      }

      // Retry once on timeout
      if (error.message?.includes('timeout') && attempt < MAX_RETRIES - 1) {
        const backoffTime = INITIAL_BACKOFF_MS;
        await sleep(backoffTime);
        continue;
      }

      // Don't retry on other errors
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(`LLM API failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }
    }
  }

  throw new Error(`LLM API failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Sleep utility for retry backoff
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
