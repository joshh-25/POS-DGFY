import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('shared tracking relayout contract', () => {
  const activeViews = [
    'modes/fnb/tracking/components/FnbTrackingActiveView.jsx',
    'modes/retail/tracking/components/RetailTrackingActiveView.jsx',
    'modes/simple/tracking/components/SimpleTrackingRoutePage.jsx',
    'modes/services/tracking/components/ServicesTrackingRoutePage.jsx',
    'features/tracking/components/PickupTrackingMobileView.jsx',
  ];

  it('uses the shared responsive shell for every storefront mode', () => {
    for (const path of activeViews) {
      const view = source(path);
      expect(view).toContain('StorefrontTrackingLayout');
      expect(view).toContain('getTrackingFlowOrder');
      expect(view).toContain('StorefrontTrackingStatusCard');
      expect(view).toContain('StorefrontTrackingTimeline');
      expect(view).toContain('data-tracking-slot="map"');
      expect(view).toContain('data-tracking-slot="timeline"');
      expect(view).toContain('data-tracking-slot="status"');
    }
  });

  it('places the status card directly after the map on narrow tracking layouts', () => {
    for (const path of activeViews.slice(0, 4)) {
      const view = source(path);
      expect(view).toContain("getTrackingFlowOrder('status')");
      expect(view).toContain("getTrackingFlowOrder('timeline')");
      expect(view).toContain("getTrackingFlowOrder('map')");
    }

    const pickupMobileView = source(activeViews[4]);
    expect(pickupMobileView).toContain("getTrackingFlowOrder('status')");
    expect(pickupMobileView).toContain("getTrackingFlowOrder('timeline')");
    expect(pickupMobileView).toContain("getTrackingFlowOrder('map')");
  });

  it('keeps the existing map integration and removes duplicate hero references', () => {
    const commerceViews = activeViews.slice(0, 3).map(source).join('\n');
    const pickupMobileView = source('features/tracking/components/PickupTrackingMobileView.jsx');
    expect(commerceViews).toContain('TrackingRouteMap');
    expect(commerceViews).toContain('transformRequest');
    expect(pickupMobileView).toContain('mapHeight={TRACKING_MAP_HEIGHT}');
      expect(pickupMobileView).toContain('customerPin={null}');
      expect(commerceViews).not.toContain('Track Your Order');
      expect(commerceViews).not.toContain('Live updates from store to your doorstep');
      expect(commerceViews).not.toContain('Live tracking');
      expect(commerceViews).not.toContain('Your safety matters');
      expect(commerceViews).not.toContain('Top-rated support');
      expect(commerceViews).not.toContain('Order status</div>');
    expect(commerceViews).not.toContain('Order PIN</span>');
    expect(commerceViews).not.toContain('Order PIN:</span>');
  });

  it('uses catalog navigation for every Back action', () => {
    const fnb = source(activeViews[0]);
    const retail = source(activeViews[1]);
    const simple = source(activeViews[2]);
    const services = source(activeViews[3]);
    const pickup = source(activeViews[4]);

    expect(fnb).toContain('onClick={handleBackToCatalog}');
    expect(retail).toContain('onClick={handleBackToCatalog}');
    expect(simple).toContain('handleBackToItems');
    expect(services).toContain('onClick={actions.goStoreCatalogPage}');
    expect(pickup).toContain('onClick={handleBackToMenu}');
    for (const view of [fnb, retail, simple, pickup]) {
      expect(view).toContain("getElementById('storefront-catalog-section')");
    }
  });

  it('keeps the shared special-instructions divider as the only boundary divider', () => {
    const orderDetailsViews = [
      'modes/fnb/tracking/components/FnbTrackingActiveView.jsx',
      'modes/retail/tracking/components/RetailTrackingActiveView.jsx',
      'modes/simple/tracking/components/SimpleTrackingRoutePage.jsx',
      'features/tracking/components/PickupTrackingMobileView.jsx',
    ];

    for (const path of orderDetailsViews) {
      const view = source(path);
      const instructionsRender = view.lastIndexOf('<StorefrontOrderInstructions');
      expect(instructionsRender).toBeGreaterThan(-1);
      const boundary = view.slice(Math.max(0, instructionsRender - 320), instructionsRender);
      expect(boundary).not.toContain("borderBottom: '1px dashed #cbd5e1'");
    }
  });

  it('keeps the order-time-to-divider spacing compact', () => {
    const orderDetailsViews = [
      'modes/fnb/tracking/components/FnbTrackingActiveView.jsx',
      'modes/retail/tracking/components/RetailTrackingActiveView.jsx',
      'modes/simple/tracking/components/SimpleTrackingRoutePage.jsx',
      'features/tracking/components/PickupTrackingMobileView.jsx',
    ];

    for (const path of orderDetailsViews) {
      const view = source(path);
      const instructionsRender = view.lastIndexOf('<StorefrontOrderInstructions');
      const orderTimeLabel = view.lastIndexOf('>Order time</div>', instructionsRender);
      expect(orderTimeLabel).toBeGreaterThan(-1);
      const orderTimeBoundary = view.slice(Math.max(0, orderTimeLabel - 500), orderTimeLabel);
      expect(orderTimeBoundary).toContain('paddingBottom: 4');
    }
  });
});
