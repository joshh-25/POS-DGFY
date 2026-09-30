/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosSingleDatePicker from '../components/PosSingleDatePicker.jsx';

const defaultMatchMedia = window.matchMedia;

describe('POS single-date calendar', () => {
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: defaultMatchMedia });
  });

  it('selects one business date, commits it immediately, and closes', () => {
    const onChange = vi.fn();
    render(
      <PosSingleDatePicker
        id="business-date"
        value="2026-09-30"
        todayDate="2026-09-30"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open business date calendar' }));

    expect(screen.getByRole('dialog', { name: 'Select business date' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Date presets' })).toBeNull();
    fireEvent.click(screen.getByRole('gridcell', { name: 'Sep 15, 2026' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('2026-09-15');
    expect(screen.queryByRole('dialog', { name: 'Select business date' })).toBeNull();
  });

  it('uses the supplied branch business date for the Today shortcut', () => {
    const onChange = vi.fn();
    render(
      <PosSingleDatePicker
        id="business-date"
        value="2026-09-30"
        todayDate="2026-10-01"
        onChange={onChange}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open business date calendar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(onChange).toHaveBeenCalledWith('2026-10-01');
  });

  it('uses the responsive mobile calendar sheet at a phone viewport', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query) => ({
        matches: query === '(max-width: 767px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    });

    render(<PosSingleDatePicker id="business-date" value="2026-09-30" />);
    fireEvent.click(screen.getByRole('button', { name: 'Open business date calendar' }));

    expect(screen.getByRole('dialog', { name: 'Select business date' }).className).toContain('dgfy-pos-history-mobile-sheet');
  });

  it('retains direct date entry and rejects invalid dates without changing the selection', () => {
    const onChange = vi.fn();
    render(<PosSingleDatePicker id="business-date" value="2026-09-30" onChange={onChange} />);
    const dateInput = screen.getByRole('textbox');

    fireEvent.change(dateInput, { target: { value: '10/05/2026' } });
    expect(onChange).toHaveBeenCalledWith('2026-10-05');

    fireEvent.change(dateInput, { target: { value: '02/31/2026' } });
    fireEvent.blur(dateInput);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toBe('Enter a valid date in MM/DD/YYYY format.');
  });
});
