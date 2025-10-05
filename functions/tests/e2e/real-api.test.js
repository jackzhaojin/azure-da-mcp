/**
 * Real E2E Test with Actual Credentials
 *
 * This test makes REAL API calls to your local server, which then calls:
 * - da.live Admin API (to fetch and update content)
 * - Anthropic Claude API (to generate edits)
 *
 * Prerequisites:
 * 1. Copy .env.example to .env
 * 2. Fill in your DALIVE_BEARER_TOKEN (from browser DevTools)
 * 3. Make sure ANTHROPIC_API_KEY is set in local.settings.json
 * 4. Start the server: npm start
 * 5. Run this test: npm test -- real-api.test.js
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import axios from 'axios';
import { existsSync } from 'fs';

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '../../.env');

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.warn('⚠️  No .env file found. Copy .env.example to .env and add your tokens.');
}

const FUNCTIONS_BASE_URL = 'http://localhost:7071';

// Configuration from .env
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;
const TEST_PATH = process.env.E2E_TEST_PATH || '/products/enterprise';
const TEST_COMMAND = process.env.E2E_TEST_COMMAND || 'Make more concise';

// Only run if .env exists and has token
const describeE2E = BEARER_TOKEN && BEARER_TOKEN !== 'your-jwt-token-here' ? describe : describe.skip;

describeE2E('Real E2E Tests with Credentials', () => {
  beforeAll(() => {
    if (!BEARER_TOKEN || BEARER_TOKEN === 'your-jwt-token-here') {
      console.warn('⚠️  Skipping E2E tests: No valid DALIVE_BEARER_TOKEN in .env file');
      console.warn('   Copy .env.example to .env and add your token');
    }
    console.log('🚀 Running E2E tests against local server at', FUNCTIONS_BASE_URL);
    console.log('   This will make REAL calls to da.live and Anthropic APIs');
  });

  describe('Step 1: HealthCheck', () => {
    test('should return healthy status', async () => {
      const response = await axios.get(`${FUNCTIONS_BASE_URL}/api/HealthCheck`);

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(['healthy', 'degraded']).toContain(response.data.status);
      expect(response.data).toHaveProperty('version');
      expect(response.data).toHaveProperty('timestamp');

      console.log('✅ HealthCheck:', response.data);
    });
  });

  describe('Step 2: GetContent with Real Token', () => {
    test('should fetch content from da.live using real Bearer token', async () => {
      const response = await axios.get(
        `${FUNCTIONS_BASE_URL}/api/GetContent${TEST_PATH}`,
        {
          headers: {
            Authorization: `Bearer ${BEARER_TOKEN}`,
          },
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('path');
      expect(response.data).toHaveProperty('blocks');
      expect(Array.isArray(response.data.blocks)).toBe(true);
      expect(response.data).toHaveProperty('metadata');
      expect(response.data).toHaveProperty('duration');

      console.log(`✅ GetContent: Retrieved ${response.data.blocks.length} blocks from ${response.data.path}`);
      console.log(`   Duration: ${response.data.duration}ms`);
      if (response.data.blocks.length > 0) {
        console.log('   Sample block:', JSON.stringify(response.data.blocks[0], null, 2));
      }
    }, 30000);

    test('should return 401 for invalid token', async () => {
      try {
        await axios.get(
          `${FUNCTIONS_BASE_URL}/api/GetContent${TEST_PATH}`,
          {
            headers: {
              Authorization: 'Bearer invalid-token',
            },
          }
        );
        fail('Expected 401 error');
      } catch (error) {
        expect(error.response.status).toBe(401);
        console.log('✅ Invalid token correctly rejected with 401');
      }
    });
  });

  describe('Step 3: EditContent with Full Workflow', () => {
    test('should process edit request with real token', async () => {
      const response = await axios.post(
        `${FUNCTIONS_BASE_URL}/api/EditContent`,
        {
          command: TEST_COMMAND,
          path: TEST_PATH,
        },
        {
          headers: {
            Authorization: `Bearer ${BEARER_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Verify response structure
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('requestId');
      expect(response.data).toHaveProperty('editedBlocks');
      expect(response.data).toHaveProperty('unchangedBlocks');
      expect(response.data).toHaveProperty('explanation');
      expect(response.data).toHaveProperty('reasoning');
      expect(response.data).toHaveProperty('timing');

      // Verify timing metrics
      expect(response.data.timing).toHaveProperty('total');
      expect(response.data.timing).toHaveProperty('dalive_fetch');
      expect(response.data.timing).toHaveProperty('llm_call');
      expect(response.data.timing).toHaveProperty('validation');
      expect(response.data.timing).toHaveProperty('dalive_update');

      console.log('✅ EditContent completed successfully!');
      console.log(`   Request ID: ${response.data.requestId}`);
      console.log(`   Edited blocks: ${response.data.editedBlocks.length}`);
      console.log(`   Unchanged blocks: ${response.data.unchangedBlocks.length}`);
      console.log(`   Explanation: ${response.data.explanation}`);
      console.log(`   Total time: ${response.data.timing.total}ms`);
      console.log('   Breakdown:');
      console.log(`     - da.live fetch: ${response.data.timing.dalive_fetch}ms`);
      console.log(`     - LLM call: ${response.data.timing.llm_call}ms`);
      console.log(`     - Validation: ${response.data.timing.validation}ms`);
      console.log(`     - da.live update: ${response.data.timing.dalive_update}ms`);

      // Performance check (should be < 10000ms for real API calls)
      if (response.data.timing.total < 10000) {
        console.log('   ✅ Performance: Within target (<10s)');
      } else {
        console.warn(`   ⚠️  Performance: ${response.data.timing.total}ms exceeds 10s target`);
      }

      // Log edited blocks
      if (response.data.editedBlocks.length > 0) {
        console.log('   Edited blocks:');
        response.data.editedBlocks.forEach(block => {
          console.log(`     - ${block.type}:${block.id} - ${block.changeDescription}`);
        });
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    test('should handle invalid request body', async () => {
      try {
        await axios.post(
          `${FUNCTIONS_BASE_URL}/api/EditContent`,
          {
            // Missing required 'command' field
            path: TEST_PATH,
          },
          {
            headers: {
              Authorization: `Bearer ${BEARER_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );
        fail('Expected 400 error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toHaveProperty('error');
        console.log('✅ Invalid request body correctly rejected with 400');
      }
    });
  });
});
