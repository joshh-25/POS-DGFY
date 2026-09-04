import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => fs.readFileSync(path.resolve(testDir, relativePath), 'utf8');

describe('Facebook storefront icon treatment', () => {
  it('uses the official Facebook blue in shared contact and footer icon renderers', () => {
    expect(readSource('../features/shared-storefront/utils/storefrontDisplayUtils.jsx')).toContain('fill="#1877F2"');
    expect(readSource('../shared/components/storefront/sections/StorefrontFooterSection.jsx')).toContain('fill="#1877F2"');
  });
});
