import { describe, expect, it } from 'vitest';
import { canCheckout, getCheckoutBlockReason } from '../shared/model/checkoutRules.js';

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
    expect(getCheckoutBlockReason({ ...base, selectedStore: { slug: 'demo', storefront_hours_status: { is_open_now: false } } })).toBe('business_hours');
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

  it('lets storefront modes bypass quote blocking when requireQuote is false', () => {
    const fnbLikeCheckout = {
      ...base,
      quoteResult: null,
      quoteNeedsRefresh: true,
      requireQuote: false
    };

    expect(getCheckoutBlockReason(fnbLikeCheckout)).toBeNull();
    expect(canCheckout(fnbLikeCheckout)).toBe(true);
  });

  it('blocks service bookings when access capabilities do not allow booking', () => {
    expect(getCheckoutBlockReason({
      ...base,
      hasServiceCart: true,
      quoteResult: null,
      accessCapabilities: { booking: false }
    })).toBe('access_mode');
  });

  // Phase 142 (#823): requireQuote true for a downpayment_required store even in fnb/simple/
  // retail (previously false for those three unconditionally); unchanged for full_payment.
  describe('downpayment stores', () => {
    const downpaymentStore = { slug: 'demo', payment_mode: 'downpayment_required' };

    // getCheckoutBlockReason itself takes requireQuote as an external input -- the
    // downpayment_required-vs-mode decision lives in useCheckoutTotalsAndGating.js's own
    // isDownpaymentStore computation, not here. This pins that when that caller passes
    // requireQuote: true (which it now does for a downpayment store even in fnb/simple/retail),
    // the missing-quote gate actually fires.
    it('requires a quote when the caller resolves requireQuote true for a downpayment store', () => {
      expect(getCheckoutBlockReason({
        ...base,
        selectedStore: downpaymentStore,
        quoteResult: null,
        requireQuote: true
      })).toBe('missing_quote');
    });

    it('does not require a quote for fnb/simple/retail at a full_payment store (unaffected)', () => {
      expect(getCheckoutBlockReason({
        ...base,
        quoteResult: null,
        requireQuote: false
      })).toBeNull();
    });

    it('blocks with a specific reason when a voucher discounts a downpayment order to zero', () => {
      expect(getCheckoutBlockReason({
        ...base,
        selectedStore: downpaymentStore,
        quoteResult: { total_amount: 0, payment_mode: 'full_payment' }
      })).toBe('downpayment_zero_total');
    });

    it('allows checkout when the quote genuinely resolves to downpayment_required', () => {
      expect(getCheckoutBlockReason({
        ...base,
        selectedStore: downpaymentStore,
        quoteResult: { total_amount: 505, payment_mode: 'downpayment_required', downpayment_amount: 101 }
      })).toBeNull();
    });

    // Phase 150 (#866): the same zero-total dead end, at a customer_choice store, only when the
    // customer actually elected 'downpayment'.
    describe('customer_choice', () => {
      const customerChoiceStore = { slug: 'demo', payment_mode: 'customer_choice' };

      it('blocks with the same specific reason when election is "downpayment" and the quote zeroed out', () => {
        expect(getCheckoutBlockReason({
          ...base,
          selectedStore: customerChoiceStore,
          paymentElection: 'downpayment',
          quoteResult: { total_amount: 0, payment_mode: 'full_payment' }
        })).toBe('downpayment_zero_total');
      });

      it('never blocks when election is "full" -- the quote correctly reads full_payment by design, not malformed', () => {
        expect(getCheckoutBlockReason({
          ...base,
          selectedStore: customerChoiceStore,
          paymentElection: 'full',
          quoteResult: { total_amount: 0, payment_mode: 'full_payment' }
        })).toBeNull();
      });

      it('allows checkout when election is "downpayment" and the quote genuinely resolves to a split', () => {
        expect(getCheckoutBlockReason({
          ...base,
          selectedStore: customerChoiceStore,
          paymentElection: 'downpayment',
          quoteResult: { total_amount: 505, payment_mode: 'downpayment_required', downpayment_amount: 101 }
        })).toBeNull();
      });
    });
  });
});
