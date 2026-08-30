// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimpleCheckoutFulfillmentChoices } from './SimpleCheckoutFulfillmentChoices.jsx';

// #1217: new sibling test file, at the parent-component level, mirroring the Retail/F&B
// rewrites. SimpleOrderMethodSelector.test.jsx itself is left unchanged -- it renders the leaf
// selector directly with both options and still legitimately asserts the "(Unavailable)"
// treatment, which stays valid for a 3+-candidate mode.
describe('SimpleCheckoutFulfillmentChoices', () => {
  it('hides the chooser and states the sole method when only one is available', () => {
    const onOrderMethodChange = vi.fn();
    render(<SimpleCheckoutFulfillmentChoices
      orderMethod="pickup"
      onOrderMethodChange={onOrderMethodChange}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      scheduleMode="asap"
      scheduledFor=""
      simpleOrderMethodOptions={[
        { value: 'delivery', label: 'Delivery', available: false },
        { value: 'pickup', label: 'Pickup', available: true }
      ]}
    />);

    expect(screen.queryByRole('button', { name: /Delivery/ })).toBeNull();
    expect(screen.queryByText('How would you like to receive your order?')).toBeNull();
    expect(screen.getByText('This order will be ready for pickup at the store.')).toBeTruthy();
    expect(screen.getByText('1. When would you like your order?')).toBeTruthy();
  });

  it('keeps the chooser and (Unavailable) treatment when two or more methods are available', () => {
    const onOrderMethodChange = vi.fn();
    render(<SimpleCheckoutFulfillmentChoices
      orderMethod="pickup"
      onOrderMethodChange={onOrderMethodChange}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      scheduleMode="asap"
      scheduledFor=""
      simpleOrderMethodOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: true }
      ]}
    />);

    expect(screen.getByText('1. How would you like to receive your order?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
    expect(onOrderMethodChange).toHaveBeenCalledWith('delivery');
    expect(screen.getByText('2. When would you like your order?')).toBeTruthy();
  });
});
