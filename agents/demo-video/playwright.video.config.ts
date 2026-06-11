/**
 * Video recording config for the coordinator-dashboard demo.
 * The mesh must already be running locally (ports 4001-4004) — there is no
 * webServer block on purpose: the demo records a live, real mesh.
 *
 *   npx playwright test --config=playwright.video.config.ts --grep @loop-demo
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './demo',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 600_000,
  expect: { timeout: 120_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4004',
    headless: true,
    video: {
      mode: 'on',
      size: { width: 1280, height: 800 },
    },
    viewport: { width: 1280, height: 800 },
    trace: 'off',
    actionTimeout: 30_000,
  },
  projects: [
    {
      name: 'video',
      use: { browserName: 'chromium' },
    },
  ],
});
