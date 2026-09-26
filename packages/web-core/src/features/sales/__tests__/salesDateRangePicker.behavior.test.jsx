/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SalesDateRangePicker, { getSalesDateRangePreset } from '../components/SalesDateRangePicker.jsx';

const initialRange = { dateFrom: '2026-09-13', dateTo: '2026-09-19' };

const DateRangeHarness = ({ initial = initialRange }) => {
  const [appliedRange, setAppliedRange] = useState(initial);

  return (
    <>
      <SalesDateRangePicker {...appliedRange} onApply={setAppliedRange} />
      <output data-testid="applied-range">{appliedRange.dateFrom}|{appliedRange.dateTo}</output>
    </>
  );
};

afterEach(() => cleanup());

describe('SalesDateRangePicker', () => {
  it('calculates the supported preset ranges from a known date', () => {
    const today = new Date(2026, 8, 22);

    expect(getSalesDateRangePreset('today', today)).toEqual({ dateFrom: '2026-09-22', dateTo: '2026-09-22' });
    expect(getSalesDateRangePreset('yesterday', today)).toEqual({ dateFrom: '2026-09-21', dateTo: '2026-09-21' });
    expect(getSalesDateRangePreset('this_week', today)).toEqual({ dateFrom: '2026-09-20', dateTo: '2026-09-22' });
    expect(getSalesDateRangePreset('last_week', today)).toEqual({ dateFrom: '2026-09-13', dateTo: '2026-09-19' });
    expect(getSalesDateRangePreset('this_month', today)).toEqual({ dateFrom: '2026-09-01', dateTo: '2026-09-22' });
    expect(getSalesDateRangePreset('last_month', today)).toEqual({ dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    expect(getSalesDateRangePreset('last_7_days', today)).toEqual({ dateFrom: '2026-09-16', dateTo: '2026-09-22' });
    expect(getSalesDateRangePreset('last_30_days', today)).toEqual({ dateFrom: '2026-08-24', dateTo: '2026-09-22' });
  });

  it('keeps preset changes as a draft until Done and discards them on Cancel', async () => {
    const user = userEvent.setup();
    render(<DateRangeHarness />);

    const trigger = screen.getByRole('button', { name: 'Sales date range: 2026-09-13 to 2026-09-19' });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Select sales date range' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Last 30 days' })).toBeTruthy();
    expect(screen.getByLabelText('Start date').value).toBe('2026-09-13');
    expect(screen.getByLabelText('End date').value).toBe('2026-09-19');

    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(screen.getByLabelText('Start date').value).not.toBe('2026-09-13');
    expect(screen.getByTestId('applied-range').textContent).toBe('2026-09-13|2026-09-19');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Select sales date range' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Sales date range: 2026-09-13 to 2026-09-19' })).toBeTruthy();
    expect(screen.getByTestId('applied-range').textContent).toBe('2026-09-13|2026-09-19');

    await user.click(screen.getByRole('button', { name: 'Sales date range: 2026-09-13 to 2026-09-19' }));
    await user.click(screen.getByRole('button', { name: 'Today' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));

    const expectedToday = getSalesDateRangePreset('today', new Date());
    expect(screen.getByTestId('applied-range').textContent).toBe(`${expectedToday.dateFrom}|${expectedToday.dateTo}`);
  });
});
