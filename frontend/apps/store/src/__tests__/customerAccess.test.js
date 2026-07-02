import { describe, expect, it } from 'vitest';
import {
  canUseBooking,
  canUseCheckout,
  canUseProductCart,
  canViewCatalog,
  getAccessCapabilities,
  getInventoryDisplayLabel,
  getStorefrontAccessBlockMessage,
  shouldClearStorefrontCart
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

  it('returns Map Listing Only blocked-action copy', () => {
    expect(getStorefrontAccessBlockMessage({
      effective_customer_access_mode: 'ghost'
    })).toBe('Customers can see your store profile, map location, and contact/social links, but catalog and checkout are hidden.');
  });

  it('returns Catalog Only blocked-action copy', () => {
    expect(getStorefrontAccessBlockMessage({
      effective_customer_access_mode: 'catalog'
    })).toBe('Customers can browse your catalog, but cart, quote, booking, and checkout are disabled.');
  });

  it('returns registration-readiness cap copy when online ordering is requested but not effective', () => {
    expect(getStorefrontAccessBlockMessage({
      requested_customer_access_mode: 'transaction',
      customer_access_mode: 'transaction',
      effective_customer_access_mode: 'catalog'
    })).toBe('Online ordering is requested, but checkout is capped by registration readiness.');
  });

  it('returns Inquiry Mode blocked-action copy', () => {
    expect(getStorefrontAccessBlockMessage({
      effective_customer_access_mode: 'inquiry'
    })).toBe('Customers can browse and contact you, but checkout and booking are disabled.');
  });

  it('uses neutral fallback copy when capabilities are blocked without a known access mode', () => {
    expect(getStorefrontAccessBlockMessage({
      access_capabilities: {
        checkout: false
      }
    })).toBe('This Storefront action is not available right now.');
  });
});

describe('storefront cart capability cleanup', () => {
  const productCart = [{ item_id: 10, category: 'product', quantity: 1 }];
  const serviceCart = [{ item_id: 20, category: 'service', quantity: 1 }];

  it.each(['guest', 'DGFY account'])(
    'preserves a tenant-store product cart for %s checkout when booking is unavailable',
    () => {
      expect(shouldClearStorefrontCart({
        cart: productCart,
        productCartPermitted: true,
        checkoutPermitted: true,
        bookingPermitted: false
      })).toBe(false);
    }
  );

  it('clears product lines when product checkout is unavailable', () => {
    expect(shouldClearStorefrontCart({
      cart: productCart,
      productCartPermitted: true,
      checkoutPermitted: false,
      bookingPermitted: true
    })).toBe(true);
  });

  it('preserves service lines independently of product-cart capability', () => {
    expect(shouldClearStorefrontCart({
      cart: serviceCart,
      productCartPermitted: false,
      checkoutPermitted: false,
      bookingPermitted: true
    })).toBe(false);
  });

  it('clears service lines when booking is unavailable', () => {
    expect(shouldClearStorefrontCart({
      cart: serviceCart,
      productCartPermitted: true,
      checkoutPermitted: true,
      bookingPermitted: false
    })).toBe(true);
  });
});
