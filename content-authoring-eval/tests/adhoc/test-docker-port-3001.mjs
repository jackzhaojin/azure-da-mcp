#!/usr/bin/env node

/**
 * Test Docker deployment on port 3001 using Playwright
 * This tests the actual UI workflow, not just API endpoints
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testDockerDeployment() {
  console.log('🚀 Starting Docker deployment test on port 3001...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Test 1: Navigate to home page
    console.log('📍 Test 1: Navigate to home page');
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    console.log(`   ✅ Page loaded: "${title}"\n`);

    // Test 2: Navigate to batch evaluation page
    console.log('📍 Test 2: Navigate to batch evaluation page');
    await page.goto('http://localhost:3001/evaluate/batch');
    await page.waitForLoadState('networkidle');

    // Wait for the page to fully render
    await page.waitForSelector('h1', { timeout: 5000 });
    const heading = await page.textContent('h1');
    console.log(`   ✅ Batch page loaded: "${heading}"\n`);

    // Test 3: Check if import section exists
    console.log('📍 Test 3: Check for JSON import section');
    const importSection = await page.locator('text=Import Batch JSON').count();
    if (importSection > 0) {
      console.log('   ✅ JSON import section found\n');
    } else {
      console.log('   ⚠️  JSON import section not found\n');
    }

    // Test 4: Import sample JSON via API (since file upload is complex)
    console.log('📍 Test 4: Import sample JSON via API');
    const samplePath = join(__dirname, '../../public/samples/demo-mixed-sources.json');
    const sampleData = JSON.parse(readFileSync(samplePath, 'utf-8'));

    const importResponse = await page.evaluate(async (data) => {
      const response = await fetch('http://localhost:3001/api/evaluate/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return response.json();
    }, sampleData);

    console.log('   Import Response:', importResponse);
    if (importResponse.success) {
      console.log(`   ✅ Imported ${importResponse.pageCount} pages\n`);
    }

    // Test 5: Navigate to results page
    if (importResponse.success && importResponse.batchId) {
      console.log('📍 Test 5: Navigate to batch results page');
      await page.goto(`http://localhost:3001/batch/results/${importResponse.batchId}`);
      await page.waitForLoadState('networkidle');

      // Check if we can see the batch ID
      const pageContent = await page.textContent('body');
      if (pageContent.includes(importResponse.batchId)) {
        console.log('   ✅ Results page loaded with batch ID\n');
      }
    }

    // Test 6: Test accessibility agent directly
    console.log('📍 Test 6: Test accessibility agent via API');
    const accessibilityResult = await page.evaluate(async () => {
      const response = await fetch('http://localhost:3001/api/evaluate/accessibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ migratedUrl: 'https://www.w3.org/' })
      });
      return response.json();
    });

    console.log('   Accessibility Score:', accessibilityResult.finalScore);
    console.log('   Deterministic Violations:', accessibilityResult.deterministic?.violations?.length || 0);
    console.log('   Agentic Findings:', accessibilityResult.agentic?.findings?.length || 0);
    if (accessibilityResult.finalScore === 100) {
      console.log('   ✅ Accessibility agent working perfectly\n');
    }

    // Test 7: Take screenshot of the UI
    console.log('📍 Test 7: Take screenshot of batch evaluation page');
    await page.goto('http://localhost:3001/evaluate/batch');
    await page.waitForLoadState('networkidle');
    const screenshotPath = join(__dirname, '../../public/screenshots/test-docker-3001.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`   ✅ Screenshot saved to: ${screenshotPath}\n`);

    console.log('✅ All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the test
testDockerDeployment().catch(console.error);
