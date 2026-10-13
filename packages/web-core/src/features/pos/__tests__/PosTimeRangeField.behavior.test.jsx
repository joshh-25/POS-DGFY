/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosTimeRangeField from '../components/PosTimeRangeField.jsx';

const defaultMatchMedia = window.matchMedia;

describe('POS time range field', () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: defaultMatchMedia });
  });

  it('selects a start and end time with the wheel-style picker', () => {
    const onChange = vi.fn();
    render(
      <PosTimeRangeField
        id="voucher-time-range"
        onChange={onChange}
        compact
      />
    );

    const trigger = screen.getByRole('button', { name: 'Open daily time window' });
    expect(trigger.textContent).toContain('e.g. 09:00 AM');
    expect(trigger.textContent).toContain('e.g. 06:00 PM');
    expect(screen.getByRole('separator', { orientation: 'vertical' })).toBeTruthy();

    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Select daily time window' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('h-10 rounded-lg');
    expect(screen.getByRole('button', { name: 'Apply Times' }).className).toContain('h-10 rounded-lg');
    expect(screen.getByTestId('voucher-time-range-start-selection').textContent).toContain('e.g. 09:00 AM');
    expect(screen.getByTestId('voucher-time-range-end-selection').textContent).toContain('e.g. 06:00 PM');
    const startHourWheel = screen.getByRole('listbox', { name: 'Hour options' });

    // A vertical touch swipe changes the option that is centered in the wheel.
    fireEvent.pointerDown(startHourWheel, { pointerType: 'touch' });
    Object.defineProperty(startHourWheel, 'scrollTop', { configurable: true, writable: true, value: 9 * 48 });
    fireEvent.scroll(startHourWheel);
    expect(screen.getByTestId('voucher-time-range-start-hour-10').getAttribute('aria-selected')).toBe('true');

    fireEvent.wheel(startHourWheel, { deltaY: 100 });
    fireEvent.click(screen.getByTestId('voucher-time-range-start-hour-9'));
    fireEvent.click(screen.getByTestId('voucher-time-range-start-minute-30'));
    fireEvent.click(screen.getByTestId('voucher-time-range-end-selection'));
    fireEvent.click(screen.getByTestId('voucher-time-range-end-hour-6'));
    fireEvent.click(screen.getByTestId('voucher-time-range-end-period-PM'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Times' }));

    expect(onChange).toHaveBeenCalledWith('09:30', '18:00');
    expect(screen.queryByRole('dialog', { name: 'Select daily time window' })).toBeNull();
  });

  it('clears both times from the merged field', () => {
    const onChange = vi.fn();
    render(
      <PosTimeRangeField
        id="voucher-time-range"
        start="09:00"
        end="18:00"
        onChange={onChange}
        compact
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open daily time window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset daily time window' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Times' }));

    expect(onChange).toHaveBeenCalledWith('', '');
  });
});
