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
  it('routes promo application with an explicit empty voucher field', async () => {
    const props = buildProps({
      checkoutPromoCode: '',
      checkoutVoucherCode: 'VOUCHER10',
    });
    const { result } = renderHook(() => useFnbCheckoutQuote(props));

    await act(async () => {
      await result.current.handlePromoCardApply('PROMO10');
    });

    expect(props.setCheckoutPromoCode).toHaveBeenCalledWith('PROMO10');
    expect(props.setCheckoutVoucherCode).toHaveBeenCalledWith('');
    expect(props.requestJson).toHaveBeenCalledWith('/api/v1/store/cart/quote', expect.objectContaining({
      body: expect.objectContaining({
        promo_code: 'PROMO10',
        voucher_code: '',
      }),
    }));
  });

  it('routes voucher application with an explicit empty promo field', async () => {
    const props = buildProps({
      checkoutPromoCode: 'PROMO10',
      checkoutVoucherCode: '',
    });
    const { result } = renderHook(() => useFnbCheckoutQuote(props));

    await act(async () => {
      await result.current.handleVoucherCardApply('VOUCHER10');
    });

    expect(props.setCheckoutVoucherCode).toHaveBeenCalledWith('VOUCHER10');
    expect(props.setCheckoutPromoCode).toHaveBeenCalledWith('');
    expect(props.requestJson).toHaveBeenCalledWith('/api/v1/store/cart/quote', expect.objectContaining({
      body: expect.objectContaining({
        promo_code: '',
        voucher_code: 'VOUCHER10',
      }),
    }));
  });

  it('removes a promo and preserves the voucher field when refreshing totals', async () => {
    const props = buildProps({
      checkoutPromoCode: 'PROMO10',
      checkoutVoucherCode: 'VOUCHER10',
    });
    const { result } = renderHook(() => useFnbCheckoutQuote(props));

    await act(async () => {
      await result.current.handlePromoCardRemove();
    });

    expect(props.setCheckoutPromoCode).toHaveBeenCalledWith('');
    expect(props.requestJson).toHaveBeenCalledWith('/api/v1/store/cart/quote', expect.objectContaining({
      body: expect.objectContaining({
        promo_code: '',
        voucher_code: 'VOUCHER10',
      }),
    }));
  });

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

describe('useFnbCheckoutQuote fulfillment context', () => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
  };

  it('discards a delivery quote when pickup is selected before the response arrives', async () => {
    const deliveryResponse = deferred();
    const props = buildProps({
      isDeliveryOrder: true,
      orderMethod: 'delivery',
      requestJson: vi.fn(() => deliveryResponse.promise),
    });
    const { result, rerender } = renderHook(({ currentProps }) => useFnbCheckoutQuote(currentProps), {
      initialProps: { currentProps: props },
    });
    let request;
    act(() => { request = result.current.requestQuote({ silent: true }); });

    rerender({ currentProps: { ...props, isDeliveryOrder: false, orderMethod: 'pickup' } });
    await act(async () => {
      deliveryResponse.resolve({ total_amount: 538, delivery_fee: 50 });
      await request;
    });

    expect(props.setQuoteResult).not.toHaveBeenCalled();
    expect(props.setQuotedCartSignature).not.toHaveBeenCalled();
    expect(props.setQuoteNeedsRefresh).not.toHaveBeenCalledWith(false);
  });

  it('discards an older delivery quote while a pickup quote is already in flight', async () => {
    const deliveryResponse = deferred();
    const pickupResponse = deferred();
    const requestJson = vi.fn()
      .mockReturnValueOnce(deliveryResponse.promise)
      .mockReturnValueOnce(pickupResponse.promise);
    const props = buildProps({ isDeliveryOrder: true, orderMethod: 'delivery', requestJson });
    const { result, rerender } = renderHook(({ currentProps }) => useFnbCheckoutQuote(currentProps), {
      initialProps: { currentProps: props },
    });
    let deliveryRequest;
    act(() => { deliveryRequest = result.current.requestQuote({ silent: true }); });

    const pickupProps = { ...props, isDeliveryOrder: false, orderMethod: 'pickup' };
    rerender({ currentProps: pickupProps });
    let pickupRequest;
    act(() => { pickupRequest = result.current.requestQuote({ silent: true }); });
    await act(async () => {
      deliveryResponse.resolve({ total_amount: 538, delivery_fee: 50 });
      await deliveryRequest;
    });
    expect(props.setQuoteResult).not.toHaveBeenCalled();
    expect(props.setQuoteNeedsRefresh).not.toHaveBeenCalledWith(false);

    await act(async () => {
      pickupResponse.resolve({ total_amount: 488, delivery_fee: 0 });
      await pickupRequest;
    });
    expect(props.setQuoteResult).toHaveBeenCalledTimes(1);
    expect(props.setQuoteResult).toHaveBeenCalledWith({ total_amount: 488, delivery_fee: 0 });
    expect(props.setQuoteNeedsRefresh).toHaveBeenCalledTimes(1);
    expect(props.setQuoteNeedsRefresh).toHaveBeenCalledWith(false);
  });

  it('discards an address-priced quote after the delivery pin changes', async () => {
    const deliveryResponse = deferred();
    const props = buildProps({
      customerPin: { latitude: 14.55, longitude: 121.02 },
      deliveryAddress: 'Old address',
      isDeliveryOrder: true,
      orderMethod: 'delivery',
      requestJson: vi.fn(() => deliveryResponse.promise),
    });
    const { result, rerender } = renderHook(({ currentProps }) => useFnbCheckoutQuote(currentProps), {
      initialProps: { currentProps: props },
    });
    let request;
    act(() => { request = result.current.requestQuote({ silent: true }); });

    rerender({ currentProps: {
      ...props,
      customerPin: { latitude: 14.56, longitude: 121.03 },
      deliveryAddress: 'New address',
    } });
    await act(async () => {
      deliveryResponse.resolve({ total_amount: 568, delivery_fee: 80 });
      await request;
    });

    expect(props.setQuoteResult).not.toHaveBeenCalled();
    expect(props.setQuoteNeedsRefresh).not.toHaveBeenCalledWith(false);
  });
});
