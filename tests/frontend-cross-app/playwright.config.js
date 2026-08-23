import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local E2E credentials belong only in this ignored file. Process environment
// values take precedence so CI or a terminal session can supply secrets safely.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });
dotenv.config({ path: path.resolve(__dirname, '.env') });

const storefrontURL = process.env.STOREFRONT_URL || 'http://localhost:5175';
const posURL = process.env.E2E_BASE_URL || 'http://localhost:5174';
const apiURL = process.env.E2E_API_URL || 'http://localhost:5000';
const isLocalRun = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(storefrontURL);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    headless: process.env.E2E_HEADLESS !== 'false',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'google-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
      },
    },
  ],
  // These specs build their own storefrontURL/posURL/apiURL per-request rather than
  // navigating relative to a single Playwright `baseURL` -- see docs/architecture/
  // frontend-split-sync.md. All three servers below still need to be up.
  webServer: isLocalRun ? [
    {
      command: 'npm run dev',
      cwd: path.resolve(__dirname, '../../apps/dgfy-api'),
      url: `${apiURL}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      cwd: path.resolve(__dirname, '../../apps/dgfy-storefront'),
      url: `${storefrontURL}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      cwd: path.resolve(__dirname, '../../apps/dgfy-pos'),
      url: `${posURL}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ] : undefined,
});
