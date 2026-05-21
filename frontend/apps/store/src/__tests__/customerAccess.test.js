import { describe, expect, it } from 'vitest';
import {
  canUseBooking,
  canUseCheckout,
  canUseProductCart,
  canViewCatalog,
  getAccessCapabilities,
  getInventoryDisplayLabel
} from '../customerAccess.js';

describe('store customer access helpers', () => {
  it('preserves legacy transaction-capable defaults when metadata is absent', () => {
    expect(canViewCatalog({})).toBe(true);
    expect(canUseProductCart({})).toBe(true);
    expect(canUseCheckout({})).toBe(true);
    expect(canUseBooking({})).toBe(true);
  });

  it('uses additive access capabilities from discovery/profile rows', () => {
    const catalogOnlyStore = {
      access_capabilities: {
        profile: true,
        contact: true,
        catalog: true,
        inventory: true,
        inquiry: false,
        cart: false,
        quote: false,
        checkout: false,
        booking: false,
        payment: false
      }
    };

    expect(getAccessCapabilities(catalogOnlyStore)).toEqual(expect.objectContaining({
      catalog: true,
      cart: false,
      checkout: false,
      booking: false
    }));
    expect(canViewCatalog(catalogOnlyStore)).toBe(true);
    expect(canUseProductCart(catalogOnlyStore)).toBe(false);
    expect(canUseCheckout(catalogOnlyStore)).toBe(false);
    expect(canUseBooking(catalogOnlyStore)).toBe(false);
  });

  it('returns only customer-facing inventory labels', () => {
    expect(getInventoryDisplayLabel({ inventory_display: { label: 'Only 2 left' } })).toBe('Only 2 left');
    expect(getInventoryDisplayLabel({ inventory_display: { label: null } })).toBeNull();
    expect(getInventoryDisplayLabel({ current_stock: 12 })).toBeNull();
  });
});
