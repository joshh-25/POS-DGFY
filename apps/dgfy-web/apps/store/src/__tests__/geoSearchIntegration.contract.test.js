import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const loaderPath = path.resolve(__dirname, '../discovery/hooks/useDiscoveryStoreLoader.js');

describe('storefront geo-search integration contract', () => {
  it('keeps visible discovery search on the authoritative discovery endpoint', () => {
    const source = fs.readFileSync(loaderPath, 'utf8');

    expect(source).toContain('/api/v1/storefront/discovery?');
    expect(source).toContain('discoveryAbortControllerRef.current?.abort?.()');
    expect(source).toContain('requestSequence === discoveryRequestSequenceRef.current');
    // Real AbortSignal support + opt-in retry (issue #181) -- the signal
    // must still reach requestJson so aborting a superseded request is
    // actually honoured, and retry is enabled for this one call site.
    expect(source).toContain('retry: true');
    expect(source).toContain('discoveryController ? { signal: discoveryController.signal } : {}');
    expect(source).not.toContain('searchNearbyGeoStores({');
    expect(source).not.toContain('/api/v1/storefront/geo-search');
  });
});
