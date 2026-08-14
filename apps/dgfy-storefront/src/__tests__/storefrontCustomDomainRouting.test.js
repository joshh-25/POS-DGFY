// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  readRouteSlug,
  readStoreSubpage,
  setCustomStorefrontRouteContext,
  storePath
} from '../app/routing/storefrontRouting.js';

describe('custom storefront domain routing', () => {
  afterEach(() => setCustomStorefrontRouteContext(null));

  it('uses root-relative storefront routes after domain context is resolved', () => {
    setCustomStorefrontRouteContext({ slug: 'grand-matador', canonical_origin: 'https://grandmatador.com' });
    expect(storePath('grand-matador')).toBe('/');
    expect(storePath('grand-matador', 'order')).toBe('/order');
    expect(readRouteSlug()).toBe('grand-matador');
  });

  it('recognizes supported custom-host subpages and preserves DGFY fallback routes', () => {
    window.history.replaceState({}, '', '/track?pin=ABC123');
    setCustomStorefrontRouteContext({ slug: 'grand-matador', canonical_origin: 'https://grandmatador.com' });
    expect(readStoreSubpage()).toBe('track');
    setCustomStorefrontRouteContext(null);
    expect(storePath('grand-matador', 'track')).toBe('/tenant-store/grand-matador/track');
  });
});
