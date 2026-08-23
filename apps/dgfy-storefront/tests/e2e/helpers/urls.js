// Intentional copy of apps/dgfy-web/tests/e2e/helpers/urls.js (issue #322 Phase 3): a
// cross-app relative import worked at first but loaded a second, separate
// @playwright/test instance (this app has its own node_modules/npm install now),
// which Playwright refuses to run under. Keep both copies in sync until Phase 5/6
// consolidates shared e2e helpers into tests/frontend-cross-app/.
export const SKUPERVISOR_URL = process.env.SKUPERVISOR_URL || 'http://localhost:5173';
export const POS_URL = process.env.POS_URL || 'http://localhost:5174';
export const STOREFRONT_URL = process.env.STOREFRONT_URL || 'http://localhost:5175';
export const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
export const TEST_COMPANY_TOKEN = process.env.TEST_COMPANY_TOKEN || 'token-tenant-a';
