/**
 * MCP Server Configuration Helper
 *
 * Provides environment-aware MCP server paths for Agent SDK
 * - Docker: Uses /usr/local/bin paths (globally installed in container)
 * - Local: Uses /opt/homebrew/bin paths (macOS Homebrew install)
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Detect if running in Docker container
 */
function isDocker(): boolean {
  return fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
}

/**
 * Get MCP server paths based on environment
 */
export function getMCPServerPaths() {
  const docker = isDocker();

  if (docker) {
    // Docker paths (from Dockerfile global installs)
    return {
      playwright: '/usr/local/bin/mcp-server-playwright',
      filesystem: '/usr/local/bin/mcp-server-filesystem',
    };
  }

  // Local development paths
  // Try multiple common locations
  const playwrightPaths = [
    '/opt/homebrew/bin/mcp-server-playwright', // macOS Homebrew ARM
    '/usr/local/bin/mcp-server-playwright',     // macOS Homebrew Intel
    'mcp-server-playwright',                     // Fallback to PATH
  ];

  const filesystemPaths = [
    '/opt/homebrew/bin/mcp-server-filesystem', // macOS Homebrew ARM
    '/usr/local/bin/mcp-server-filesystem',     // macOS Homebrew Intel
    'npx',                                       // Fallback to npx
  ];

  // Find first existing playwright path
  const playwrightPath = playwrightPaths.find(p => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }) || 'mcp-server-playwright';

  // For filesystem, use npx if no binary found
  const filesystemPath = filesystemPaths.find(p => {
    try {
      return p !== 'npx' && fs.existsSync(p);
    } catch {
      return false;
    }
  }) || 'npx';

  return {
    playwright: playwrightPath,
    filesystem: filesystemPath,
    filesystemArgs: filesystemPath === 'npx'
      ? ['--yes', '@modelcontextprotocol/server-filesystem', process.cwd()]
      : [process.cwd()],
  };
}

/**
 * Get MCP servers configuration for Agent SDK
 */
export function getMCPServersConfig() {
  const paths = getMCPServerPaths();

  return {
    playwright: {
      command: paths.playwright,
      args: []
    },
    filesystem: {
      command: paths.filesystem,
      args: paths.filesystemArgs || [process.cwd()]
    }
  };
}
