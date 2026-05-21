import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../StorefrontApp.jsx');

describe('storefront geo-search integration contract', () => {
  it('keeps visible discovery search on the authoritative discovery endpoint', () => {
    const source = fs.readFileSync(appPath, 'utf8');

    expect(source).toContain('/api/v1/storefront/discovery?');
    expect(source).toContain('discoveryAbortControllerRef.current?.abort?.()');
    expect(source).toContain('requestSequence === discoveryRequestSequenceRef.current');
    expect(source).not.toContain('searchNearbyGeoStores({');
    expect(source).not.toContain('/api/v1/storefront/geo-search');
  });
});
