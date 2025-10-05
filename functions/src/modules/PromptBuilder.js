/**
 * Prompt Builder Module
 * Builds LLM prompts from versioned template files
 */

import { loadPrompt } from './PromptLoader.js';

/**
 * Build complete LLM prompt for MCP-enabled editing workflow
 * @param {string} command - Natural language editing command
 * @param {string|null} html - HTML content (legacy support, pass null for MCP workflow)
 * @param {string} path - Page path for MCP tools
 * @param {string} version - Prompt version to use (default: 'latest')
 * @returns {Object} Complete LLM prompt with all sections, parameters, and metadata
 */
export function buildPrompt(command, html, path, version = 'latest') {
  // Load versioned prompt
  const promptData = loadPrompt('edit-content', version);

  // Replace template variables in context
  const pageContext = html
    ? `Page: ${path}\n\nHTML Content:\n${html}`
    : promptData.prompts.context_template.replace('{{path}}', path);

  // Rough token counting (chars / 4)
  const systemTokens = Math.ceil(promptData.prompts.system.length / 4);
  const commandTokens = Math.ceil(command.length / 4);
  const contextTokens = Math.ceil(pageContext.length / 4);
  const guidelinesTokens = Math.ceil(promptData.prompts.guidelines.length / 4);
  const totalTokens = systemTokens + commandTokens + contextTokens + guidelinesTokens;

  return {
    // Prompt content
    systemInstructions: promptData.prompts.system,
    userCommand: command,
    pageContext,
    editingGuidelines: promptData.prompts.guidelines,

    // Metadata
    promptVersion: promptData.version,
    promptName: promptData.name,
    model: promptData.model,

    // Parameters
    parameters: promptData.parameters,

    // Token estimate
    totalTokens
  };
}

/**
 * Get prompt metadata without building full prompt
 * Useful for logging and debugging
 * @param {string} version - Prompt version (default: 'latest')
 * @returns {Object} Prompt metadata
 */
export function getPromptMetadata(version = 'latest') {
  const promptData = loadPrompt('edit-content', version);
  return {
    version: promptData.version,
    name: promptData.name,
    description: promptData.description,
    created: promptData.created,
    author: promptData.author,
    model: promptData.model,
    changelog: promptData.changelog
  };
}
