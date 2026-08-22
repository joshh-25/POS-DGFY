import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('storefront load failure presentation', () => {
  it('wraps the store route in a shared profile loading boundary', () => {
    const app = readSource('StorefrontApp.jsx');

    expect(app).toContain('<StorefrontLoadBoundary');
    expect(app).toContain('hasStoreProfile={Boolean(selectedStore)}');
    expect(app).toContain('onRetry={refreshStorePageForTenantSetup}');
    expect(app).toContain('onBackToDiscovery={goDiscovery}');
    expect(app).toContain('isStorePage && selectedStore && !isServicesTrackingPage');
    expect(app).toContain('<StorefrontCartDrawerShellContainer {...storefrontCartDrawerShellProps} />');
  });

  it('keeps catalog-only errors inside the loaded industry storefront', () => {
    const boundary = readSource('shared/components/storefront/StorefrontLoadBoundary.jsx');

    expect(boundary).toContain('if (hasStoreProfile) return children;');
    expect(boundary).toContain('if (errorMessage && !isLoading)');
  });

  it('forwards image fetch priority without triggering the React unknown-prop warning', () => {
    const image = readSource('shared/components/storefront/StorefrontResponsiveImage.jsx');

    expect(image).toContain('fetchPriority,');
    expect(image).toContain('fetchpriority={fetchPriority}');
    expect(image).not.toContain('<img\n        {...imageProps}\n        fetchPriority=');
  });
});
