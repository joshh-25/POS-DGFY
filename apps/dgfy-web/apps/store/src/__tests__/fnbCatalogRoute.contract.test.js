import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('F&B catalog route boundary', () => {
  it('keeps the menu catalog and community presentation under F&B ownership', () => {
    const routeContainer = readSource('app/pages/StorefrontCatalogRouteContainer.jsx');
    const classicCatalog = readSource('shared/components/storefront/StorefrontClassicCatalog.jsx');
    const fnbCatalog = readSource('modes/fnb/storefront/pages/FnbCatalogRoutePage.jsx');
    const fnbStorefront = readSource('modes/fnb/storefront/pages/FnbStorefrontRoutePage.jsx');

    expect(routeContainer).toContain('FnbCatalogRoutePage');
    expect(routeContainer).toContain('FnbStorefrontRoutePage');
    expect(fnbCatalog).toContain('FnbProductCard');
    expect(fnbCatalog).toContain('StorefrontCatalogToolbar');
    expect(fnbCatalog).toContain('FnbCatalogPagination');
    expect(fnbStorefront).toContain('FnbCommunitySection');
    expect(fnbStorefront).toContain('FnbItemReviewModal');
    expect(classicCatalog).not.toContain('FnbProductCard');
    expect(classicCatalog).not.toContain('FnbCommunitySection');
    expect(classicCatalog).not.toContain('FnbItemReviewModal');
  });
});
