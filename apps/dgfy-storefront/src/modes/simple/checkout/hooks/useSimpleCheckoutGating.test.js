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

  it('keeps final checkout blocked until the house/unit details are given (#2594)', () => {
    const { result } = renderHook(() => useSimpleCheckoutGating({
      ...baseProps,
      customerAddress: 'Rizal Street, Jaro, Iloilo City'
    }));

    expect(result.current.simpleCustomerStepComplete).toBe(true);
    expect(result.current.simpleCheckoutAllowed).toBe(false);
  });

  it('allows final checkout after the delivery address and its details are given', () => {
    const { result } = renderHook(() => useSimpleCheckoutGating({
      ...baseProps,
      customerAddress: 'Rizal Street, Jaro, Iloilo City',
      deliveryAddressDetails: 'Blk 5 Lot 12'
    }));

    expect(result.current.simpleCustomerStepComplete).toBe(true);
    expect(result.current.simpleCheckoutAllowed).toBe(true);
  });

  it('does not ask for details on a pickup order', () => {
    const { result } = renderHook(() => useSimpleCheckoutGating({ ...baseProps, isDeliveryOrder: false }));

    expect(result.current.simpleCheckoutAllowed).toBe(true);
  });
});
