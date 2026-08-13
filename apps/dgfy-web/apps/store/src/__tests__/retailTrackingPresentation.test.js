import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildFnbTrackingRouteProps } from '../modes/fnb/tracking/model/buildFnbTrackingRouteProps.js';

const source = (relativePath) => fs.readFileSync(path.resolve(process.cwd(), 'apps/dgfy-web/apps/store/src', relativePath), 'utf8');

describe('retail tracking presentation', () => {
  it('passes the retail presentation flag to the tracking page contract', () => {
    const props = buildFnbTrackingRouteProps({ checkoutTab: 'track', isRetailMode: true });

    expect(props.page.isRetailMode).toBe(true);
    expect(props.route.isRetailMode).toBeUndefined();
  });

  it('hides the shared hardcoded trust strip only for retail', () => {
    const activeView = source('modes/fnb/tracking/components/FnbTrackingActiveView.jsx');

    expect(activeView).toContain('!isRetailPresentation && <div');
    expect(activeView).toContain("{isRetailPresentation ? 'Back to Items' : 'Back to Menu'}");
  });

  it('returns to the current storefront catalog and focuses its items section', () => {
    const activeView = source('modes/fnb/tracking/components/FnbTrackingActiveView.jsx');

    expect(activeView).toContain('goStoreCatalogPage();');
    expect(activeView).toContain("getElementById('storefront-catalog-section')");
    expect(activeView).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
  });
});
