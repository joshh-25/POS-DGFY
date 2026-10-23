// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosShiftRefreshButton from '../components/PosShiftRefreshButton.jsx';

afterEach(() => cleanup());

describe('PosShiftRefreshButton', () => {
  it('uses the DGFY primary palette and an accessible icon-only label', () => {
    const onClick = vi.fn();
    render(<PosShiftRefreshButton label="Refresh branch terminals" onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Refresh branch terminals' });
    expect(button.title).toBe('Refresh branch terminals');
    expect(button.classList.contains('!bg-[#1A4E8D]')).toBe(true);
    expect(button.classList.contains('text-white')).toBe(true);
    expect(button.textContent).toBe('');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks an in-progress refresh busy and prevents duplicate clicks', () => {
    const onClick = vi.fn();
    render(<PosShiftRefreshButton label="Refresh shift data" loading onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Refresh shift data' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('accepts a shared responsive height token for toolbar alignment', () => {
    render(
      <PosShiftRefreshButton
        label="Refresh cashier history"
        heightClassName="h-10 min-h-10 md:h-11 md:min-h-11 min-[1200px]:h-10 min-[1200px]:min-h-10"
        onClick={vi.fn()}
      />
    );

    const button = screen.getByRole('button', { name: 'Refresh cashier history' });
    expect(button.classList.contains('h-10')).toBe(true);
    expect(button.classList.contains('min-h-10')).toBe(true);
    expect(button.classList.contains('md:h-11')).toBe(true);
    expect(button.classList.contains('min-[1200px]:h-10')).toBe(true);
  });
});
