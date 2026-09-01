import { describe, expect, it } from 'vitest';
import {
  NO_FULFILLMENT_METHOD_NOTICE,
  buildCheckoutSectionNumbers,
  resolveFulfillmentSelectorPresentation
} from './storefrontFulfillmentPresentation.js';

describe('resolveFulfillmentSelectorPresentation', () => {
  it('shows the chooser and no notice when two or more methods are available', () => {
    const result = resolveFulfillmentSelectorPresentation([
      { value: 'delivery', label: 'Delivery', available: true },
      { value: 'pickup', label: 'Pickup', available: true }
    ]);

    expect(result.showSelector).toBe(true);
    expect(result.soleOption).toBeNull();
    expect(result.notice).toBe('');
  });

  it('hides the chooser and states the delivery notice when only delivery is available', () => {
    const result = resolveFulfillmentSelectorPresentation([
      { value: 'delivery', label: 'Delivery', available: true },
      { value: 'pickup', label: 'Pickup', available: false }
    ]);

    expect(result.showSelector).toBe(false);
    expect(result.soleOption.value).toBe('delivery');
    expect(result.notice).toBe('This store delivers your order.');
  });

  it('hides the chooser and states the pickup notice when only pickup is available', () => {
    const result = resolveFulfillmentSelectorPresentation([
      { value: 'delivery', label: 'Delivery', available: false },
      { value: 'pickup', label: 'Pickup', available: true }
    ]);

    expect(result.showSelector).toBe(false);
    expect(result.soleOption.value).toBe('pickup');
    expect(result.notice).toBe('This order will be ready for pickup at the store.');
  });

  it('hides the chooser and shows the defensive notice when zero methods are available', () => {
    const result = resolveFulfillmentSelectorPresentation([
      { value: 'delivery', label: 'Delivery', available: false },
      { value: 'pickup', label: 'Pickup', available: false }
    ]);

    expect(result.showSelector).toBe(false);
    expect(result.soleOption).toBeNull();
    expect(result.notice).toBe(NO_FULFILLMENT_METHOD_NOTICE);
  });

  it('treats an empty candidate array as not-yet-resolved and keeps the chooser on', () => {
    const result = resolveFulfillmentSelectorPresentation([]);

    expect(result.showSelector).toBe(true);
    expect(result.availableOptions).toEqual([]);
    expect(result.notice).toBe('');
  });

  it('falls back to a labelled statement for an unknown method value', () => {
    const result = resolveFulfillmentSelectorPresentation([
      { value: 'curbside', label: 'Curbside', available: true }
    ]);

    expect(result.showSelector).toBe(false);
    expect(result.notice).toBe('This store fulfills your order via Curbside.');
  });

  it('does not throw on non-array input', () => {
    expect(() => resolveFulfillmentSelectorPresentation(null)).not.toThrow();
    expect(() => resolveFulfillmentSelectorPresentation(undefined)).not.toThrow();
    expect(resolveFulfillmentSelectorPresentation(null).showSelector).toBe(true);
  });

  it('numbers address after whichever checkout sections remain', () => {
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: true, showTimingStep: true })).toEqual({ orderMethod: 1, timing: 2, address: 3, notes: 3 });
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: false, showTimingStep: true })).toEqual({ orderMethod: null, timing: 1, address: 2, notes: 2 });
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: true, showTimingStep: false })).toEqual({ orderMethod: 1, timing: null, address: 2, notes: 2 });
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: false, showTimingStep: false })).toEqual({ orderMethod: null, timing: null, address: 1, notes: 1 });
  });

  it('bumps notes past address only when the order is a delivery order (#1266)', () => {
    // Both fulfillment chooser and timing step shown -- the collapsed-steps regression case
    // isn't reachable here, but this establishes the baseline delivery/non-delivery split.
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: true, showTimingStep: true, isDeliveryOrder: true }))
      .toEqual({ orderMethod: 1, timing: 2, address: 3, notes: 4 });
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: true, showTimingStep: true, isDeliveryOrder: false }))
      .toEqual({ orderMethod: 1, timing: 2, address: 3, notes: 3 });
  });

  it('keeps notes numbering correct for a collapsed order-method step, crossed with isDeliveryOrder (#1266)', () => {
    // #1217: one available fulfillment method hides the chooser -- this is the exact
    // collapsed-steps scenario #1266 reports as producing a wrong hardcoded "4." for notes.
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: false, showTimingStep: true, isDeliveryOrder: true }))
      .toEqual({ orderMethod: null, timing: 1, address: 2, notes: 3 });
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: false, showTimingStep: true, isDeliveryOrder: false }))
      .toEqual({ orderMethod: null, timing: 1, address: 2, notes: 2 });
  });

  it('keeps notes numbering correct for a collapsed timing step, crossed with isDeliveryOrder (#1266)', () => {
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: true, showTimingStep: false, isDeliveryOrder: true }))
      .toEqual({ orderMethod: 1, timing: null, address: 2, notes: 3 });
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: true, showTimingStep: false, isDeliveryOrder: false }))
      .toEqual({ orderMethod: 1, timing: null, address: 2, notes: 2 });
  });

  it('keeps notes numbering correct when both order-method and timing steps are collapsed, crossed with isDeliveryOrder (#1266)', () => {
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: false, showTimingStep: false, isDeliveryOrder: true }))
      .toEqual({ orderMethod: null, timing: null, address: 1, notes: 2 });
    expect(buildCheckoutSectionNumbers({ showOrderMethodSelector: false, showTimingStep: false, isDeliveryOrder: false }))
      .toEqual({ orderMethod: null, timing: null, address: 1, notes: 1 });
  });
});
