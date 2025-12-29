#!/usr/bin/env node

const { spawn } = require('child_process');

console.log('Testing Claude CLI with stdin closed...');

const claude = spawn('claude', [
  '-p',
  '--dangerously-skip-permissions',
  'What is 2+2?'
], {
  env: {
    ...process.env,
    CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
  },
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'], // Close stdin, pipe stdout/stderr
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
  console.log('Total stdout:', stdout.length, 'bytes');
  console.log('Total stderr:', stderr.length, 'bytes');

  if (code !== 0) {
    process.exit(code);
  }
});

claude.on('error', (error) => {
  console.error('\n=== Spawn Error ===');
  console.error(error);
  process.exit(1);
});

setTimeout(() => {
  console.log('\n=== Timeout ===');
  claude.kill();
  process.exit(1);
}, 30000);
