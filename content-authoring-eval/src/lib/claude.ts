/**
 * Claude API Client Configuration
 *
 * Supports both Sonnet 4.5 and Haiku 4.5 models via OAuth token or API key.
 * Environment variable precedence:
 * 1. CLAUDE_CODE_OAUTH_TOKEN (OAuth token - no budget costs)
 * 2. ANTHROPIC_API_KEY (API key - charged per usage)
 *
 * Model selection via CLAUDE_MODEL environment variable.
 * Defaults to claude-haiku-4-5-20250929 for cost efficiency.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Initialize Claude API client
 * Uses OAuth token if available, otherwise falls back to API key
 */
export function createClaudeClient(): Anthropic {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!oauthToken && !apiKey) {
    throw new Error(
      'Missing Claude authentication. Please set either CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in .env.local'
    );
  }

  return new Anthropic({
    apiKey: oauthToken || apiKey,
  });
}

/**
 * Get the configured Claude model
 * Defaults to Haiku 4.5 for cost efficiency
 */
export function getClaudeModel(): string {
  return process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20250929';
}

/**
 * Available Claude models for evaluation
 */
export const CLAUDE_MODELS = {
  SONNET_4_5: 'claude-sonnet-4-5-20250929',
  HAIKU_4_5: 'claude-haiku-4-5-20250929',
} as const;

/**
 * Model selection helper
 */
export function selectModel(preferSpeed: boolean = true): string {
  return preferSpeed ? CLAUDE_MODELS.HAIKU_4_5 : CLAUDE_MODELS.SONNET_4_5;
}
