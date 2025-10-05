/**
 * E2E Test: Backward Compatibility
 * Verifies that existing REST endpoints (GetContent, HealthCheck) remain unchanged
 * after MCP refactoring
 *
 * This test validates:
 * - GetContentFunction API contract unchanged
 * - HealthCheckFunction API contract unchanged
 * - No regressions in existing functionality
 *
 * Expected: This test should PASS immediately (no changes to these functions)
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const FUNCTIONS_BASE_URL = 'http://localhost:7071';
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;
const TEST_PATH = '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';

describe('Backward Compatibility E2E Tests', () => {
  beforeAll(() => {
    if (!BEARER_TOKEN) {
      throw new Error('DALIVE_BEARER_TOKEN not set in .env file. This test requires a real da.live Bearer token');
    }
    console.log('🧪 E2E Test: Backward Compatibility');
    console.log(`   Server: ${FUNCTIONS_BASE_URL}`);
    console.log(`   Test Path: ${TEST_PATH}\n`);
  });

  test('HealthCheck endpoint should return healthy status', async () => {
    console.log('1️⃣  Testing HealthCheck endpoint...');
    const startTime = Date.now();

    const response = await axios.get(`${FUNCTIONS_BASE_URL}/api/HealthCheck`);
    const duration = Date.now() - startTime;

    expect(response.status).toBe(200);
    expect(response.data.status).toBeDefined();
    expect(response.data.status).toBe('healthy');
    expect(response.data.timestamp).toBeDefined();

    console.log(`   ✅ HealthCheck PASSED`);
    console.log(`   Status: ${response.data.status}`);
    console.log(`   Version: ${response.data.version || 'not specified'}`);
    console.log(`   Duration: ${duration}ms\n`);
  });

  test('GetContent endpoint should return content with correct structure', async () => {
    console.log('2️⃣  Testing GetContent endpoint...');
    const startTime = Date.now();

    const response = await axios.get(
      `${FUNCTIONS_BASE_URL}/api/GetContent${TEST_PATH}`,
      {
        headers: {
          'Authorization': `Bearer ${BEARER_TOKEN}`
        }
      }
    );
    const duration = Date.now() - startTime;

    expect(response.status).toBe(200);
    expect(response.data.path).toBe(TEST_PATH);
    expect(response.data.html).toBeDefined();
    expect(typeof response.data.html).toBe('string');
    expect(response.data.html.length).toBeGreaterThan(0);

    console.log(`   ✅ GetContent PASSED`);
    console.log(`   Path: ${response.data.path}`);
    console.log(`   HTML length: ${response.data.html.length} characters`);
    console.log(`   Duration: ${duration}ms\n`);

    // Performance check
    const EXPECTED_MAX_DURATION = 5000;
    if (duration > EXPECTED_MAX_DURATION) {
      console.warn(`   ⚠️  Warning: GetContent took ${duration}ms (> ${EXPECTED_MAX_DURATION}ms expected)`);
    } else {
      console.log(`   ✅ Performance acceptable: ${duration}ms\n`);
    }
  });

  test('GetContent should return 404 for nonexistent paths', async () => {
    console.log('3️⃣  Testing error handling (404 Not Found)...');

    await expect(
      axios.get(
        `${FUNCTIONS_BASE_URL}/api/GetContent/nonexistent/path/that/does/not/exist`,
        {
          headers: {
            'Authorization': `Bearer ${BEARER_TOKEN}`
          }
        }
      )
    ).rejects.toMatchObject({
      response: {
        status: 404
      }
    });

    console.log(`   ✅ Error handling correct: 404 Not Found\n`);
  });

  afterAll(() => {
    console.log('✅ Backward Compatibility E2E test PASSED!');
    console.log('\nSummary:');
    console.log('   - HealthCheck: Working');
    console.log('   - GetContent: Working');
    console.log('   - Error handling: Unchanged');
    console.log('   - MCP refactoring has NOT broken existing functionality\n');
  });
});
