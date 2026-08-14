import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baseURL = String(process.env.E2E_CONTRACT_BASE_URL || 'http://127.0.0.1:5175').replace(/\/$/, '');

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /storefront-fnb-conditional-modifiers\.spec\.js/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/fnb-contract', open: 'never' }]],
  outputDir: 'test-results/fnb-contract',
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000
  },
  projects: [
    {
      name: 'fnb-storefront-chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run dev:store',
    cwd: __dirname,
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
