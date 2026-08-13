import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildFnbTrackingRouteProps } from '../modes/fnb/tracking/model/buildFnbTrackingRouteProps.js';

const source = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('retail tracking presentation', () => {
  it('keeps the F&B tracking contract on its default presentation', () => {
    const props = buildFnbTrackingRouteProps({ checkoutTab: 'track' });

    expect(props.page.presentation).toEqual({
      backLabel: 'Back to Menu',
      returnToCatalog: false,
      showTrustStrip: true,
    });
  });

  it('keeps Retail tracking choices in the Retail-owned route', () => {
    const retailRoute = source('modes/retail/tracking/pages/RetailTrackingRouteContainer.jsx');
    const activeView = source('modes/fnb/tracking/components/FnbTrackingActiveView.jsx');

    expect(retailRoute).toContain("backLabel: 'Back to Items'");
    expect(retailRoute).toContain('showTrustStrip: false');
    expect(retailRoute).toContain('returnToCatalog: true');
    expect(activeView).not.toContain('isRetailPresentation');
  });

  it('returns to the current storefront catalog and focuses its items section', () => {
    const activeView = source('modes/fnb/tracking/components/FnbTrackingActiveView.jsx');

    expect(activeView).toContain('goStoreCatalogPage();');
    expect(activeView).toContain("getElementById('storefront-catalog-section')");
    expect(activeView).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
  });
});
