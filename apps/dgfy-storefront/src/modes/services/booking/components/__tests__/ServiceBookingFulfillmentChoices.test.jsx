/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ServiceBookingFulfillmentChoices } from '../ServiceBookingFulfillmentChoices.jsx';

// Services currently exposes only the two pickup handoff choices in this step.
describe('ServiceBookingFulfillmentChoices', () => {
  afterEach(cleanup);

  const baseProps = {
    isMobileViewport: false,
    servicesPrimary: '#0f766e',
    servicesPrimaryShadow: 'rgba(15, 118, 110, 0.2)'
  };

  it('renders only pickup/return and pickup/collection choices', () => {
    render(
      <ServiceBookingFulfillmentChoices
        {...baseProps}
        serviceOrderMethod="delivery"
        onOrderMethodChange={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toContain('Pick up and deliver');
    expect(buttons[1].textContent).toContain("Pick up and I'll collect");
    expect(screen.queryByText('Drop off and collect')).toBeNull();
    expect(screen.queryByText('Request a quote')).toBeNull();
  });

  it('marks the option matching serviceOrderMethod as active and calls onOrderMethodChange with the unchanged value on click', () => {
    const onOrderMethodChange = vi.fn();
    render(
      <ServiceBookingFulfillmentChoices
        {...baseProps}
        serviceOrderMethod="pickup"
        onOrderMethodChange={onOrderMethodChange}
      />
    );

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(onOrderMethodChange).toHaveBeenCalledWith('delivery');

    fireEvent.click(buttons[1]);
    expect(onOrderMethodChange).toHaveBeenCalledWith('pickup');
  });
});
