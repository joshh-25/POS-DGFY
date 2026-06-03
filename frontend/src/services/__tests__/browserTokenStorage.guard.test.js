import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const guardedFiles = [
  'frontend/src/services/authService.js',
  'frontend/src/services/api.js',
  'frontend/src/services/dgfyAuthService.js',
  'frontend/src/services/adminService.js',
  'frontend/src/main.jsx',
  'frontend/Pages/AcceptInvite.jsx',
  'frontend/apps/store/src/StorefrontApp.jsx',
  'frontend/apps/store/src/HospitalityBookingPanel.jsx'
];

const forbiddenPatterns = [
  /localStorage\.setItem\(['"`](authToken|refreshToken|companyToken|dgfyAccountToken|dgfy_customer_account_token|dgfy_account_token|dgfy_store_customer_token|store_customer_token|store_token)['"`]/,
  /localStorage\.getItem\(['"`](authToken|refreshToken|companyToken|dgfyAccountToken|dgfy_customer_account_token|dgfy_account_token|dgfy_store_customer_token|store_customer_token|store_token)['"`]/,
  /sessionStorage\.setItem\(['"`]admin_token['"`]/,
  /sessionStorage\.getItem\(['"`]admin_token['"`]/
];

describe('browser token storage guard', () => {
  it('does not persist privileged session tokens in browser-readable storage', () => {
    const violations = [];

    for (const file of guardedFiles) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(source)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
