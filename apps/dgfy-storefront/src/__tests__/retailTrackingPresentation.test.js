import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildFnbTrackingRouteProps } from '../modes/fnb/tracking/model/buildFnbTrackingRouteProps.js';
import { buildRetailTrackingRouteProps } from '../modes/retail/tracking/model/buildRetailTrackingRouteProps.js';

const source = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('retail tracking presentation', () => {
  it('keeps the F&B tracking contract on its default presentation', () => {
    const props = buildFnbTrackingRouteProps({ checkoutTab: 'track' });

    expect(props.page.presentation).toEqual({
      backLabel: 'Back to Menu',
      returnToCatalog: true,
    });
  });

  it('keeps Retail tracking choices in the Retail-owned route', () => {
    const props = buildRetailTrackingRouteProps({ checkoutTab: 'track' });
    const retailRoute = source('modes/retail/tracking/pages/RetailTrackingRouteContainer.jsx');
    const activeView = source('modes/retail/tracking/components/RetailTrackingActiveView.jsx');

    expect(props.page.presentation).toEqual({ backLabel: 'Back to Items', returnToCatalog: true });
    expect(retailRoute).not.toContain('FnbTrackingRouteContainer');
    expect(activeView).not.toContain('presentation.showTrustStrip');
    expect(activeView).not.toContain('Live tracking');
  });

  it('returns to the current storefront catalog and focuses its items section', () => {
    const activeView = source('modes/retail/tracking/components/RetailTrackingActiveView.jsx');

    expect(activeView).toContain('goStoreCatalogPage();');
    expect(activeView).toContain("getElementById('storefront-catalog-section')");
    expect(activeView).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
    expect(activeView).toContain('onClick={handleBackToCatalog}');
  });
});
