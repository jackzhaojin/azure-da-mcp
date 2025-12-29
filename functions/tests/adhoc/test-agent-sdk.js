#!/usr/bin/env node

/**
 * Test script to debug Agent SDK spawning issues
 * This script mimics what the Agent SDK does when spawning the Claude CLI
 */

const { spawn } = require('child_process');
const path = require('path');

// Test configuration matching agentic.ts
const mcpServers = {
  "playwright": {
    command: "/usr/local/bin/mcp-server-playwright",
    args: []
  },
  "filesystem": {
    command: "/usr/local/bin/mcp-server-filesystem",
    args: [process.cwd()]
  }
};

const mcpConfigJson = JSON.stringify({ mcpServers });

console.log('Testing Claude CLI spawn with MCP configuration...');
console.log('MCP Config:', mcpConfigJson);
console.log('Environment:', {
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'present' : 'missing',
  HOME: process.env.HOME,
  PWD: process.cwd(),
});

// Spawn claude CLI with --print mode and MCP config
const claude = spawn('claude', [
  '-p',
  '--mcp-config', mcpConfigJson,
  '--dangerously-skip-permissions',
  'What is 2+2?'
], {
  env: {
    ...process.env,
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
  },
  cwd: process.cwd(),
});

let stdout = '';
let stderr = '';

claude.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('[STDOUT]', data.toString());
});

claude.stderr.on('data', (data) => {
  stderr += data.toString();
  console.error('[STDERR]', data.toString());
});

claude.on('close', (code, signal) => {
  console.log('\n=== Process Closed ===');
  console.log('Exit code:', code);
  console.log('Signal:', signal);
  console.log('Stdout:', stdout);
  console.log('Stderr:', stderr);

  if (code !== 0) {
    process.exit(code);
  }
});

claude.on('error', (error) => {
  console.error('\n=== Spawn Error ===');
  console.error(error);
  process.exit(1);
});

// Timeout after 30 seconds
setTimeout(() => {
  console.log('\n=== Timeout - killing process ===');
  claude.kill();
  process.exit(1);
}, 30000);
