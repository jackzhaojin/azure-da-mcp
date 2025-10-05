#!/usr/bin/env node
/**
 * Manual E2E Test Script
 * Run this directly with: node tests/e2e/manual-test.js
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
} else {
  console.error('❌ No .env file found. Copy .env.example to .env and add your tokens.');
  process.exit(1);
}

const FUNCTIONS_BASE_URL = 'http://localhost:7071';
const BEARER_TOKEN = process.env.DALIVE_BEARER_TOKEN;
const TEST_PATH = process.env.E2E_TEST_PATH || '/source/jackzhaojin/da-live-postal-2025-07/index-copy.html';
const TEST_COMMAND = process.env.E2E_TEST_COMMAND || 'Make the hero section more concise';

console.log('🚀 Starting E2E Test');
console.log(`   Server: ${FUNCTIONS_BASE_URL}`);
console.log(`   Path: ${TEST_PATH}`);
console.log(`   Command: ${TEST_COMMAND}`);
console.log('');

async function runTests() {
  try {
    // Step 1: HealthCheck
    console.log('1️⃣  Testing HealthCheck...');
    const healthResponse = await axios.get(`${FUNCTIONS_BASE_URL}/api/HealthCheck`);
    console.log(`   ✅ Status: ${healthResponse.data.status}`);
    console.log(`   Version: ${healthResponse.data.version}`);
    console.log('');

    // Step 2: GetContent
    console.log('2️⃣  Testing GetContent...');
    const getResponse = await axios.get(
      `${FUNCTIONS_BASE_URL}/api/GetContent${TEST_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${BEARER_TOKEN}`,
        },
      }
    );
    console.log(`   ✅ Retrieved HTML from ${getResponse.data.path}`);
    console.log(`   HTML length: ${getResponse.data.html?.length || 0} characters`);
    console.log(`   Duration: ${getResponse.data.duration}ms`);
    console.log('');

    // Step 3: EditContent
    console.log('3️⃣  Testing EditContent (This will make REAL API calls!)...');
    console.log('   ⏳ This may take 5-10 seconds...');
    const editResponse = await axios.post(
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
        timeout: 30000,
      }
    );

    console.log(`   ✅ Edit completed!`);
    console.log(`   Request ID: ${editResponse.data.requestId}`);
    console.log(`   Edited HTML length: ${editResponse.data.editedHtmlLength} characters`);
    console.log(`   Explanation: ${editResponse.data.explanation}`);
    console.log(`   Reasoning: ${editResponse.data.reasoning}`);
    console.log('');
    console.log('   ⏱️  Timing breakdown:');
    console.log(`      Total: ${editResponse.data.timing.total}ms`);
    console.log(`      - da.live fetch: ${editResponse.data.timing.dalive_fetch}ms`);
    console.log(`      - LLM call: ${editResponse.data.timing.llm_call}ms`);
    console.log(`      - da.live update: ${editResponse.data.timing.dalive_update}ms`);

    console.log('');
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('');
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

runTests();
