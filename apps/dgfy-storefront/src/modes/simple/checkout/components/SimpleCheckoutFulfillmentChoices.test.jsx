// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimpleCheckoutFulfillmentChoices } from './SimpleCheckoutFulfillmentChoices.jsx';

// #1218: this file's added (a)-(d) cases reuse overlapping queries ("NOW", "Schedule") across
// several `it` blocks in the same describe -- explicit cleanup keeps each render isolated
// regardless of whether the runner's implicit auto-cleanup is active.
afterEach(() => cleanup());

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
    expect(screen.getByTestId('pickup-only-fulfillment-notice')).toBeTruthy();
    expect(screen.getByText('Pickup only')).toBeTruthy();
    expect(screen.getByText('This store only offers pickup. Delivery is not available.')).toBeTruthy();
    expect(screen.queryByText('This order will be ready for pickup at the store.')).toBeNull();
    expect(screen.getByText('1. When would you like your order?')).toBeTruthy();
  });

  it('shows the shared DGFY delivery-only notice when pickup is disabled in POS', () => {
    render(<SimpleCheckoutFulfillmentChoices
      orderMethod="delivery"
      isDeliveryOrder
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      fnbScheduleMode="asap"
      fnbScheduledFor=""
      simpleOrderMethodOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: false }
      ]}
    />);

    expect(screen.getByTestId('delivery-only-fulfillment-notice')).toBeTruthy();
    expect(screen.getByText('Delivery only')).toBeTruthy();
    expect(screen.getByText('This store only offers delivery. Pickup is not available.')).toBeTruthy();
    expect(screen.queryByText('This store delivers your order.')).toBeNull();
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

  // #1218: the four delivery-timing-policy combinations. Default keeps today's exact behaviour
  // (non-regression pin); the other three are the new collapsing behaviours.
  const twoMethodOptions = [
    { value: 'delivery', label: 'Delivery', available: true },
    { value: 'pickup', label: 'Pickup', available: true }
  ];

  it('(a) default policy: NOW and Schedule both present, headings unchanged', () => {
    render(<SimpleCheckoutFulfillmentChoices
      orderMethod="delivery"
      isDeliveryOrder
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      fnbScheduleMode="asap"
      fnbScheduledFor=""
      simpleOrderMethodOptions={twoMethodOptions}
    />);

    expect(screen.getByText('2. When would you like your order?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'NOW' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy();
    expect(screen.queryByTestId('order-timing-expectation')).toBeNull();
  });

  it('stacks NOW and Schedule on small screens', () => {
    render(<SimpleCheckoutFulfillmentChoices
      isMobileViewport
      orderMethod="delivery"
      isDeliveryOrder
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      fnbScheduleMode="asap"
      fnbScheduledFor=""
      simpleOrderMethodOptions={twoMethodOptions}
    />);

    expect(screen.getByTestId('order-timing-choice-grid').style.gridTemplateColumns).toBe('1fr');
  });

  it('(b) immediate-only policy: no timing selector, input, or redundant NOW banner', () => {
    render(<SimpleCheckoutFulfillmentChoices
      orderMethod="delivery"
      isDeliveryOrder
      orderTimingPolicy={{ showSchedule: false, showImmediate: true, showTimingChooser: false, showTimingStep: true, leadTimeMinDays: null, leadTimeMaxDays: null, hasLeadTime: false }}
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      fnbScheduleMode="asap"
      fnbScheduledFor=""
      simpleOrderMethodOptions={twoMethodOptions}
    />);

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.queryByText(/When would you like your order/)).toBeNull();
    expect(screen.queryByText(/will be delivered NOW/)).toBeNull();
  });

  it('(c) immediate fulfillment disabled: no NOW card, no green callout, lead-time string present', () => {
    render(<SimpleCheckoutFulfillmentChoices
      orderMethod="delivery"
      isDeliveryOrder
      orderTimingPolicy={{ showSchedule: true, showImmediate: false, showTimingChooser: false, showTimingStep: true, leadTimeMinDays: 3, leadTimeMaxDays: 3, hasLeadTime: true }}
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      fnbScheduleMode="asap"
      fnbScheduledFor=""
      simpleOrderMethodOptions={twoMethodOptions}
    />);

    expect(screen.queryByRole('button', { name: 'NOW' })).toBeNull();
    expect(screen.queryByText(/will be delivered NOW/)).toBeNull();
    expect(screen.getByText('Your order will be delivered within 3 days.')).toBeTruthy();
    expect(document.querySelector('input[type="datetime-local"]')).toBeTruthy();
  });

  it('(d) both disabled: no heading, no cards, exactly one order-timing-expectation notice', () => {
    render(<SimpleCheckoutFulfillmentChoices
      orderMethod="delivery"
      isDeliveryOrder
      orderTimingPolicy={{ showSchedule: false, showImmediate: false, showTimingChooser: false, showTimingStep: false, leadTimeMinDays: 7, leadTimeMaxDays: 14, hasLeadTime: true }}
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      fnbScheduleMode="asap"
      fnbScheduledFor=""
      simpleOrderMethodOptions={twoMethodOptions}
    />);

    expect(screen.queryByText(/When would you like your order/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'NOW' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getAllByTestId('order-timing-expectation')).toHaveLength(1);
    expect(screen.getByText('Your order will be delivered in 7-14 days.')).toBeTruthy();
  });
});
