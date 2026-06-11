/**
 * Playwright Video Recording Configuration -- Copy into your project
 *
 * Runs captioned demo scripts in headless mode (no browser chrome) with
 * explicit video size matching the viewport for pixel-perfect recordings.
 *
 * Output: WebM files in test-results/ -- look for the .webm file inside
 * the test-specific folder.
 *
 * Usage:
 *   npx playwright test --config=playwright.video.config.ts --grep @demo
 *
 * Customize:
 *   - testDir: where your demo spec files live
 *   - baseURL: your dev server URL
 *   - viewport/video size: match your desired output resolution
 *   - webServer.command: your dev server start command
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Point to the directory containing your demo spec files
  testDir: './demo',

  // Sequential execution -- demos should run one at a time
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,

  // Generous timeouts for demo pacing (demos have long pauses)
  timeout: 600_000,        // 10 minutes per test
  expect: { timeout: 120_000 },

  reporter: 'list',

  use: {
    // Your dev server URL
    baseURL: 'http://localhost:5173',

    // Headless -- no browser chrome in the recording
    headless: true,

    // Record video at full viewport resolution
    video: {
      mode: 'on',
      size: { width: 1280, height: 800 },
    },

    // Match the video size for pixel-perfect output
    viewport: { width: 1280, height: 800 },

    // Disable trace to save resources
    trace: 'off',
    actionTimeout: 30_000,
  },

  projects: [
    {
      name: 'video',
      use: {
        // Chromium without Desktop Chrome device defaults
        // that could override viewport settings
        browserName: 'chromium',
      },
    },
  ],

  // Auto-start dev server if not already running
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
