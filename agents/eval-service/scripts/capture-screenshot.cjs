#!/usr/bin/env node
/**
 * Simple screenshot capture script using Playwright
 * Usage: node scripts/capture-screenshot.js <url> <outputPath> [width] [height]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// containers run as root — chromium needs --no-sandbox there (same flags the
// accessibility scanner already passes)
const launchArgs = fs.existsSync('/.dockerenv') ? ['--no-sandbox', '--disable-dev-shm-usage'] : [];

async function captureScreenshot() {
  const url = process.argv[2];
  const outputPath = process.argv[3];
  const width = parseInt(process.argv[4] || '1280');
  const height = parseInt(process.argv[5] || '720');

  if (!url || !outputPath) {
    console.error('Usage: node capture-screenshot.js <url> <outputPath> [width] [height]');
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: launchArgs });
    const context = await browser.newContext({
      viewport: { width, height },
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.screenshot({ path: outputPath, fullPage: true });

    console.log(`Screenshot saved to: ${outputPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`Screenshot failed: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

captureScreenshot();
