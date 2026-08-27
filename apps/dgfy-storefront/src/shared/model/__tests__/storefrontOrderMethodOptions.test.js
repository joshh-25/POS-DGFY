import { describe, expect, it } from 'vitest';
import {
  buildStorefrontOrderMethodOptions,
  isEnabledStorefrontOrderMethod,
  resolveLocationFulfillmentSupport
} from '../storefrontOrderMethodOptions.js';

// #1093: the storefront never offered fewer than "both delivery and pickup", even at a
// location whose supports_delivery/supports_pickup columns say otherwise -- the customer
// could complete checkout on a disabled method and only fail on submit with a 409. These
// lock down the fail-open resolver that closes that gap.
describe('isEnabledStorefrontOrderMethod', () => {
  it('is enabled when the location support flag is explicitly true', () => {
    expect(isEnabledStorefrontOrderMethod('delivery', { supports_delivery: true })).toBe(true);
  });

  it('is disabled only when the flag is explicitly false', () => {
    expect(isEnabledStorefrontOrderMethod('pickup', { supports_pickup: false })).toBe(false);
  });

  it('fails open when the flag is missing entirely (older cached payload)', () => {
    expect(isEnabledStorefrontOrderMethod('delivery', {})).toBe(true);
    expect(isEnabledStorefrontOrderMethod('pickup', null)).toBe(true);
  });

  it('is disabled for a method with no location-support mapping', () => {
    expect(isEnabledStorefrontOrderMethod('unknown_method', { supports_delivery: true })).toBe(false);
  });
});

describe('resolveLocationFulfillmentSupport', () => {
  const primary = { location_id: 1, is_primary_storefront: true, supports_delivery: true, supports_pickup: false };
  const secondary = { location_id: 2, is_primary_storefront: false, supports_delivery: false, supports_pickup: true };

  it('prefers the customer-selected location', () => {
    const result = resolveLocationFulfillmentSupport({
      storeLocations: [primary, secondary],
      selectedLocationId: 2
    });
    expect(result).toBe(secondary);
  });

  it('falls back to the primary storefront location when none is selected', () => {
    const result = resolveLocationFulfillmentSupport({ storeLocations: [secondary, primary] });
    expect(result).toBe(primary);
  });

  it('falls back to the discovery profile snapshot when no locations have loaded yet', () => {
    const selectedStore = { supports_delivery: true, supports_pickup: false };
    const result = resolveLocationFulfillmentSupport({ selectedStore, storeLocations: [] });
    expect(result).toBe(selectedStore);
  });

  it('falls back to the first active location if none is marked primary', () => {
    const inactive = { location_id: 3, is_active: false, supports_delivery: true, supports_pickup: true };
    const active = { location_id: 4, is_active: true, supports_delivery: true, supports_pickup: false };
    const result = resolveLocationFulfillmentSupport({ storeLocations: [inactive, active] });
    expect(result).toBe(active);
  });
});

describe('buildStorefrontOrderMethodOptions', () => {
  const candidates = [
    { value: 'delivery', label: 'Delivery' },
    { value: 'pickup', label: 'Pickup' }
  ];

  it('offers both when the location supports both', () => {
    const result = buildStorefrontOrderMethodOptions(candidates, { supports_delivery: true, supports_pickup: true });
    expect(result.map((o) => o.value)).toEqual(['delivery', 'pickup']);
  });

  it('offers only delivery for a delivery-only location (Surebiz)', () => {
    const result = buildStorefrontOrderMethodOptions(candidates, { supports_delivery: true, supports_pickup: false });
    expect(result.map((o) => o.value)).toEqual(['delivery']);
  });

  it('offers only pickup for a pickup-only location', () => {
    const result = buildStorefrontOrderMethodOptions(candidates, { supports_delivery: false, supports_pickup: true });
    expect(result.map((o) => o.value)).toEqual(['pickup']);
  });

  it('never adds a method outside the candidate set, even if supported', () => {
    // A mode-scoped candidate list (e.g. retail's delivery/pickup-only options) must not
    // gain dine_in/takeout back just because a location's supports_dine_in is true.
    const result = buildStorefrontOrderMethodOptions(candidates, {
      supports_delivery: true,
      supports_pickup: true,
      supports_dine_in: true
    });
    expect(result.map((o) => o.value)).toEqual(['delivery', 'pickup']);
  });
});
