import { describe, expect, it } from 'vitest';

import { getTrackingFlowForOrderMethod, RetailTrackingAdapter } from '../modes/retail/tracking/model/retailTrackingAdapter.js';
import { fnbTrackingAdapter } from '../modes/fnb/tracking/model/fnbTrackingAdapter.js';
import { simpleTrackingAdapter } from '../modes/simple/tracking/model/simpleTrackingAdapter.js';

// Phase 211 (#1180). No existing test exercised retailTrackingAdapter.js's own normalize/timeline
// logic directly (confirmed by exhaustive search: retailTrackingPresentation.test.js only tests
// route-presentation config, not the adapter itself) -- this is a new, focused file mirroring the
// sibling precedent already established for simpleTrackingAdapter.test.js
// (apps/dgfy-storefront/src/__tests__/simpleTrackingAdapter.test.js), rather than a parallel
// duplicate of an existing suite.
describe('Retail tracking adapter -- Packed step (Phase 211, #1180)', () => {
  it('includes the Packed step for both delivery and pickup flows', () => {
    expect(getTrackingFlowForOrderMethod('delivery').map((step) => step.id))
      .toEqual(['placed', 'confirmed', 'preparing', 'packed', 'out_for_delivery', 'completed']);
    expect(getTrackingFlowForOrderMethod('pickup').map((step) => step.id))
      .toEqual(['placed', 'confirmed', 'preparing', 'packed', 'ready_for_pickup', 'completed']);
  });

  it('resolves activeIndex correctly for a packed delivery order', () => {
    const normalized = RetailTrackingAdapter.normalize({
      data: {
        tracking_pin: 'SK-AB12CD',
        status: 'packed',
        status_label: 'Packed',
        order_method: 'delivery',
        order: { items: [] }
      }
    }, { rawReference: 'SK-AB12CD', storeSlug: 'retail-store' });

    const packedStep = normalized.timeline.find((step) => step.id === 'packed');
    const preparingStep = normalized.timeline.find((step) => step.id === 'preparing');
    const handoffStep = normalized.timeline.find((step) => step.id === 'out_for_delivery');

    expect(packedStep.state).toBe('active');
    expect(preparingStep.state).toBe('done');
    expect(handoffStep.state).toBe('pending');
  });

  it('still resolves correctly for an order that skipped packed entirely (preparing -> out_for_delivery)', () => {
    const normalized = RetailTrackingAdapter.normalize({
      data: {
        tracking_pin: 'SK-AB12CD',
        status: 'out_for_delivery',
        status_label: 'Out for delivery',
        order_method: 'delivery',
        order: { items: [] }
      }
    }, { rawReference: 'SK-AB12CD', storeSlug: 'retail-store' });

    const packedStep = normalized.timeline.find((step) => step.id === 'packed');
    const handoffStep = normalized.timeline.find((step) => step.id === 'out_for_delivery');

    // `packed` simply renders as `done` -- the order's own activeIndex still resolves against
    // `out_for_delivery`'s position in the flow, unaffected by having skipped `packed`.
    expect(packedStep.state).toBe('done');
    expect(handoffStep.state).toBe('active');
  });

  it('resolves activeIndex correctly for a packed pickup order', () => {
    const normalized = RetailTrackingAdapter.normalize({
      data: {
        tracking_pin: 'SK-AB12CD',
        status: 'packed',
        status_label: 'Packed',
        order_method: 'pickup',
        order: { items: [] }
      }
    }, { rawReference: 'SK-AB12CD', storeSlug: 'retail-store' });

    const packedStep = normalized.timeline.find((step) => step.id === 'packed');
    const handoffStep = normalized.timeline.find((step) => step.id === 'ready_for_pickup');

    expect(packedStep.state).toBe('active');
    expect(handoffStep.state).toBe('pending');
  });
});

describe('F&B/Simple tracking adapters -- packed defensive fallback (Phase 211, #1180)', () => {
  it('F&B renders a packed order at the preparing position rather than rewinding to step 0', () => {
    const normalized = fnbTrackingAdapter.normalize({
      data: {
        tracking_pin: 'SK-AB12CD',
        status: 'packed',
        status_label: 'Packed',
        order_method: 'delivery',
        order: { items: [] }
      }
    }, { rawReference: 'SK-AB12CD', storeSlug: 'fnb-store' });

    const preparingStep = normalized.timeline.find((step) => step.id === 'preparing');
    const placedStep = normalized.timeline.find((step) => step.id === 'placed');

    expect(preparingStep.state).toBe('active');
    // If the defensive normalization were missing, this would incorrectly be 'active' instead --
    // the exact regression the fallback exists to prevent.
    expect(placedStep.state).toBe('done');
  });

  it('Simple renders a packed order at the preparing position rather than rewinding to step 0', () => {
    const normalized = simpleTrackingAdapter.normalize({
      data: {
        tracking_pin: 'SK-AB12CD',
        status: 'packed',
        status_label: 'Packed',
        order_method: 'delivery',
        order: { items: [] }
      }
    }, { rawReference: 'SK-AB12CD', storeSlug: 'simple-store' });

    const preparingStep = normalized.timeline.find((step) => step.id === 'preparing');
    const placedStep = normalized.timeline.find((step) => step.id === 'placed');

    expect(preparingStep.state).toBe('active');
    expect(placedStep.state).toBe('done');
  });
});
