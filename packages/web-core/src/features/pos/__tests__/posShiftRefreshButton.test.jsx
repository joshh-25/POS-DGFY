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
});
