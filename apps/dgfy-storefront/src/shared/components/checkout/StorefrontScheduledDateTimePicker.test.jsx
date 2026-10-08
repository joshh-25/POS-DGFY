// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontScheduledDateTimePicker } from './StorefrontScheduledDateTimePicker.jsx';

const alwaysOpenStorefrontHours = {
  mode: 'weekly',
  timezone: 'Asia/Manila',
  weekly: Object.fromEntries(
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [day, {
      enabled: true,
      open: '10:00',
      close: '22:00',
      intervals: [{ open: '10:00', close: '22:00' }]
    }])
  )
};

const swipeCalendar = (calendar, startX, startY, endX, endY) => {
  fireEvent.touchStart(calendar, {
    touches: [{ identifier: 1, clientX: startX, clientY: startY }]
  });
  fireEvent.touchMove(calendar, {
    touches: [{ identifier: 1, clientX: endX, clientY: endY }]
  });
  fireEvent.touchEnd(calendar, {
    touches: [],
    changedTouches: [{ identifier: 1, clientX: endX, clientY: endY }]
  });
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StorefrontScheduledDateTimePicker responsive layout', () => {
  it('starts in the branch current month and blocks prior months for delivery', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T17:00:00.000Z'));
    render(<StorefrontScheduledDateTimePicker availabilityMode="delivery" onApply={vi.fn()} onOpenChange={vi.fn()} open storefrontHours={alwaysOpenStorefrontHours} />);
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous month' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Select September 25, 2026' }).disabled).toBe(true);
    swipeCalendar(screen.getByTestId('scheduled-date-calendar'), 100, 100, 200, 100);
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();
  });

  it('restricts selectable dates to the configured branch lead-time window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T01:00:00.000Z'));
    render(<StorefrontScheduledDateTimePicker availabilityMode="pickup" leadTimeMinDays={3} leadTimeMaxDays={5} onApply={vi.fn()} onOpenChange={vi.fn()} open storefrontHours={alwaysOpenStorefrontHours} />);
    expect(screen.getByRole('button', { name: 'Outside scheduling window on September 28, 2026' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Select September 29, 2026' }).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Outside scheduling window on October 2, 2026' }).disabled).toBe(true);
  });
  it('does not invent opening hours when the branch has no hours configured', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T08:00:00'));
    render(<StorefrontScheduledDateTimePicker onApply={vi.fn()} onOpenChange={vi.fn()} open />);
    expect(screen.getByRole('button', { name: 'Store hours unavailable on September 23, 2026' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(/Scheduling is unavailable until branch hours are set/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply' }).disabled).toBe(true);
  });
  it('restricts delivery and pickup to branch hours while exposing every minute in the rollers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T08:00:00'));
    const hours = {
      ...alwaysOpenStorefrontHours,
      weekly: {
        ...alwaysOpenStorefrontHours.weekly,
        wed: { enabled: false, intervals: [{ open: '10:00', close: '22:00' }] },
        thu: { enabled: true, intervals: [{ open: '10:15', close: '11:00' }] }
      }
    };
    for (const mode of ['delivery', 'pickup']) {
      const onApply = vi.fn();
      const view = render(<StorefrontScheduledDateTimePicker availabilityMode={mode} onApply={onApply} onOpenChange={vi.fn()} open storefrontHours={hours} />);
      expect(screen.getByRole('button', { name: 'Select September 22, 2026' }).disabled).toBe(true);
      const closedDay = screen.getByRole('button', { name: 'Store closed on September 23, 2026' });
      fireEvent.click(closedDay);
      expect(screen.getByText(/The store is closed on September 23, 2026/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Select September 24, 2026' }));
      const hourWheel = screen.getByRole('listbox', { name: 'Hour' });
      const minuteWheel = screen.getByRole('listbox', { name: 'Minute' });
      expect(within(hourWheel).getByRole('option', { name: '10' }).disabled).toBe(false);
      expect(within(hourWheel).getByRole('option', { name: '9' }).disabled).toBe(true);
      expect(within(minuteWheel).getByRole('option', { name: '15' }).disabled).toBe(false);
      expect(within(minuteWheel).getByRole('option', { name: '20' }).disabled).toBe(false);
      expect(within(minuteWheel).getByRole('option', { name: '55' }).disabled).toBe(false);
      expect(within(minuteWheel).getByRole('option', { name: '16' }).disabled).toBe(false);
      expect(within(minuteWheel).getByRole('option', { name: '14' }).disabled).toBe(true);
      expect(within(minuteWheel).getByRole('option', { name: '59' })).toBeTruthy();
      view.unmount();
    }
  });
  it('selects minute-precision values from the roller and stops at 59', () => {
    vi.useFakeTimers();
    // Absolute instant whose Asia/Manila branch wall is 08:00 on 2026-09-23, so the
    // 10:00 wall-clock value below is in the future on any runner TZ (CI runs UTC).
    vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
    render(
      <StorefrontScheduledDateTimePicker
        onApply={vi.fn()}
        onOpenChange={vi.fn()}
        open
        storefrontHours={alwaysOpenStorefrontHours}
        value="2026-09-23T10:00"
      />
    );

    fireEvent.click(screen.getByRole('option', { name: '16' }));
    expect(screen.getByRole('option', { name: '16' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('option', { name: '60' })).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: '59' }));
    expect(screen.getByRole('option', { name: '59' }).getAttribute('aria-selected')).toBe('true');
  });

  it('allows keyboard users to reach closed dates and hear why they cannot select them', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-22T08:00:00'));
    const hours = {
      ...alwaysOpenStorefrontHours,
      weekly: {
        ...alwaysOpenStorefrontHours.weekly,
        wed: { enabled: false, intervals: [] }
      }
    };

    render(
      <StorefrontScheduledDateTimePicker
        availabilityMode="delivery"
        onApply={vi.fn()}
        onOpenChange={vi.fn()}
        open
        storefrontHours={hours}
        value="2026-09-22T14:00"
      />
    );

    const openDate = screen.getByRole('button', { name: 'Select September 22, 2026' });
    const closedDate = screen.getByRole('button', { name: 'Store closed on September 23, 2026' });
    expect(closedDate.disabled).toBe(false);
    expect(closedDate.getAttribute('aria-disabled')).toBe('true');

    fireEvent.keyDown(openDate, { key: 'ArrowRight' });
    expect(closedDate.tabIndex).toBe(0);
    fireEvent.click(closedDate);

    expect(screen.getByText(/The store is closed on September 23, 2026/)).toBeTruthy();
    expect(openDate.getAttribute('aria-pressed')).toBe('true');
  });
  it('keeps the shortcuts compact while preserving mobile calendar touch targets', () => {
    vi.useFakeTimers();
    // Noon in Asia/Manila keeps the selected 14:30 time before closing at 22:00.
    vi.setSystemTime(new Date('2026-09-28T04:00:00.000Z'));
    render(
      <StorefrontScheduledDateTimePicker
        isResponsive
        storefrontHours={alwaysOpenStorefrontHours}
        onApply={vi.fn()}
        onOpenChange={vi.fn()}
        open
        value="2026-09-28T14:30"
      />
    );

    expect(screen.getByRole('button', { name: 'Today' }).style.minHeight).toBe('32px');
    expect(screen.getByRole('button', { name: 'Previous month' }).style.height).toBe('40px');
    expect(screen.getByRole('button', { name: 'Select September 28, 2026' }).style.height).toBe('42px');
    expect(screen.getByRole('listbox', { name: 'Hour' }).style.height).toBe('132px');
    const header = screen.getByTestId('scheduled-calendar-header');
    expect(header.firstElementChild.getAttribute('aria-label')).toBe('Previous month');
    expect(header.lastElementChild.getAttribute('aria-label')).toBe('Next month');
    expect(header.nextElementSibling).toBe(screen.getByTestId('scheduled-date-shortcuts'));
    expect(header.style.display).toBe('grid');
  });

  it('treats the next day as the start of next week when today is Sunday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T09:00:00'));
    render(
      <StorefrontScheduledDateTimePicker
        onApply={vi.fn()}
        storefrontHours={alwaysOpenStorefrontHours}
        onOpenChange={vi.fn()}
        open
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next Week' }));
    expect(screen.getByRole('button', { name: 'Select September 28, 2026' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('explains and supports horizontal month and vertical year swipes on the date grid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T09:00:00'));
    render(
      <StorefrontScheduledDateTimePicker
        isResponsive
        storefrontHours={alwaysOpenStorefrontHours}
        onApply={vi.fn()}
        onOpenChange={vi.fn()}
        open
        value="2026-09-28T14:30"
      />
    );

    const helpButton = screen.getByRole('button', { name: 'Calendar swipe instructions' });
    const helpControl = helpButton.parentElement;
    fireEvent.pointerEnter(helpControl, { pointerType: 'mouse' });
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerLeave(helpControl, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(helpButton);
    expect(screen.getByRole('tooltip').textContent).toMatch(/left for next month or right for previous month/i);
    expect(screen.getByRole('tooltip').textContent).toMatch(/up for next year or down for previous year/i);

    const calendar = screen.getByTestId('scheduled-date-calendar');
    swipeCalendar(calendar, 240, 180, 150, 180);
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy();

    swipeCalendar(calendar, 150, 180, 240, 180);
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();

    swipeCalendar(calendar, 200, 240, 200, 150);
    expect(screen.getByRole('heading', { name: 'September 2027' })).toBeTruthy();

    swipeCalendar(calendar, 200, 150, 200, 240);
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();
  });

  it('stops a dine-in year swipe at the 90-day booking-window month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T09:00:00'));
    render(
      <StorefrontScheduledDateTimePicker
        availabilityMode="dine_in"
        onApply={vi.fn()}
        onOpenChange={vi.fn()}
        open
        storefrontHours={alwaysOpenStorefrontHours}
        value="2026-09-28T14:30"
      />
    );

    swipeCalendar(screen.getByTestId('scheduled-date-calendar'), 200, 240, 200, 150);

    expect(screen.getByRole('heading', { name: 'December 2026' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next month' }).disabled).toBe(true);
  });
});
