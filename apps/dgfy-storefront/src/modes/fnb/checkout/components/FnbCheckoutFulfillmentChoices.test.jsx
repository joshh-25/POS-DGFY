// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FnbCheckoutFulfillmentChoices } from './FnbCheckoutFulfillmentChoices.jsx';

// #1218: this file's added (a)-(d) cases reuse overlapping queries ("NOW", "Schedule") across
// several `it` blocks in the same describe -- explicit cleanup keeps each render isolated
// regardless of whether the runner's implicit auto-cleanup is active.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const dineInStorefrontHours = {
  mode: 'weekly',
  timezone: 'Asia/Manila',
  weekly: {
    sun: { enabled: true, open: '10:00', close: '22:00', intervals: [{ open: '10:00', close: '22:00' }] },
    mon: { enabled: true, open: '10:00', close: '22:00', intervals: [{ open: '10:00', close: '22:00' }] },
    tue: { enabled: true, open: '10:00', close: '22:00', intervals: [{ open: '10:00', close: '22:00' }] },
    wed: { enabled: true, open: '10:00', close: '22:00', intervals: [{ open: '10:00', close: '22:00' }] },
    thu: { enabled: true, open: '10:00', close: '22:00', intervals: [{ open: '10:00', close: '22:00' }] },
    fri: { enabled: true, open: '10:00', close: '22:00', intervals: [{ open: '10:00', close: '22:00' }] },
    sat: { enabled: true, open: '10:00', close: '22:00', intervals: [{ open: '10:00', close: '22:00' }] }
  },
  display: 'Sun-Sat 10:00 AM - 10:00 PM'
};

