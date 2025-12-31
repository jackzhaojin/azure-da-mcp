/**
 * MCP Server Configuration Helper
 *
 * Provides environment-aware MCP server paths for Agent SDK
 * - Docker: Uses /usr/local/bin paths (globally installed in container)
 * - Local: Uses /opt/homebrew/bin paths (macOS Homebrew install)
 */

import * as fs from 'fs';

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
  // Try multiple common locations including nvm
  const homeDir = process.env.HOME || '';
  const nvmBin = process.env.NVM_BIN || '';

  const playwrightPaths = [
    '/opt/homebrew/bin/mcp-server-playwright',           // macOS Homebrew ARM
    '/usr/local/bin/mcp-server-playwright',              // macOS Homebrew Intel
    nvmBin ? `${nvmBin}/mcp-server-playwright` : '',    // nvm global install
    homeDir ? `${homeDir}/.nvm/versions/node/v20.19.5/bin/mcp-server-playwright` : '', // nvm fallback
    'mcp-server-playwright',                              // Fallback to PATH
  ].filter(Boolean); // Remove empty strings

  const filesystemPaths = [
    '/opt/homebrew/bin/mcp-server-filesystem',           // macOS Homebrew ARM
    '/usr/local/bin/mcp-server-filesystem',              // macOS Homebrew Intel
    nvmBin ? `${nvmBin}/mcp-server-filesystem` : '',    // nvm global install
    homeDir ? `${homeDir}/.nvm/versions/node/v20.19.5/bin/mcp-server-filesystem` : '', // nvm fallback
    'npx',                                                 // Fallback to npx
  ].filter(Boolean); // Remove empty strings

  // Find first existing playwright path
  const playwrightPath = playwrightPaths.find(p => {
    try {
      return p !== '' && fs.existsSync(p);
    } catch {
      return false;
    }
  }) || 'mcp-server-playwright';

  // For filesystem, use npx if no binary found
  const filesystemPath = filesystemPaths.find(p => {
    try {
      return p !== 'npx' && p !== '' && fs.existsSync(p);
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
 *
 * CRITICAL - HEADLESS MODE ENFORCEMENT:
 * - ALL Playwright browser operations MUST run headless (no visible windows)
 * - Default: headless mode enforced via --headless flag
 * - Debug mode: Set PLAYWRIGHT_HEADED=true to see browser windows
 * - Production: NEVER set PLAYWRIGHT_HEADED=true
 */
export function getMCPServersConfig() {
  const paths = getMCPServerPaths();
  const docker = isDocker();
  const forceHeaded = process.env.PLAYWRIGHT_HEADED === 'true';

  // Playwright MCP flags for headless operation
  const playwrightArgs: string[] = [];

  // CRITICAL: Headless by default (ZERO visible browser windows)
  // Only disable headless for local debugging with PLAYWRIGHT_HEADED=true
  if (!forceHeaded) {
    playwrightArgs.push('--headless');
  }

  playwrightArgs.push(
    '--browser=chromium',          // Consistent browser choice
    '--viewport-size=1280x720',    // Consistent viewport for screenshots
    '--timeout-action=10000',      // 10s timeout per action
  );

  // Docker-specific optimizations
  if (docker) {
    playwrightArgs.push(
      '--no-sandbox',              // Required in Docker
      '--disable-gpu',             // No GPU in container
    );
  }

  return {
    playwright: {
      command: paths.playwright,
      args: playwrightArgs
    },
    filesystem: {
      command: paths.filesystem,
      args: paths.filesystemArgs || [process.cwd()]
    }
  };
}
