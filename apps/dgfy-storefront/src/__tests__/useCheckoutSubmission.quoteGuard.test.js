import { describe, expect, it, vi } from 'vitest';

import { useCheckoutSubmission } from '../shared/hooks/useCheckoutSubmission.js';

const UPDATED_TOTAL_MESSAGE = 'Order total updated. Review it and tap Place Order again.';

const buildProps = (overrides = {}) => ({
  activeBookingService: null,
  buildStockExceededMessage: vi.fn(() => 'An item is no longer available.'),
  checkoutBlockReason: 'stale_quote',
  extractStockViolation: vi.fn(() => null),
  hasServiceCart: false,
  isFnbMode: false,
  isServicesMode: false,
  normalizeStorefrontErrorMessage: vi.fn((_error, fallback) => fallback),
  requestJson: vi.fn(),
  requestQuote: vi.fn().mockResolvedValue({ total_amount: 120 }),
  requireQuoteForCheckout: true,
  selectedStore: { slug: 'demo-store' },
  setCheckoutError: vi.fn(),
  setCheckoutLoading: vi.fn(),
  setCheckoutResult: vi.fn(),
  setQuoteError: vi.fn(),
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
  ...overrides,
});

describe('useCheckoutSubmission quote guard', () => {
  it.each(['missing_quote', 'stale_quote'])(
    'refreshes a %s quote and asks the shopper to confirm before placing the order',
    async (checkoutBlockReason) => {
      const props = buildProps({ checkoutBlockReason });
      const { handleCheckout } = useCheckoutSubmission(props);

      await handleCheckout();

      expect(props.requestQuote).toHaveBeenCalledTimes(1);
      expect(props.requestQuote).toHaveBeenCalledWith({ silent: true });
      expect(props.toast.success).toHaveBeenCalledWith(UPDATED_TOTAL_MESSAGE);
      expect(props.requestJson).not.toHaveBeenCalled();
      expect(props.setCheckoutLoading).toHaveBeenNthCalledWith(1, true);
      expect(props.setCheckoutLoading).toHaveBeenLastCalledWith(false);
      expect(props.setCheckoutError).not.toHaveBeenCalledWith(
        'Updating your order total -- please wait a moment and try again.'
      );
    }
  );

  it('shows an actionable normalized message when refreshing the quote fails', async () => {
    const error = new Error('quote endpoint unavailable');
    const failureMessage = 'Unable to update your total. Check your connection and try again.';
    const props = buildProps({
      normalizeStorefrontErrorMessage: vi.fn(() => failureMessage),
      requestQuote: vi.fn().mockRejectedValue(error),
    });
    const { handleCheckout } = useCheckoutSubmission(props);

    await handleCheckout();

    expect(props.extractStockViolation).toHaveBeenCalledWith(error);
    expect(props.normalizeStorefrontErrorMessage).toHaveBeenCalledWith(
      error,
      'Unable to update your order total. Review your cart and try again.'
    );
    expect(props.setQuoteError).toHaveBeenCalledWith(failureMessage);
    expect(props.setCheckoutError).toHaveBeenLastCalledWith(failureMessage);
    expect(props.toast.error).toHaveBeenCalledWith(failureMessage);
    expect(props.toast.error).not.toHaveBeenCalledWith(
      'Updating your order total -- please wait a moment and try again.'
    );
    expect(props.requestJson).not.toHaveBeenCalled();
    expect(props.setCheckoutLoading).toHaveBeenLastCalledWith(false);
  });

  it('shows the stock-specific action when the refreshed quote finds a stock violation', async () => {
    const error = new Error('stock changed');
    const stockMessage = 'An item is no longer available.';
    const props = buildProps({
      extractStockViolation: vi.fn(() => ({ itemId: 7 })),
      requestQuote: vi.fn().mockRejectedValue(error),
    });
    const { handleCheckout } = useCheckoutSubmission(props);

    await handleCheckout();

    expect(props.buildStockExceededMessage).toHaveBeenCalledWith({ itemId: 7 });
    expect(props.setCheckoutError).toHaveBeenLastCalledWith(stockMessage);
    expect(props.setQuoteError).toHaveBeenCalledWith(stockMessage);
    expect(props.toast.error).toHaveBeenCalledWith(stockMessage);
  });
});
