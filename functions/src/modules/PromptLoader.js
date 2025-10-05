/**
 * Prompt Loader Module
 * Loads versioned prompts from JSON files with caching and validation
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPTS_DIR = join(__dirname, '../prompts');

// In-memory cache for loaded prompts
const promptCache = new Map();

/**
 * Load a versioned prompt from JSON file
 * @param {string} promptName - Name of the prompt (e.g., 'edit-content')
 * @param {string} version - Semantic version (e.g., '1.0.0') or 'latest'
 * @returns {Object} Loaded prompt with metadata and content
 * @throws {Error} If prompt file not found or invalid
 */
export function loadPrompt(promptName, version = 'latest') {
  const cacheKey = `${promptName}@${version}`;

  // Return cached version if available
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey);
  }

  // Determine version to load
  let versionToLoad = version;
  if (version === 'latest') {
    // For now, default to v1.0.0. In future, could read latest from config
    versionToLoad = '1.0.0';
  }

  // Construct path to prompt file
  const promptPath = join(PROMPTS_DIR, promptName, `v${versionToLoad}.json`);

  try {
    // Load and parse JSON
    const promptData = JSON.parse(readFileSync(promptPath, 'utf8'));

    // Validate required fields
    validatePrompt(promptData);

    // Cache and return
    promptCache.set(cacheKey, promptData);
    return promptData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(
        `Prompt not found: ${promptName}@${versionToLoad}. ` +
        `Expected file: ${promptPath}`
      );
    }
    throw new Error(
      `Failed to load prompt ${promptName}@${versionToLoad}: ${error.message}`
    );
  }
}

/**
 * Validate prompt structure
 * @param {Object} prompt - Prompt data to validate
 * @throws {Error} If prompt is missing required fields
 */
function validatePrompt(prompt) {
  const required = ['version', 'name', 'prompts'];
  const missing = required.filter(field => !prompt[field]);

  if (missing.length > 0) {
    throw new Error(
      `Invalid prompt file: missing required fields: ${missing.join(', ')}`
    );
  }

  if (!prompt.prompts.system) {
    throw new Error('Invalid prompt file: prompts.system is required');
  }
}

/**
 * Clear prompt cache (useful for testing)
 */
export function clearPromptCache() {
  promptCache.clear();
}

/**
 * Get available prompt versions for a prompt family
 * @param {string} promptName - Name of the prompt family
 * @returns {Array<string>} List of available versions
 */
export function getAvailableVersions(promptName) {
  const promptDir = join(PROMPTS_DIR, promptName);

  try {
    const files = readdirSync(promptDir);
    return files
      .filter(f => f.startsWith('v') && f.endsWith('.json'))
      .map(f => f.slice(1, -5)) // Remove 'v' prefix and '.json' suffix
      .sort();
  } catch (error) {
    return [];
  }
}
