// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RetailOrderFulfillmentStep } from './RetailOrderFulfillmentStep.jsx';

// #1218: this file's added (a)-(d) cases reuse overlapping queries ("NOW", "Schedule") across
// several `it` blocks in the same describe -- explicit cleanup keeps each render isolated
// regardless of whether the runner's implicit auto-cleanup is active.
afterEach(() => cleanup());

// #1217: a single available fulfillment method hides the chooser entirely (no more
// "Delivery (Unavailable)" card) and replaces it with a static notice; the inner sections
// renumber down by one. This rewrites the pre-#1217 test that asserted the disabled-but-visible
// treatment for a one-available/one-unavailable pair -- that pair now resolves to exactly one
// available method, so the chooser no longer renders for it at all.
describe('RetailOrderFulfillmentStep', () => {
  it('hides the chooser and states the sole method when only one is available', () => {
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

    expect(screen.queryByRole('button', { name: /Delivery/ })).toBeNull();
    expect(screen.queryByText('How would you like to receive your order?')).toBeNull();
    expect(screen.getByText('This order will be ready for pickup at the store.')).toBeTruthy();
    expect(screen.getByText('1. When would you like your order?')).toBeTruthy();
  });

  it('keeps the chooser and (Unavailable) treatment when two or more methods are available', () => {
    const onOrderMethodChange = vi.fn();
    render(<RetailOrderFulfillmentStep
      orderMethod="pickup"
      orderMethodOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: true }
      ]}
      onOrderMethodChange={onOrderMethodChange}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      onSpecialInstructionsChange={vi.fn()}
    />);

    expect(screen.getByText('1. How would you like to receive your order?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delivery' }));
    expect(onOrderMethodChange).toHaveBeenCalledWith('delivery');
    expect(screen.getByText('2. When would you like your order?')).toBeTruthy();
  });

  // #1218: the four delivery-timing-policy combinations. Default keeps today's exact behaviour
  // (non-regression pin); the other three are the new collapsing behaviours.
  const twoMethodOptions = [
    { value: 'delivery', label: 'Delivery', available: true },
    { value: 'pickup', label: 'Pickup', available: true }
  ];

  it('(a) default policy: NOW and Schedule both present, headings unchanged', () => {
    render(<RetailOrderFulfillmentStep
      orderMethod="delivery"
      orderMethodOptions={twoMethodOptions}
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      onSpecialInstructionsChange={vi.fn()}
    />);

    expect(screen.getByText('2. When would you like your order?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'NOW' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy();
    expect(screen.queryByTestId('order-timing-expectation')).toBeNull();
  });

  it('(b) scheduling disabled: no Schedule card, no datetime-local input', () => {
    render(<RetailOrderFulfillmentStep
      orderMethod="delivery"
      orderMethodOptions={twoMethodOptions}
      orderTimingPolicy={{ showSchedule: false, showImmediate: true, showTimingChooser: false, showTimingStep: true, leadTimeMinDays: null, leadTimeMaxDays: null, hasLeadTime: false }}
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      onSpecialInstructionsChange={vi.fn()}
    />);

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByText(/will be delivered NOW/)).toBeTruthy();
  });

  it('(c) immediate fulfillment disabled: no NOW card, no green callout, lead-time string present', () => {
    render(<RetailOrderFulfillmentStep
      orderMethod="delivery"
      orderMethodOptions={twoMethodOptions}
      orderTimingPolicy={{ showSchedule: true, showImmediate: false, showTimingChooser: false, showTimingStep: true, leadTimeMinDays: 3, leadTimeMaxDays: 3, hasLeadTime: true }}
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      onSpecialInstructionsChange={vi.fn()}
    />);

    expect(screen.queryByRole('button', { name: 'NOW' })).toBeNull();
    expect(screen.queryByText(/will be delivered NOW/)).toBeNull();
    expect(screen.getByText('Your order will be delivered within 3 days.')).toBeTruthy();
    expect(document.querySelector('input[type="datetime-local"]')).toBeTruthy();
  });

  it('(d) both disabled: no heading, no cards, exactly one order-timing-expectation notice, address renumbered', () => {
    render(<RetailOrderFulfillmentStep
      orderMethod="delivery"
      orderMethodOptions={twoMethodOptions}
      orderTimingPolicy={{ showSchedule: false, showImmediate: false, showTimingChooser: false, showTimingStep: false, leadTimeMinDays: 7, leadTimeMaxDays: 14, hasLeadTime: true }}
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      onSpecialInstructionsChange={vi.fn()}
    />);

    expect(screen.queryByText(/When would you like your order/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'NOW' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getAllByTestId('order-timing-expectation')).toHaveLength(1);
    expect(screen.getByText('Your order will be delivered in 7-14 days.')).toBeTruthy();
    expect(screen.getByText('2. Where should we deliver your order?')).toBeTruthy();
  });
});
