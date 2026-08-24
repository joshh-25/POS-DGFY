import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Retail storefront route boundary', () => {
  it('dispatches Retail catalog, checkout, and storefront sections to Retail owners', () => {
    const routeContainer = readSource('app/pages/StorefrontCatalogRouteContainer.jsx');
    const retailRouteContainer = readSource('modes/retail/storefront/pages/RetailStorefrontRouteContainer.jsx');
    const classicCatalog = readSource('shared/components/storefront/StorefrontClassicCatalog.jsx');
    const retailCatalog = readSource('modes/retail/storefront/pages/RetailCatalogRoutePage.jsx');
    const retailSections = readSource('modes/retail/storefront/pages/RetailStorefrontRoutePage.jsx');

    expect(routeContainer).toContain('RetailStorefrontRouteContainer');
    expect(routeContainer).not.toContain("from '../../modes/retail/checkout/pages/RetailOrderPage.jsx'");
    expect(routeContainer).not.toContain("from '../../modes/retail/tracking/pages/RetailTrackingRouteContainer.jsx'");
    expect(retailRouteContainer).toContain('RetailProductDetailsRoute');
    expect(retailRouteContainer).toContain('RetailCatalogRoutePage');
    expect(retailRouteContainer).toContain('RetailStorefrontRoutePage');
    expect(retailRouteContainer).toContain('RetailOrderPage');
    expect(retailRouteContainer).toContain('RetailTrackingRouteContainer');
    expect(retailCatalog).toContain('RetailProductCard');
    expect(retailSections).toContain('palette="retail"');
    expect(classicCatalog).not.toContain('RetailProductCard');
    expect(classicCatalog).not.toContain('RetailOrderPage');
    expect(classicCatalog).not.toContain('isRetailMode');
  });
});
