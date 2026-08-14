import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

const guardedRoots = [
  // apps/dgfy-web/src is now just main.jsx -- the shared trunk this guard originally scanned
  // moved to packages/web-core/src (issue #322 Phase 2). Kept for completeness/safety.
  'apps/dgfy-web/src',
  'apps/dgfy-web/Pages',
  'apps/dgfy-storefront/src',
  'packages/web-core/src',
  'packages/web-core/Components',
  'packages/web-core/Pages'
];

const forbiddenPatterns = [
  /localStorage\.setItem\(['"`](authToken|refreshToken|companyToken|dgfyAccountToken|dgfy_customer_account_token|dgfy_account_token|dgfy_store_customer_token|store_customer_token|store_token)['"`]/,
  /localStorage\.getItem\(['"`](authToken|refreshToken|companyToken|dgfyAccountToken|dgfy_customer_account_token|dgfy_account_token|dgfy_store_customer_token|store_customer_token|store_token)['"`]/,
  /sessionStorage\.setItem\(['"`]admin_token['"`]/,
  /sessionStorage\.getItem\(['"`]admin_token['"`]/
];

const forbiddenLocalStorageTokenKeys = [
  'authToken',
  'refreshToken',
  'companyToken',
  'dgfyAccountToken',
  'dgfy_customer_account_token',
  'dgfy_account_token',
  'dgfy_store_customer_token',
  'store_customer_token',
  'store_token'
];

const forbiddenSessionStorageTokenKeys = [
  'admin_token',
  ...forbiddenLocalStorageTokenKeys
];

const serializedSessionTokenPattern = /sessionStorage\.setItem\([^,]+,\s*JSON\.stringify\(\s*\{[^}]*\b(?:token|companyToken|refreshToken)\b/;

const containsForbiddenKey = (source, keys) => keys.some((key) => (
  new RegExp(`['"\`]${key}['"\`]`).test(source)
));

const findTokenKeyCollections = (source, keys) => {
  const collections = [];
  const declarationPattern = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[([\s\S]*?)\]/g;
  let match;
  while ((match = declarationPattern.exec(source)) !== null) {
    if (containsForbiddenKey(match[2], keys)) {
      collections.push(match[1]);
    }
  }
  return collections;
};

const hasCollectionStorageReadWrite = (source, collectionName, storageName) => {
  const escapedName = collectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`${storageName}\\.(getItem|setItem)\\s*\\(\\s*${escapedName}\\s*\\[`).test(source)) {
    return true;
  }

  const forOfPattern = new RegExp(`for\\s*\\(\\s*(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s+of\\s+${escapedName}\\s*\\)\\s*{([\\s\\S]*?)}`, 'g');
  let forOfMatch;
  while ((forOfMatch = forOfPattern.exec(source)) !== null) {
    const loopKey = forOfMatch[1];
    const body = forOfMatch[2];
    if (new RegExp(`${storageName}\\.(getItem|setItem)\\s*\\(\\s*${loopKey}\\b`).test(body)) return true;
  }

  const forEachPattern = new RegExp(`${escapedName}(?:\\.slice\\([^)]*\\))?\\.forEach\\s*\\(\\s*(?:\\(?\\s*([A-Za-z_$][\\w$]*)\\s*\\)?\\s*=>|function\\s*\\(\\s*([A-Za-z_$][\\w$]*))([\\s\\S]*?)\\)`, 'g');
  let forEachMatch;
  while ((forEachMatch = forEachPattern.exec(source)) !== null) {
    const loopKey = forEachMatch[1] || forEachMatch[2];
    const body = forEachMatch[3];
    if (loopKey && new RegExp(`${storageName}\\.(getItem|setItem)\\s*\\(\\s*${loopKey}\\b`).test(body)) return true;
  }

  return false;
};

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
  it('detects privileged token key collections passed to localStorage directly or through loops', () => {
    const directSource = `
      const TOKEN_KEYS = ['dgfy_store_customer_token'];
      window.localStorage.setItem(TOKEN_KEYS[0], token);
    `;
    const loopSource = `
      const TOKEN_KEYS = ['dgfy_store_customer_token'];
      for (const key of TOKEN_KEYS) {
        window.localStorage.getItem(key);
      }
    `;

    expect(findTokenKeyCollections(directSource, forbiddenLocalStorageTokenKeys)).toEqual(['TOKEN_KEYS']);
    expect(hasCollectionStorageReadWrite(directSource, 'TOKEN_KEYS', 'localStorage')).toBe(true);
    expect(hasCollectionStorageReadWrite(loopSource, 'TOKEN_KEYS', 'localStorage')).toBe(true);
  });

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
      if (serializedSessionTokenPattern.test(source)) {
        violations.push(`${file}: sessionStorage serialized payload contains a privileged token`);
      }
      for (const collectionName of findTokenKeyCollections(source, forbiddenLocalStorageTokenKeys)) {
        if (hasCollectionStorageReadWrite(source, collectionName, 'localStorage')) {
          violations.push(`${file}: localStorage getItem/setItem with privileged token key collection ${collectionName}`);
        }
      }
      for (const collectionName of findTokenKeyCollections(source, forbiddenSessionStorageTokenKeys)) {
        if (hasCollectionStorageReadWrite(source, collectionName, 'sessionStorage')) {
          violations.push(`${file}: sessionStorage getItem/setItem with privileged token key collection ${collectionName}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
