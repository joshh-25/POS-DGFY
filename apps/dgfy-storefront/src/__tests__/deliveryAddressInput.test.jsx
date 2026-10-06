/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RetailOrderFulfillmentStep } from '../modes/retail/checkout/components/RetailOrderFulfillmentStep.jsx';
import { SimpleCheckoutFulfillmentStep } from '../modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx';

afterEach(cleanup);

const PLACEHOLDER = 'Pinned delivery address will appear here.';
// #759: Retail's address line is also its address search, so its placeholder invites a search.
const RETAIL_PLACEHOLDER = 'Search an address or landmark';

describe('#1219 -- the delivery address line is an editable input, not a read-only span', () => {
  it('RetailOrderFulfillmentStep: typing calls onCustomerAddressChange with the typed value', () => {
    const onCustomerAddressChange = vi.fn();
    render(<RetailOrderFulfillmentStep
      orderMethod="delivery"
      deliveryLocationDisplayAddress=""
      onCustomerAddressChange={onCustomerAddressChange}
    />);

    const input = screen.getByLabelText('Delivery address');
    expect(input.tagName).toBe('INPUT');
    expect(input.placeholder).toBe(RETAIL_PLACEHOLDER);

    fireEvent.change(input, { target: { value: 'Blue gate beside the sari-sari store, Purok 3' } });
    expect(onCustomerAddressChange).toHaveBeenCalledWith('Blue gate beside the sari-sari store, Purok 3');
  });

  it('SimpleCheckoutFulfillmentStep: typing calls onCustomerAddressChange with the typed value', () => {
    const onCustomerAddressChange = vi.fn();
    render(<SimpleCheckoutFulfillmentStep
      orderMethod="delivery"
      isDeliveryOrder
      canUseGuestCheckoutFlow
      isDgfyCustomerSignedIn
      deliveryLocationDisplayAddress=""
      onCustomerAddressChange={onCustomerAddressChange}
    />);

    const input = screen.getByLabelText('Delivery address');
    expect(input.tagName).toBe('INPUT');
    expect(input.placeholder).toBe(PLACEHOLDER);

    fireEvent.change(input, { target: { value: 'Blue gate beside the sari-sari store, Purok 3' } });
    expect(onCustomerAddressChange).toHaveBeenCalledWith('Blue gate beside the sari-sari store, Purok 3');
  });
});