const closedWednesdayStorefrontHours = {
  ...dineInStorefrontHours,
  weekly: {
    ...dineInStorefrontHours.weekly,
    wed: { enabled: false, open: '10:00', close: '22:00', intervals: [{ open: '10:00', close: '22:00' }] }
  }
};

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
    orderMethod: 'delivery',
    storefrontHours: dineInStorefrontHours
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
    expect(screen.getByText('Delivery only')).toBeTruthy();
    expect(screen.getByText('This store only offers delivery. Pickup is not available.')).toBeTruthy();
    expect(screen.getByText('1. When would you like your order?')).toBeTruthy();
  });

  it('shows the shared DGFY delivery-only notice when pickup is disabled in POS', () => {
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={vi.fn()}
      fulfillmentOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: false }
      ]}
    />);

    expect(screen.getByTestId('delivery-only-fulfillment-notice')).toBeTruthy();
    expect(screen.getByText('Delivery only')).toBeTruthy();
    expect(screen.getByText('This store only offers delivery. Pickup is not available.')).toBeTruthy();
    expect(screen.queryByText('This store delivers your order.')).toBeNull();
  });

  it('shows the shared DGFY ice-blue pickup-only notice when delivery is disabled in POS', () => {
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      isDeliveryOrder={false}
      orderMethod="pickup"
      onOrderMethodChange={vi.fn()}
      fulfillmentOptions={[
        { value: 'delivery', label: 'Delivery', available: false },
        { value: 'pickup', label: 'Pickup', available: true }
      ]}
    />);

    expect(screen.getByTestId('pickup-only-fulfillment-notice')).toBeTruthy();
    expect(screen.getByText('Pickup only')).toBeTruthy();
    expect(screen.getByText('This store only offers pickup. Delivery is not available.')).toBeTruthy();
    expect(screen.queryByText('This order will be ready for pickup at the store.')).toBeNull();
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

  it('opens the required dine-in date/time dialog and saves the scheduled value', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T09:00:00'));
    const onOrderMethodChange = vi.fn();
    const onScheduleModeChange = vi.fn();
    const onScheduledForChange = vi.fn();
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={onOrderMethodChange}
      onScheduleModeChange={onScheduleModeChange}
      onScheduledForChange={onScheduledForChange}
      fulfillmentOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: true },
        { value: 'dine_in', label: 'Dine In', available: true }
      ]}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Dine In' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Choose your date & time')).toBeTruthy();
    expect(screen.queryByText('Scheduling for')).toBeNull();
    expect(screen.queryByText("Tell us when you'd like to dine in or schedule your order.")).toBeNull();
    expect(screen.queryByText('You can adjust this later')).toBeNull();
    expect(screen.queryByText(/Good\s*food ahead!/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Select September 30, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'PM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select 6:30 PM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Date & Time' }));

    expect(onOrderMethodChange).toHaveBeenCalledWith('dine_in');
    expect(onScheduleModeChange).toHaveBeenCalledWith('schedule');
    expect(onScheduledForChange).toHaveBeenCalledWith('2026-09-30T18:30');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('disables closed dates and keeps all-day unavailable for dine-in', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T09:00:00'));
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={vi.fn()}
      onScheduleModeChange={vi.fn()}
      onScheduledForChange={vi.fn()}
      fulfillmentOptions={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'dine_in', label: 'Dine In', available: true }
      ]}
      storefrontHours={closedWednesdayStorefrontHours}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Dine In' }));

    expect(screen.getByRole('button', { name: 'Select September 23, 2026' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Select September 24, 2026' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'All day' }).disabled).toBe(true);
  });

  // #1218: the four delivery-timing-policy combinations. Default keeps today's exact behaviour
  // (non-regression pin); the other three are the new collapsing behaviours.
  const twoFulfillmentOptions = [
    { value: 'delivery', label: 'Delivery', available: true },
    { value: 'pickup', label: 'Pickup', available: true }
  ];

  it('(a) default policy: NOW and Schedule both present, headings unchanged', () => {
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={vi.fn()}
      fulfillmentOptions={twoFulfillmentOptions}
    />);

    expect(screen.getByText('2. When would you like your order?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'NOW' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeTruthy();
    expect(screen.queryByTestId('order-timing-expectation')).toBeNull();
  });

  it('stacks NOW and Schedule in the small-screen responsive flow', () => {
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      isResponsive
      onOrderMethodChange={vi.fn()}
      fulfillmentOptions={twoFulfillmentOptions}
    />);

    expect(screen.getByTestId('order-timing-choice-grid').style.gridTemplateColumns).toBe('1fr');
  });

  it('(b) immediate-only policy: no timing selector, input, or redundant NOW banner', () => {
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={vi.fn()}
      fulfillmentOptions={twoFulfillmentOptions}
      orderTimingPolicy={{ showSchedule: false, showImmediate: true, showTimingChooser: false, showTimingStep: true, leadTimeMinDays: null, leadTimeMaxDays: null, hasLeadTime: false }}
    />);

    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.queryByText(/When would you like your order/)).toBeNull();
    expect(screen.queryByText(/deliver your order NOW/)).toBeNull();
  });

  it('(c) immediate fulfillment disabled: no NOW card, no green callout, lead-time string present', () => {
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={vi.fn()}
      fulfillmentOptions={twoFulfillmentOptions}
      orderTimingPolicy={{ showSchedule: true, showImmediate: false, showTimingChooser: false, showTimingStep: true, leadTimeMinDays: 3, leadTimeMaxDays: 3, hasLeadTime: true }}
    />);

    expect(screen.queryByRole('button', { name: 'NOW' })).toBeNull();
    expect(screen.queryByText(/deliver your order NOW/)).toBeNull();
    expect(screen.getByText('Your order will be delivered within 3 days.')).toBeTruthy();
    expect(document.querySelector('input[type="datetime-local"]')).toBeTruthy();
  });

  it('(d) both disabled: no heading, no cards, exactly one order-timing-expectation notice', () => {
    render(<FnbCheckoutFulfillmentChoices
      {...baseProps}
      onOrderMethodChange={vi.fn()}
      fulfillmentOptions={twoFulfillmentOptions}
      orderTimingPolicy={{ showSchedule: false, showImmediate: false, showTimingChooser: false, showTimingStep: false, leadTimeMinDays: 7, leadTimeMaxDays: 14, hasLeadTime: true }}
    />);

    expect(screen.queryByText(/When would you like your order/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'NOW' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Schedule' })).toBeNull();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getAllByTestId('order-timing-expectation')).toHaveLength(1);
    expect(screen.getByText('Your order will be delivered in 7-14 days.')).toBeTruthy();
  });
});
