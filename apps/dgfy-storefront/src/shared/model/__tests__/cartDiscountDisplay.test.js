import { describe, expect, it } from 'vitest';
import { resolveCartDiscountDisplay } from '../cartDiscountDisplay.js';
import { buildCartSignature } from '../cartSignature.js';

// #746 shipped broken twice -- first with no discount wiring at all, then with a `!quoteNeedsRefresh`
// gate that suppressed the discount permanently in the cart drawer. Neither commit carried a test.
// These lock down the actual decision.
describe('resolveCartDiscountDisplay', () => {
  it('shows the voucher discount and the discounted total', () => {
    const result = resolveCartDiscountDisplay({ cartTotal: 1000, voucherDiscountAmount: 250 });

    expect(result.hasVoucherDiscount).toBe(true);
    expect(result.displayTotal).toBe(750);
  });

  it('shows promo and voucher discounts together', () => {
    const result = resolveCartDiscountDisplay({
      cartTotal: 1000,
      voucherDiscountAmount: 250,
      promoDiscountAmount: 100
    });

    expect(result.hasVoucherDiscount).toBe(true);
    expect(result.hasPromoDiscount).toBe(true);
    expect(result.displayTotal).toBe(650);
  });

  // The regression this file exists for: a stale discount must still be VISIBLE. Hiding it is #746.
  it('still shows a stale discount, flagged rather than hidden', () => {
    const result = resolveCartDiscountDisplay({
      cartTotal: 1000,
      voucherDiscountAmount: 250,
      isQuoteStale: true
    });

    expect(result.hasVoucherDiscount).toBe(true);
    expect(result.displayTotal).toBe(750);
    expect(result.isStale).toBe(true);
  });

  it('is not marked stale when the quote matches the cart', () => {
    const result = resolveCartDiscountDisplay({ cartTotal: 1000, voucherDiscountAmount: 250 });

    expect(result.isStale).toBe(false);
  });

  // RF-2's legitimate half (PR #753): never a confident PHP0 on a non-empty cart.
  it('suppresses a discount that exceeds the cart instead of rendering zero', () => {
    const result = resolveCartDiscountDisplay({ cartTotal: 200, voucherDiscountAmount: 500 });

    expect(result.hasVoucherDiscount).toBe(false);
    expect(result.displayTotal).toBe(200);
  });

  it('suppresses when promo and voucher COMBINED exceed the cart', () => {
    const result = resolveCartDiscountDisplay({
      cartTotal: 200,
      voucherDiscountAmount: 150,
      promoDiscountAmount: 100
    });

    expect(result.hasVoucherDiscount).toBe(false);
    expect(result.hasPromoDiscount).toBe(false);
    expect(result.displayTotal).toBe(200);
  });

  // A 100%-off voucher is legitimate and PHP0 is its correct total -- the guard above is `>`, not `>=`.
  it('allows an exactly-100%-off voucher to reach zero', () => {
    const result = resolveCartDiscountDisplay({ cartTotal: 500, voucherDiscountAmount: 500 });

    expect(result.hasVoucherDiscount).toBe(true);
    expect(result.displayTotal).toBe(0);
  });

  it('leaves the total untouched when there is no discount', () => {
    const result = resolveCartDiscountDisplay({ cartTotal: 1000 });

    expect(result.hasVoucherDiscount).toBe(false);
    expect(result.hasPromoDiscount).toBe(false);
    expect(result.displayTotal).toBe(1000);
    expect(result.isStale).toBe(false);
  });

  it('tolerates missing/invalid inputs without producing NaN', () => {
    const result = resolveCartDiscountDisplay();

    expect(result.displayTotal).toBe(0);
    expect(Number.isNaN(result.displayTotal)).toBe(false);
  });
});

describe('buildCartSignature', () => {
  const line = { cart_line_id: 'a', item_id: 1, quantity: 2, price: 100 };

  it('is stable for an unchanged cart', () => {
    expect(buildCartSignature([line])).toBe(buildCartSignature([{ ...line }]));
  });

  it('changes when quantity changes -- the case that invalidated the discount', () => {
    expect(buildCartSignature([line])).not.toBe(buildCartSignature([{ ...line, quantity: 3 }]));
  });

  it('changes when price changes', () => {
    expect(buildCartSignature([line])).not.toBe(buildCartSignature([{ ...line, price: 120 }]));
  });

  it('changes when a line is added or removed', () => {
    expect(buildCartSignature([line])).not.toBe(buildCartSignature([line, { ...line, cart_line_id: 'b' }]));
    expect(buildCartSignature([line])).not.toBe(buildCartSignature([]));
  });

  it('changes when a modifier selection changes', () => {
    const withModifier = { ...line, line_modifiers: [{ modifier_group_id: 'g', modifier_option_id: 'o', quantity: 1 }] };
    const changed = { ...line, line_modifiers: [{ modifier_group_id: 'g', modifier_option_id: 'o2', quantity: 1 }] };

    expect(buildCartSignature([withModifier])).not.toBe(buildCartSignature([changed]));
  });

  it('returns a stable empty signature for a non-array', () => {
    expect(buildCartSignature(undefined)).toBe('');
    expect(buildCartSignature(null)).toBe('');
  });
});
