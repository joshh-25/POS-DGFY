import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Simple tracking route boundary', () => {
  it('keeps checkout and tracking on the Simple MSME presentation palette', () => {
    const checkoutHeader = readSource('modes/simple/checkout/components/SimpleCheckoutStoreHeader.jsx');
    const checkoutJourney = readSource('modes/simple/checkout/components/SimpleCheckoutJourneyHeader.jsx');
    const trackingFrame = readSource('modes/simple/tracking/components/SimpleTrackingRouteFrame.jsx');
    const trackingPage = readSource('modes/simple/tracking/components/SimpleTrackingRoutePage.jsx');

    expect(checkoutHeader).toContain("width: '100vw'");
    expect(checkoutHeader).toContain("marginLeft: 'calc(50% - 50vw)'");
    expect(checkoutHeader).toContain("const SIMPLE_BRAND = '#176B3A'");
    expect(checkoutJourney).toContain("const SIMPLE_ACCENT = '#176B3A'");
    expect(trackingFrame).toContain("minHeight: '100vh'");
    expect(trackingFrame).toContain("background: '#fff'");
    expect(trackingPage).toContain("dgfyPrimary: '#176B3A'");
    expect(trackingPage).toContain("dgfyBg: '#FFF8E7'");
    expect(trackingPage).not.toContain("dgfyPrimary: '#1a4e8d'");
    expect(trackingPage).toContain('gridTemplateColumns: `repeat(${viewModel.steps.length}, minmax(0, 1fr))`');
    expect(trackingPage).toContain("overflow: 'visible'");
    expect(trackingPage).toContain('{!isMobileViewport ? (');
    expect(trackingPage).toContain('<TrackingStatusIcon status={viewModel.status} color={dgfyPrimary} />');
    expect(trackingPage).toContain('viewModel.completed && showCompletedTrackingCard');
    expect(trackingPage).toContain('SimpleTrackingCompletedView');
    expect(readSource('modes/simple/tracking/components/SimpleTrackingCompletedView.jsx')).toContain('data-testid="simple-tracking-completed"');
  });

  it('uses a Simple-owned adapter, runtime, and route without importing F&B tracking UI', () => {
    const adapter = readSource('modes/simple/tracking/model/simpleTrackingAdapter.js');
    const runtime = readSource('modes/simple/tracking/hooks/useSimpleTrackingRuntime.js');
    const route = readSource('modes/simple/tracking/pages/SimpleTrackingRouteContainer.jsx');
    const page = readSource('modes/simple/tracking/components/SimpleTrackingRoutePage.jsx');

    expect(adapter).toContain("mode: 'simple'");
    expect(runtime).toContain('useSimpleTrackingRuntime');
    expect(runtime).toContain('toSimpleTrackingViewState');
    expect(route).toContain('SimpleTrackingRoutePage');
    expect(page).not.toContain('FnbTracking');
    expect(page).toContain("backLabel || 'Back to Items'");
  });

  // Phase 142 (#823) carried amount_paid/balance_due into the payload model. Phase 151 (#826)
  // consolidated the render side into one shared DownpaymentTrackingSummary component (previously
  // five hand-rolled copies that only ever rendered balanceDue, never amountPaid) -- assert the
  // payload model still carries the split and the route page renders through the shared component.
  it('carries the downpayment balance-due split through the payload model and renders it via the shared component', () => {
    const payloadModel = readSource('modes/simple/tracking/model/simpleTrackingPayload.js');
    const page = readSource('modes/simple/tracking/components/SimpleTrackingRoutePage.jsx');

    expect(payloadModel).toContain('paymentStatus:');
    expect(payloadModel).toContain('balanceDue:');
    expect(payloadModel).toContain('order?.balance_due');
    expect(page).toContain("import { DownpaymentTrackingSummary } from '../../../../shared/components/tracking/DownpaymentTrackingSummary.jsx';");
    expect(page).toContain('<DownpaymentTrackingSummary trackingResult={viewModel.trackingResult}');
  });

  it('mounts Simple tracking at the app route boundary and leaves other modes on their paths', () => {
    const appRoute = readSource('app/pages/StorefrontCatalogRouteContainer.jsx');
    const retailRoute = readSource('modes/retail/storefront/pages/RetailStorefrontRouteContainer.jsx');
    const classicCatalog = readSource('shared/components/storefront/StorefrontClassicCatalog.jsx');
    const shell = readSource('app/pages/StorefrontCartDrawerShellContainer.jsx');

    expect(appRoute).toContain('SimpleTrackingRouteContainer');
    expect(appRoute).toContain('isSimpleMode && isTrackSubpage');
    expect(classicCatalog).not.toContain('FnbTrackingRouteContainer');
    expect(classicCatalog).not.toContain('RetailTrackingRouteContainer');
    expect(appRoute).toContain('RetailStorefrontRouteContainer');
    expect(retailRoute).toContain('RetailTrackingRouteContainer');
    expect(shell).toContain('!isSimpleMode && !isRetailMode && !isServicesMode && <FnbTrackingRouteContainer');
    expect(shell).toContain('isRetailMode && <RetailTrackingRouteContainer');
  });
});

