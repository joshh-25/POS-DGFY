import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appPath = path.resolve(__dirname, '../StorefrontApp.jsx');

describe('storefront geo-search integration contract', () => {
  it('connects the dedicated geo-search service into discovery loading with fallback', () => {
    const source = fs.readFileSync(appPath, 'utf8');

    expect(source).toContain("searchNearbyStores as searchNearbyGeoStores");
    expect(source).toContain('searchNearbyGeoStores({');
    expect(source).toContain("source: 'geo_search'");
    expect(source).toContain('falling back to discovery search');
    expect(source).toContain('/api/v1/storefront/discovery?');
  });
});
