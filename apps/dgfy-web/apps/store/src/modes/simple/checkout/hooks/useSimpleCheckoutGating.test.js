// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSimpleCheckoutGating } from './useSimpleCheckoutGating.js';

const baseProps = {
  cart: [{ item_id: 1 }],
  checkoutAllowed: true,
  customerEmail: 'admin@test.com',
  customerName: 'Admin User',
  customerPhone: '+639999000001',
  guestCheckoutOtpVerified: true,
  isDeliveryOrder: true
};

describe('useSimpleCheckoutGating', () => {
  it('allows a complete signed-in identity to continue before delivery address selection', () => {
    const { result } = renderHook(() => useSimpleCheckoutGating(baseProps));

    expect(result.current.simpleCustomerStepComplete).toBe(true);
    expect(result.current.simpleCheckoutAllowed).toBe(false);
  });

  it('allows final checkout after the delivery address is selected', () => {
    const { result } = renderHook(() => useSimpleCheckoutGating({
      ...baseProps,
      customerAddress: '123 Main Street'
    }));

    expect(result.current.simpleCustomerStepComplete).toBe(true);
    expect(result.current.simpleCheckoutAllowed).toBe(true);
  });
});
