/* @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useFnbCheckoutQuote } from '../modes/fnb/checkout/hooks/useFnbCheckoutQuote.js';

const buildProps = (overrides = {}) => ({
  accessCapabilities: { quote: true },
  cart: [{ item_id: 7, quantity: 1 }],
  cartSignature: '7:1',
  checkoutPermitted: true,
  checkoutPromoCode: '',
  checkoutVoucherCode: 'SARAPCA',
  customerEmail: 'guest@example.com',
  customerName: 'Guest Shopper',
  customerPhone: '+639171234567',
  customerPin: null,
  deliveryAddress: '',
  fnbScheduleMode: 'asap',
  fnbScheduledFor: '',
  fnbSpecialInstructions: '',
  isDeliveryOrder: false,
  isDgfyCustomerSignedIn: false,
  normalizeErrorMessage: (_error, fallback) => fallback,
  orderMethod: 'pickup',
  paymentElection: 'full',
  readDgfyAuthToken: vi.fn(() => ''),
  readStoreAuthToken: vi.fn(() => ''),
  requestJson: vi.fn().mockResolvedValue({
    subtotal_amount: 100,
    voucher_discount_amount: 0,
    total_amount: 101,
  }),
  selectedLocationId: 1,
  selectedStore: { slug: 'demo-store' },
  setCheckoutPromoCode: vi.fn(),
  setCheckoutVoucherCode: vi.fn(),
  setQuotedCartSignature: vi.fn(),
  setQuoteError: vi.fn(),
  setQuoteNeedsRefresh: vi.fn(),
  setQuoteResult: vi.fn(),
  storefrontClosedByHours: false,
  storefrontHoursLabel: '',
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
  buildStockExceededMessage: vi.fn(() => 'Stock exceeded.'),
  extractStockViolation: vi.fn(() => null),
  ...overrides,
});

describe('useFnbCheckoutQuote voucher removal', () => {
  it('invalidates the discounted snapshot and requests a fresh quote without the voucher', async () => {
    const props = buildProps();
    const { result } = renderHook(() => useFnbCheckoutQuote(props));

    await act(async () => {
      await result.current.handleVoucherCardRemove();
    });

    expect(props.setCheckoutVoucherCode).toHaveBeenCalledWith('');
    expect(props.setQuoteResult).toHaveBeenNthCalledWith(1, null);
    expect(props.setQuotedCartSignature).toHaveBeenCalledWith(null);
    expect(props.setQuoteNeedsRefresh).toHaveBeenCalledWith(true);
    expect(props.requestJson).toHaveBeenCalledWith('/api/v1/store/cart/quote', expect.objectContaining({
      body: expect.objectContaining({ voucher_code: '' }),
    }));
    expect(props.setQuoteResult).toHaveBeenLastCalledWith(expect.objectContaining({
      voucher_discount_amount: 0,
    }));
  });

  it('keeps totals invalidated when quote validation is deferred until customer details exist', async () => {
    const error = Object.assign(new Error('customer_name is required'), {
      errorCode: 'VALIDATION_FAILED',
      details: [{ field: 'customer_name' }],
    });
    const props = buildProps({ requestJson: vi.fn().mockRejectedValue(error) });
    const { result } = renderHook(() => useFnbCheckoutQuote(props));

    await act(async () => {
      await result.current.handleVoucherCardRemove();
    });

    expect(props.setQuoteResult).toHaveBeenCalledWith(null);
    expect(props.setQuoteError).not.toHaveBeenCalledWith('Unable to update order totals.');
    expect(props.setQuoteNeedsRefresh).toHaveBeenLastCalledWith(true);
  });
});
