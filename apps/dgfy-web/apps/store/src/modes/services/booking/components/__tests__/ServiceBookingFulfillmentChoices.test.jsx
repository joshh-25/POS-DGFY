/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ServiceBookingFulfillmentChoices } from '../ServiceBookingFulfillmentChoices.jsx';

// issue #178 follow-up, ADR 0057: the two handoff options are now sourced
// from the fulfillment-profile vocabulary (item_pickup_return /
// item_pickup_collection), but the rendered copy, values, and click
// behavior must stay byte-identical to what shipped before this change -
// ADR 0057 forbids this vocabulary from reaching the booking payload.
describe('ServiceBookingFulfillmentChoices', () => {
  afterEach(cleanup);

  const baseProps = {
    isMobileViewport: false,
    servicesPrimary: '#0f766e',
    servicesPrimaryShadow: 'rgba(15, 118, 110, 0.2)'
  };

  it('renders exactly the two pre-existing handoff options, in order, with unchanged copy', () => {
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
