import { defineConfig, devices } from '@playwright/test';

// #475 RF-1 -- this suite is deliberately self-contained: the spec builds its own
// tiny local HTTP server serving maplibre-gl straight out of node_modules and a
// minimal style with no external sources, so it needs neither the storefront dev
// server nor dgfy-api. That's why this gets its own config (same pattern as
// playwright.fnb-contract.config.js) instead of living under the main
// playwright.config.js, which always spins up both webServer entries.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /map-pinch-gesture-touch-bridge\.spec\.js/,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/pinch-gesture', open: 'never' }]],
  outputDir: 'test-results/pinch-gesture',
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000
  },
  projects: [
    {
      // No `channel: 'chrome'` -- unlike the main config's 'google-chrome' project,
      // this deliberately uses Playwright's own bundled Chromium so it doesn't
      // depend on a system Chrome install; CDP touch dispatch works the same way.
      name: 'chromium-pinch-gesture',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
