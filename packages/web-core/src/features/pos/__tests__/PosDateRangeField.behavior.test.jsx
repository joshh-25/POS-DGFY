/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosDateRangeField from '../components/PosDateRangeField.jsx';
import PosDateRangePicker from '../components/PosDateRangePicker.jsx';

const defaultMatchMedia = window.matchMedia;

describe('POS date range field', () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: defaultMatchMedia });
  });

  it('uses one merged trigger and applies the selected range through the History calendar flow', () => {
    const onChange = vi.fn();
    render(
      <PosDateRangeField
        id="voucher-validity-range"
        from="2026-09-18"
        to="2026-09-18"
        onChange={onChange}
        compact
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open validity dates calendar' });
    expect(trigger.textContent).toContain('09/18/2026');
    expect(trigger.textContent).toContain('From');
    expect(trigger.textContent).toContain('Until');
    expect(screen.getByRole('separator', { orientation: 'vertical' })).toBeTruthy();
    expect(screen.getAllByText('09/18/2026')).toHaveLength(2);

    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: 'Select validity dates' });
    expect(screen.queryByRole('group', { name: 'Date presets' })).toBeNull();
    expect(screen.getByTestId('voucher-validity-range-from-summary').textContent).toContain('09/18/2026');
    expect(screen.getByTestId('voucher-validity-range-until-summary').textContent).toContain('09/18/2026');
    expect(dialog.closest('[data-dialog-root="true"]').className).toContain('z-[10000]');
    expect(document.querySelector('[data-dialog-overlay="true"]').className).toContain('bg-slate-950/60');
    expect(dialog.className).toContain('max-w-[36rem]');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('h-10 rounded-lg');
    expect(screen.getByRole('button', { name: 'Apply Dates' }).className).toContain('h-10 rounded-lg');

    const start = screen.getByRole('gridcell', { name: 'Sep 10, 2026' });
    const end = screen.getByRole('gridcell', { name: 'Sep 18, 2026' });
    fireEvent.pointerDown(start, { pointerId: 1 });
    fireEvent.pointerEnter(end, { pointerId: 1 });
    fireEvent.pointerUp(end, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Dates' }));

    expect(onChange).toHaveBeenCalledWith('2026-09-10', '2026-09-18');
    expect(screen.queryByRole('dialog', { name: 'Select validity dates' })).toBeNull();
  });

  it('can clear an optional validity window from the merged field', () => {
    const onChange = vi.fn();
    render(
      <PosDateRangeField
        id="voucher-validity-range"
        from="2026-09-10"
        to="2026-09-18"
        onChange={onChange}
        compact
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open validity dates calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset validity dates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Dates' }));

    expect(onChange).toHaveBeenCalledWith('', '');
  });

  it('treats one clicked date as a one-day validity range', () => {
    const onChange = vi.fn();
    render(
      <PosDateRangeField
        id="voucher-validity-range"
        from="2026-09-18"
        to="2026-09-18"
        onChange={onChange}
        compact
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open validity dates calendar' }));
    fireEvent.click(screen.getByRole('gridcell', { name: 'Sep 10, 2026' }));

    expect(screen.getByTestId('voucher-validity-range-from-summary').textContent).toContain('09/10/2026');
    expect(screen.getByTestId('voucher-validity-range-until-summary').textContent).toContain('Select second date');

    fireEvent.click(screen.getByRole('button', { name: 'Apply Dates' }));

    expect(onChange).toHaveBeenCalledWith('2026-09-10', '2026-09-10');
  });

  it('moves to the next and previous month with horizontal calendar swipes', () => {
    render(
      <PosDateRangeField
        id="voucher-validity-range"
        from="2026-09-18"
        to="2026-09-18"
        onChange={vi.fn()}
        compact
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open validity dates calendar' }));
    const monthView = screen.getByTestId('voucher-validity-range-calendar-month-view');
    const monthLabel = () => monthView.querySelector('[aria-live="polite"]')?.textContent;

    expect(monthLabel()).toContain('September 2026');

    // A left swipe advances to the next month.
    fireEvent.pointerDown(monthView, { pointerId: 1, pointerType: 'touch', clientX: 150, clientY: 120 });
    fireEvent.pointerMove(monthView, { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 122 });
    fireEvent.pointerUp(monthView, { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 122 });
    expect(monthLabel()).toContain('October 2026');
    expect(monthView.querySelector('.pos-date-range-calendar-month-transition-next')).toBeTruthy();

    // A right swipe returns to the previous month.
    fireEvent.pointerDown(monthView, { pointerId: 2, pointerType: 'touch', clientX: 80, clientY: 120 });
    fireEvent.pointerMove(monthView, { pointerId: 2, pointerType: 'touch', clientX: 150, clientY: 122 });
    fireEvent.pointerUp(monthView, { pointerId: 2, pointerType: 'touch', clientX: 150, clientY: 122 });
    expect(monthLabel()).toContain('September 2026');
    expect(monthView.querySelector('.pos-date-range-calendar-month-transition-previous')).toBeTruthy();
  });

  it('animates when selecting an outside-month date', () => {
    render(
      <PosDateRangePicker
        from="2026-09-18"
        to="2026-09-18"
        onChange={vi.fn()}
        showPresets={false}
      />
    );

    const monthView = screen.getByTestId('pos-history-calendar-month-view');
    fireEvent.click(screen.getByTestId('pos-history-calendar-day-2026-10-01'));

    expect(monthView.querySelector('[aria-live="polite"]')?.textContent).toContain('October 2026');
    expect(monthView.querySelector('.pos-date-range-calendar-month-transition-next')).toBeTruthy();
  });

  it('animates when a date preset changes the visible month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 12));

    try {
      render(
        <PosDateRangePicker
          from="2026-09-18"
          to="2026-09-18"
          onChange={vi.fn()}
        />
      );

      const monthView = screen.getByTestId('pos-history-calendar-month-view');
      fireEvent.click(screen.getByTestId('pos-history-calendar-preset-today'));

      expect(monthView.querySelector('[aria-live="polite"]')?.textContent).toContain('October 2026');
      expect(monthView.querySelector('.pos-date-range-calendar-month-transition-next')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
