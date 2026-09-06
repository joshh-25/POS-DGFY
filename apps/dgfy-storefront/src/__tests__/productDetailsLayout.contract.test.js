import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(resolve(here, '../modes/fnb/storefront/pages/FnbProductDetailsPage.jsx'), 'utf8');
const pairingsSource = readFileSync(resolve(here, '../modes/fnb/storefront/components/FnbRecommendedPairings.jsx'), 'utf8');
const retailDetailsSource = readFileSync(resolve(here, '../modes/retail/storefront/pages/RetailProductDetailsRoute.jsx'), 'utf8');
const routeContainerSource = readFileSync(resolve(here, '../app/pages/StorefrontCatalogRouteContainer.jsx'), 'utf8');
const detailRuntimeSource = readFileSync(resolve(here, '../modes/fnb/storefront/hooks/useFnbProductDetailsRoute.js'), 'utf8');

describe('product-details responsive layout contract', () => {
  it('keeps both columns and nested content shrinkable instead of overflowing into the adjacent column', () => {
    expect(pageSource).toContain("gridTemplateColumns: isMobileViewport ? 'minmax(0, 1fr)' : 'minmax(0, 1.05fr) minmax(0, 0.95fr)'");
    expect(pageSource).toContain("gridTemplateColumns: 'minmax(0, 1fr)'");
    expect(pageSource).toContain("alignItems: 'start',\n          minWidth: 0,\n          width: '100%'");
    expect(pageSource).toContain("gap: sp(2), minWidth: 0, width: '100%', position: isMobileViewport ? 'static' : 'sticky'");
    expect(pageSource).toContain("gap: sp(2),\n              minWidth: 0,\n              width: '100%'");
  });

  it('keeps desktop recommended pairing cards equal-width and shrinkable', () => {
    expect(pairingsSource).toContain("gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'");
    expect(pairingsSource).toContain("minWidth: 0, width: '100%', boxSizing: 'border-box', overflow: 'hidden'");
  });

  it('keeps recommended pairings shared across Retail and Simple/MSME product details', () => {
    expect(pageSource).toContain('FnbRecommendedPairings');
    expect(retailDetailsSource).toContain('FnbProductDetailsPage');
    expect(routeContainerSource).toContain('if (isRetailMode && isFnbDetailsSubpage)');
    expect(routeContainerSource).toContain('if (isFnbDetailsSubpage)');
    expect(detailRuntimeSource).toContain('buildSimpleRelatedItems');
    expect(detailRuntimeSource).toContain('if (isSimpleMode)');
  });
});
