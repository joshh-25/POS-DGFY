/* @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCheckoutTotalsAndGating } from '../modes/fnb/checkout/hooks/useCheckoutTotalsAndGating.js';

// F&B checkout requires a current quote before submission; other storefront modes retain their
// existing quote policy. The quote's payment-split fields remain server-authoritative.
const baseProps = ({ selectedStore, quoteResult = null }) => ({
  accessCapabilities: {},
  cart: [],
  cartCount: 0,
  cartTotal: 500,
  checkoutError: '',
  checkoutLoading: false,
  checkoutResult: null,
  hasServiceCart: false,
  isFnbMode: true,
  isRetailMode: false,
  isSimpleMode: false,
  money: (value) => `PHP ${Number(value || 0).toFixed(2)}`,
  orderMethod: 'delivery',
  quoteError: '',
  quoteNeedsRefresh: false,
  quoteResult,
  selectedStore,
  serviceCartLines: [],
  storefrontClosedByHours: false
});

describe('useCheckoutTotalsAndGating -- downpayment requireQuote (#823)', () => {
  it('requires a quote in fnb/simple/retail for a downpayment_required store', () => {
    const { result } = renderHook(() => useCheckoutTotalsAndGating(baseProps({
      selectedStore: { slug: 'demo', payment_mode: 'downpayment_required' }
    })));
    expect(result.current.requireQuoteForCheckout).toBe(true);
  });

  it('requires a current quote for F&B full_payment checkout', () => {
    const { result } = renderHook(() => useCheckoutTotalsAndGating(baseProps({
      selectedStore: { slug: 'demo', payment_mode: 'full_payment' }
    })));
    expect(result.current.requireQuoteForCheckout).toBe(true);
  });

  it('shows a safe current-cart total and blocks checkout while an F&B quote is stale', () => {
    const { result } = renderHook(() => useCheckoutTotalsAndGating({
      ...baseProps({
        selectedStore: { slug: 'demo', payment_mode: 'full_payment' },
        quoteResult: { subtotal_amount: 488, delivery_fee: 50, total_amount: 538 },
      }),
      cartCount: 2,
      cartTotal: 488,
      orderMethod: 'pickup',
      quoteNeedsRefresh: true,
    }));

    expect(result.current.isTotalStale).toBe(true);
    expect(result.current.totalsForDisplay.total_amount).toBe(488);
    expect(result.current.totalsForDisplay.delivery_fee).toBe(0);
    expect(result.current.totalsForDisplay.subtotal_amount).toBe(488);
    expect(result.current.checkoutBlockReason).toBe('stale_quote');
    expect(result.current.checkoutAllowed).toBe(false);
  });

  it('passes the four downpayment fields through totalsForDisplay from the quote, null when absent', () => {
    const { result: withQuote } = renderHook(() => useCheckoutTotalsAndGating(baseProps({
      selectedStore: { slug: 'demo', payment_mode: 'downpayment_required' },
      quoteResult: {
        total_amount: 505,
        payment_mode: 'downpayment_required',
        downpayment_amount: 101,
        balance_due_amount: 404,
        downpayment_refundable: true
      }
    })));
    expect(withQuote.current.totalsForDisplay).toMatchObject({
      payment_mode: 'downpayment_required',
      downpayment_amount: 101,
      balance_due_amount: 404,
      downpayment_refundable: true
    });

    const { result: noQuote } = renderHook(() => useCheckoutTotalsAndGating(baseProps({
      selectedStore: { slug: 'demo', payment_mode: 'full_payment' }
    })));
    expect(noQuote.current.totalsForDisplay).toMatchObject({
      payment_mode: null,
      downpayment_amount: null,
      balance_due_amount: null,
      downpayment_refundable: null
    });
  });

  // Phase 150 (#866): a customer_choice store only needs a forced quote once the customer has
  // actually elected "downpayment" -- an election of "full" behaves exactly like full_payment.
  describe('customer_choice', () => {
    const customerChoiceStore = { slug: 'demo', payment_mode: 'customer_choice' };

    it('requires a quote when the election is "downpayment"', () => {
      const { result } = renderHook(() => useCheckoutTotalsAndGating({
        ...baseProps({ selectedStore: customerChoiceStore }),
        paymentElection: 'downpayment'
      }));
      expect(result.current.requireQuoteForCheckout).toBe(true);
    });

    it('requires a quote when the election is "full"', () => {
      const { result } = renderHook(() => useCheckoutTotalsAndGating({
        ...baseProps({ selectedStore: customerChoiceStore }),
        paymentElection: 'full'
      }));
      expect(result.current.requireQuoteForCheckout).toBe(true);
    });

    it('requires a quote when no election has been made yet (undefined)', () => {
      const { result } = renderHook(() => useCheckoutTotalsAndGating(baseProps({ selectedStore: customerChoiceStore })));
      expect(result.current.requireQuoteForCheckout).toBe(true);
    });

    it('blocks with downpayment_zero_total only when the election is "downpayment" and the quote zeroed out', () => {
      const zeroedQuote = { total_amount: 0, payment_mode: 'full_payment' };
      const { result: electedDownpayment } = renderHook(() => useCheckoutTotalsAndGating({
        ...baseProps({ selectedStore: customerChoiceStore, quoteResult: zeroedQuote }),
        cartCount: 1,
        quoteNeedsRefresh: false,
        paymentElection: 'downpayment'
      }));
      expect(electedDownpayment.current.checkoutBlockReason).toBe('downpayment_zero_total');

      const { result: electedFull } = renderHook(() => useCheckoutTotalsAndGating({
        ...baseProps({ selectedStore: customerChoiceStore, quoteResult: zeroedQuote }),
        cartCount: 1,
        quoteNeedsRefresh: false,
        paymentElection: 'full'
      }));
      // election 'full' -> requireQuoteForCheckout is false for fnb/simple/retail, so the guard
      // never even reaches the downpayment_zero_total check -- confirms it's a genuine non-block,
      // not a coincidental different reason.
      expect(electedFull.current.checkoutBlockReason).toBeNull();
    });
  });
});
