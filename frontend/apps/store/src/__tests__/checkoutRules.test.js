import { describe, expect, it } from 'vitest';
import { canCheckout, getCheckoutBlockReason } from '../checkoutRules.js';

describe('store checkout rules', () => {
  const base = {
    selectedStore: { slug: 'demo' },
    cartCount: 1,
    checkoutLoading: false,
    hasStockViolation: false,
    quoteResult: { total_amount: 10 },
    quoteNeedsRefresh: false
  };

  it('allows checkout only when all guards pass', () => {
    expect(getCheckoutBlockReason(base)).toBeNull();
    expect(canCheckout(base)).toBe(true);
  });

  it('blocks by priority order', () => {
    expect(getCheckoutBlockReason({ ...base, selectedStore: null })).toBe('missing_store');
    expect(getCheckoutBlockReason({ ...base, cartCount: 0 })).toBe('empty_cart');
    expect(getCheckoutBlockReason({ ...base, checkoutLoading: true })).toBe('checkout_loading');
    expect(getCheckoutBlockReason({ ...base, hasStockViolation: true })).toBe('stock_violation');
    expect(getCheckoutBlockReason({ ...base, accessCapabilities: { checkout: false, quote: false } })).toBe('access_mode');
    expect(getCheckoutBlockReason({ ...base, quoteResult: null })).toBe('missing_quote');
    expect(getCheckoutBlockReason({ ...base, quoteNeedsRefresh: true })).toBe('stale_quote');
  });

  it('lets service-only bookings bypass product quote guards', () => {
    const serviceOnly = {
      ...base,
      hasServiceCart: true,
      quoteResult: null,
      quoteNeedsRefresh: true
    };
    expect(getCheckoutBlockReason(serviceOnly)).toBeNull();
    expect(canCheckout(serviceOnly)).toBe(true);
  });

  it('blocks service bookings when access capabilities do not allow booking', () => {
    expect(getCheckoutBlockReason({
      ...base,
      hasServiceCart: true,
      quoteResult: null,
      accessCapabilities: { booking: false }
    })).toBe('access_mode');
  });
});
