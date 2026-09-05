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

  it('adapts to the shared ResponsiveImage shell, forwarding props under this app\'s own prop contract', () => {
    // StorefrontResponsiveImage.jsx is now a thin wrapper around the shared
    // packages/web-core/src/components/media/ResponsiveImage.jsx -- the
    // fetchPriority/fetchpriority DOM-attribute handling this test used to
    // assert here now lives there instead (see ResponsiveImage.test.jsx for
    // that contract). This test only checks the adapter's own job: renaming
    // `imageSources` to `sources` and forwarding every other prop through.
    const image = readSource('shared/components/storefront/StorefrontResponsiveImage.jsx');

    expect(image).toContain("import { ResponsiveImage } from '../../../../../../packages/web-core/src/components/media/ResponsiveImage.jsx';");
    expect(image).toContain('({ imageSources, ...rest })');
    expect(image).toContain('<ResponsiveImage sources={imageSources} {...rest} />');
  });
});
