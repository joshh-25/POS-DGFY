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
    servicesPrimary: '#1A4E8D',
    servicesPrimarySoft: '#eaf4ff',
    servicesPrimaryBorder: '#cbd5e1',
    servicesPrimaryShadow: 'rgba(26, 78, 141, 0.2)'
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
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].style.border).toContain('rgb(26, 78, 141)');
    expect(buttons[1].style.background).toBe('rgb(234, 244, 255)');
    fireEvent.click(buttons[0]);
    expect(onOrderMethodChange).toHaveBeenCalledWith('delivery');

    fireEvent.click(buttons[1]);
    expect(onOrderMethodChange).toHaveBeenCalledWith('pickup');
  });

  it('keeps the selected highlight when the saved method has different casing or spacing', () => {
    render(
      <ServiceBookingFulfillmentChoices
        {...baseProps}
        serviceOrderMethod="  PICKUP  "
        onOrderMethodChange={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].style.border).toContain('rgb(26, 78, 141)');
  });

  it('uses the resolved service flow when the raw order method is temporarily empty', () => {
    render(
      <ServiceBookingFulfillmentChoices
        {...baseProps}
        serviceOrderMethod=""
        serviceFlowMethod="pickup"
        onOrderMethodChange={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[1].style.background).toBe('rgb(234, 244, 255)');
  });

  it('maps a legacy fulfillment profile to its matching handoff highlight', () => {
    render(
      <ServiceBookingFulfillmentChoices
        {...baseProps}
        serviceOrderMethod=""
        serviceFlowProfileMethod="item_pickup_collection"
        onOrderMethodChange={() => {}}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('renders the customer-location flow instead of Laundry handoffs', () => {
    render(
      <ServiceBookingFulfillmentChoices
        {...baseProps}
        serviceOrderMethod=""
        serviceFlowProfileMethod="on_site"
        onOrderMethodChange={() => {}}
      />
    );

    expect(screen.getByText("Service at the customer's address")).toBeTruthy();
    expect(screen.queryByText('Pick up and deliver')).toBeNull();
    expect(screen.queryByText("Pick up and I'll collect")).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('keeps both hybrid location choices neutral until the customer acts', () => {
    render(
      <ServiceBookingFulfillmentChoices
        {...baseProps}
        serviceOrderMethod=""
        serviceFlowProfileMethod="hybrid"
        onOrderMethodChange={() => {}}
      />
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getAllByRole('button').every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
  });
});
