/**
 * Ad-hoc test for set_token_dalive tool
 * Tests token priority: params > session > env
 *
 * Run: node tests/adhoc/test-set-token.js
 */

import { resolveBearerToken } from '../../src/mcp/utils/validator.js';

console.log('Testing resolveBearerToken with priority: params > context > env\n');

// Save original env
const originalEnv = process.env.DALIVE_BEARER_TOKEN;

try {
  // Test 1: All three sources present
  console.log('Test 1: All three sources present');
  process.env.DALIVE_BEARER_TOKEN = 'env-token';
  const params1 = { token: 'param-token' };
  const context1 = { bearerToken: 'context-token' };
  const result1 = resolveBearerToken(params1, context1);
  console.log(`  Expected: param-token`);
  console.log(`  Got: ${result1}`);
  console.log(`  ✓ ${result1 === 'param-token' ? 'PASS' : 'FAIL'}\n`);

  // Test 2: Context and env present (no param)
  console.log('Test 2: Context and env present (no param)');
  process.env.DALIVE_BEARER_TOKEN = 'env-token';
  const params2 = {};
  const context2 = { bearerToken: 'context-token' };
  const result2 = resolveBearerToken(params2, context2);
  console.log(`  Expected: context-token`);
  console.log(`  Got: ${result2}`);
  console.log(`  ✓ ${result2 === 'context-token' ? 'PASS' : 'FAIL'}\n`);

  // Test 3: Only env present
  console.log('Test 3: Only env present');
  process.env.DALIVE_BEARER_TOKEN = 'env-token';
  const params3 = {};
  const context3 = {};
  const result3 = resolveBearerToken(params3, context3);
  console.log(`  Expected: env-token`);
  console.log(`  Got: ${result3}`);
  console.log(`  ✓ ${result3 === 'env-token' ? 'PASS' : 'FAIL'}\n`);

  // Test 4: No token anywhere (should throw)
  console.log('Test 4: No token anywhere (should throw error)');
  delete process.env.DALIVE_BEARER_TOKEN;
  const params4 = {};
  const context4 = {};
  try {
    resolveBearerToken(params4, context4);
    console.log('  ✗ FAIL - Should have thrown error\n');
  } catch (error) {
    console.log(`  Expected: Error with code -32001`);
    console.log(`  Got: ${error.message}`);
    console.log(`  ✓ ${error.code === -32001 ? 'PASS' : 'FAIL'}\n`);
  }

  // Test 5: bearerToken in params (alternate field name)
  console.log('Test 5: bearerToken field in params (alternate name)');
  process.env.DALIVE_BEARER_TOKEN = 'env-token';
  const params5 = { bearerToken: 'bearer-param-token' };
  const context5 = { bearerToken: 'context-token' };
  const result5 = resolveBearerToken(params5, context5);
  console.log(`  Expected: bearer-param-token`);
  console.log(`  Got: ${result5}`);
  console.log(`  ✓ ${result5 === 'bearer-param-token' ? 'PASS' : 'FAIL'}\n`);

  console.log('✅ All tests completed!');

} finally {
  // Restore original env
  if (originalEnv) {
    process.env.DALIVE_BEARER_TOKEN = originalEnv;
  } else {
    delete process.env.DALIVE_BEARER_TOKEN;
  }
}
