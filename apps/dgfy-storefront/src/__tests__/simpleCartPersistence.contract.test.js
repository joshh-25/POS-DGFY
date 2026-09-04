import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const appSource = fs.readFileSync(path.resolve(testDir, '../StorefrontApp.jsx'), 'utf8');

describe('Simple MSME storefront cart persistence integration', () => {
  it('participates in the existing per-store cart persistence scope', () => {
    expect(appSource).toContain('isFnbMode || isServicesMode || isRetailMode || isSimpleMode');
    expect(appSource).toContain("isSimpleMode ? 'simple' : ''");
  });
});
