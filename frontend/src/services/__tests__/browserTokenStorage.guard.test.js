import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const guardedRoots = [
  'frontend/src',
  'frontend/Pages',
  'frontend/apps/store/src'
];

const forbiddenPatterns = [
  /localStorage\.setItem\(['"`](authToken|refreshToken|companyToken|dgfyAccountToken|dgfy_customer_account_token|dgfy_account_token|dgfy_store_customer_token|store_customer_token|store_token)['"`]/,
  /localStorage\.getItem\(['"`](authToken|refreshToken|companyToken|dgfyAccountToken|dgfy_customer_account_token|dgfy_account_token|dgfy_store_customer_token|store_customer_token|store_token)['"`]/,
  /sessionStorage\.setItem\(['"`]admin_token['"`]/,
  /sessionStorage\.getItem\(['"`]admin_token['"`]/
];

const shouldScanFile = (filePath) => (
  /\.(js|jsx)$/.test(filePath)
  && !filePath.includes('__tests__')
  && !/\.test\.(js|jsx)$/.test(filePath)
  && !/\.spec\.(js|jsx)$/.test(filePath)
);

const listSourceFiles = (relativeRoot) => {
  const absoluteRoot = resolve(repoRoot, relativeRoot);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory)) {
      const absolutePath = resolve(directory, entry);
      const stat = statSync(absolutePath);
      if (stat.isDirectory()) {
        if (['node_modules', 'dist', 'build', 'coverage'].includes(entry)) continue;
        visit(absolutePath);
        continue;
      }
      if (stat.isFile() && shouldScanFile(absolutePath)) {
        files.push(absolutePath);
      }
    }
  };
  visit(absoluteRoot);
  return files;
};

describe('browser token storage guard', () => {
  it('does not persist privileged session tokens in browser-readable storage', () => {
    const violations = [];
    const guardedFiles = guardedRoots.flatMap(listSourceFiles);

    for (const file of guardedFiles) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(source)) {
          violations.push(`${file}: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
