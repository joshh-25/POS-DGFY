// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RetailOrderFulfillmentStep } from './RetailOrderFulfillmentStep.jsx';

describe('RetailOrderFulfillmentStep', () => {
  it('keeps an unavailable fulfillment option visible without changing order method', () => {
    const onOrderMethodChange = vi.fn();
    render(<RetailOrderFulfillmentStep
      orderMethod="pickup"
      orderMethodOptions={[
        { value: 'delivery', label: 'Delivery', available: false },
        { value: 'pickup', label: 'Pickup', available: true }
      ]}
      onOrderMethodChange={onOrderMethodChange}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      onSpecialInstructionsChange={vi.fn()}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Delivery (Unavailable)' }));
    expect(onOrderMethodChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('This store does not support Delivery.');
  });
});
