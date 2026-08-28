// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FnbCheckoutFulfillmentChoices } from './FnbCheckoutFulfillmentChoices.jsx';

describe('FnbCheckoutFulfillmentChoices', () => {
  it('does not select an unavailable fulfillment option', () => {
    const onOrderMethodChange = vi.fn();
    render(<FnbCheckoutFulfillmentChoices
      fnbOrderBrand="#0f766e"
      fnbOrderBrandBorder="#0f766e"
      fnbOrderBrandShadow="rgba(0,0,0,.1)"
      fnbOrderBrandShadowStrong="rgba(0,0,0,.1)"
      fnbScheduleMode="asap"
      fnbScheduledFor=""
      isDeliveryOrder
      isResponsive={false}
      mobileOptionHeight={64}
      mobileOptionIconBox={40}
      mobileOptionTextSize={14}
      onOrderMethodChange={onOrderMethodChange}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      orderMethod="delivery"
      fulfillmentOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: false }
      ]}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Pickup (Unavailable)' }));
    expect(onOrderMethodChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('This store does not support Pickup.');
  });
});
