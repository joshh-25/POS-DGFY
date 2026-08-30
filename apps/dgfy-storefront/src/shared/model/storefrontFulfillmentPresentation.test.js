import { describe, expect, it } from 'vitest';
import {
  NO_FULFILLMENT_METHOD_NOTICE,
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
});
