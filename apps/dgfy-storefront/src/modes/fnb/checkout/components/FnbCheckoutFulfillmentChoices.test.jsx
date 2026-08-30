// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FnbCheckoutFulfillmentChoices } from './FnbCheckoutFulfillmentChoices.jsx';

// #1217: identical treatment to RetailOrderFulfillmentStep.test.jsx -- a single available
// fulfillment method hides the chooser and its heading, replacing them with a static notice;
// this rewrites the pre-#1217 test that asserted the disabled-but-visible "Pickup (Unavailable)"
// treatment for a one-available/one-unavailable pair, which now resolves to exactly one
// available method and no longer renders a chooser at all.
describe('FnbCheckoutFulfillmentChoices', () => {
  const baseProps = {
    fnbOrderBrand: '#0f766e',
    fnbOrderBrandBorder: '#0f766e',
    fnbOrderBrandShadow: 'rgba(0,0,0,.1)',
    fnbOrderBrandShadowStrong: 'rgba(0,0,0,.1)',
    fnbScheduleMode: 'asap',
    fnbScheduledFor: '',
    isDeliveryOrder: true,
    isResponsive: false,
    mobileOptionHeight: 64,
    mobileOptionIconBox: 40,
    mobileOptionTextSize: 14,
    onScheduleModeChange: vi.fn(),
    onScheduledForChange: vi.fn(),
    orderMethod: 'delivery'
  };

  it('hides the chooser and states the sole method when only one is available', () => {
    const onOrderMethodChange = vi.fn();
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={onOrderMethodChange}
      fulfillmentOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: false }
      ]}
    />);

    expect(screen.queryByRole('button', { name: /Pickup/ })).toBeNull();
    expect(screen.queryByText('How would you like to receive your order?')).toBeNull();
    expect(screen.getByText('This store delivers your order.')).toBeTruthy();
    expect(screen.getByText('1. When would you like your order?')).toBeTruthy();
  });

  it('keeps the chooser and (Unavailable) treatment when two or more methods are available', () => {
    const onOrderMethodChange = vi.fn();
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={onOrderMethodChange}
      fulfillmentOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: true }
      ]}
    />);

    expect(screen.getByText('1. How would you like to receive your order?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pickup' }));
    expect(onOrderMethodChange).toHaveBeenCalledWith('pickup');
    expect(screen.getByText('2. When would you like your order?')).toBeTruthy();
  });
});
