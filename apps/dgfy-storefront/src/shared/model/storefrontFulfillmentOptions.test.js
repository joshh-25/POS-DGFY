import { describe, expect, it } from 'vitest';
import { resolveStorefrontFulfillmentOptions } from './storefrontFulfillmentOptions.js';

describe('resolveStorefrontFulfillmentOptions', () => {
  it.each([
    ['delivery only', { supports_delivery: true, supports_pickup: false }, [true, false]],
    ['pickup only', { supports_delivery: false, supports_pickup: true }, [false, true]],
    ['both enabled', { supports_delivery: true, supports_pickup: true }, [true, true]],
    ['legacy disabled state', { supports_delivery: false, supports_pickup: false }, [false, false]],
    ['missing flags', {}, [true, true]]
  ])('keeps both candidates for %s', (_name, location, availability) => {
    expect(resolveStorefrontFulfillmentOptions(location)).toEqual([
      { value: 'delivery', label: 'Delivery', available: availability[0] },
      { value: 'pickup', label: 'Pickup', available: availability[1] }
    ]);
  });
});