describe('Retail tracking route boundary', () => {
  it('uses Retail-owned adapter, runtime, and route modules', () => {
    const adapter = readSource('modes/retail/tracking/model/retailTrackingAdapter.js');
    const runtime = readSource('modes/retail/tracking/hooks/useRetailTrackingRuntime.js');
    const route = readSource('modes/retail/tracking/pages/RetailTrackingRouteContainer.jsx');
    const routeProps = readSource('modes/retail/tracking/model/buildRetailTrackingRouteProps.js');

    expect(adapter).toContain("mode: 'retail'");
    expect(runtime).toContain('useRetailTrackingRuntime');
    expect(route).toContain('RetailTrackingRoutePage');
    expect(route).not.toContain('FnbTrackingRouteContainer');
    expect(routeProps).toContain("backLabel: 'Back to Items'");
    expect(routeProps).toContain('showTrustStrip: false');
  });

  // Phase 142 (#823) carried the split into the payload model. Phase 151 (#826) consolidated both
  // Retail views (active + completed) onto the shared DownpaymentTrackingSummary component.
  it('carries the downpayment balance-due split through the payload model and renders it via the shared component in both views', () => {
    const payloadModel = readSource('modes/retail/tracking/model/retailTrackingPayload.js');
    const activeView = readSource('modes/retail/tracking/components/RetailTrackingActiveView.jsx');
    const completedView = readSource('modes/retail/tracking/components/RetailTrackingCompletedView.jsx');

    expect(payloadModel).toContain('paymentStatus:');
    expect(payloadModel).toContain('balanceDue:');
    expect(payloadModel).toContain('order?.balance_due');
    expect(activeView).toContain("import { DownpaymentTrackingSummary } from '../../../../shared/components/tracking/DownpaymentTrackingSummary.jsx';");
    expect(activeView).toContain('<DownpaymentTrackingSummary trackingResult={trackingResult}');
    expect(completedView).toContain("import { DownpaymentTrackingSummary } from '../../../../shared/components/tracking/DownpaymentTrackingSummary.jsx';");
    expect(completedView).toContain('<DownpaymentTrackingSummary trackingResult={trackingResult}');
  });
});

describe('F&B tracking route boundary', () => {
  // Phase 142 (#823): fnbTrackingPayload.js is the payload model actually consumed by
  // useFnbTrackingRuntime.js (confirmed by import graph), not the separate legacy
  // tracking/fnbAdapter.js registry exercised by fnbOrderTracking.contract.test.js. Phase 151
  // (#826) consolidated both F&B views onto the shared DownpaymentTrackingSummary component.
  it('carries the downpayment balance-due split through the payload model and renders it via the shared component in both views', () => {
    const payloadModel = readSource('modes/fnb/tracking/model/fnbTrackingPayload.js');
    const activeView = readSource('modes/fnb/tracking/components/FnbTrackingActiveView.jsx');
    const completedView = readSource('modes/fnb/tracking/components/FnbTrackingCompletedView.jsx');

    expect(payloadModel).toContain('paymentStatus:');
    expect(payloadModel).toContain('balanceDue:');
    expect(payloadModel).toContain('order?.balance_due');
    expect(activeView).toContain("import { DownpaymentTrackingSummary } from '../../../../shared/components/tracking/DownpaymentTrackingSummary.jsx';");
    expect(activeView).toContain('<DownpaymentTrackingSummary trackingResult={trackingResult}');
    expect(completedView).toContain("import { DownpaymentTrackingSummary } from '../../../../shared/components/tracking/DownpaymentTrackingSummary.jsx';");
    expect(completedView).toContain('<DownpaymentTrackingSummary trackingResult={trackingResult}');
  });
});
