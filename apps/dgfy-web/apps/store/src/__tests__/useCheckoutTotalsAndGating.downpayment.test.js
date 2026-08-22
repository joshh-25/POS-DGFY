/* @vitest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCheckoutTotalsAndGating } from '../modes/fnb/checkout/hooks/useCheckoutTotalsAndGating.js';

// Phase 142 (#823): requireQuoteForCheckout was unconditionally false for fnb/simple/retail --
// this pins the one exception (a downpayment_required store) and confirms the full_payment case
// is genuinely unaffected, plus that the four downpayment fields pass through totalsForDisplay
// server-authoritative only.
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

  it('does not require a quote in fnb/simple/retail for a full_payment store (unaffected)', () => {
    const { result } = renderHook(() => useCheckoutTotalsAndGating(baseProps({
      selectedStore: { slug: 'demo', payment_mode: 'full_payment' }
    })));
    expect(result.current.requireQuoteForCheckout).toBe(false);
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
});
