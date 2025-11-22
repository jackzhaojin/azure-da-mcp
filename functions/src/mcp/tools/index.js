/**
 * MCP Tools Registry
 * Central registry for all MCP tools
 */

import * as GetDaliveContent from './get-dalive-content.js';
import * as SaveDaliveContent from './save-dalive-content.js';
import * as PreviewPublishDaliveContent from './preview-publish-dalive-content.js';

/**
 * All available MCP tools
 */
export const tools = {
  'get_dalive_content': GetDaliveContent,
  'save_dalive_content': SaveDaliveContent,
  'preview_publish_dalive_content': PreviewPublishDaliveContent
};

/**
 * Get tool by name
 * @param {string} toolName - Name of the tool
 * @returns {Object} Tool module with execute() and definition
 * @throws {Error} If tool not found
 */
export function getTool(toolName) {
  const tool = tools[toolName];
  if (!tool) {
    throw new Error(`Tool not found: ${toolName}`);
  }
  return tool;
}

/**
 * Get all tool definitions for MCP tools/list
 * @returns {Array<Object>} Array of tool definitions
 */
export function getAllDefinitions() {
  return Object.values(tools).map(tool => tool.definition);
}

/**
 * Execute a tool by name
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} params - Tool parameters
 * @param {Object} context - MCP session context
 * @returns {Promise<Object>} Tool result
 */
export async function executeTool(toolName, params, context) {
  const tool = getTool(toolName);
  return await tool.execute(params, context);
}
