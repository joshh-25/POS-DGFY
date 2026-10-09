// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosShiftStateNotice from '../components/PosShiftStateNotice.jsx';

afterEach(() => cleanup());

describe('PosShiftStateNotice', () => {
  it('announces loading politely and exposes a reduced-motion-safe indicator', () => {
    render(<PosShiftStateNotice variant="loading" message="Checking shift status…" />);

    expect(screen.getByRole('status').textContent).toContain('Checking shift status…');
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByTestId('pos-shift-state-loading').querySelector('svg').getAttribute('class'))
      .toContain('motion-reduce:animate-none');
  });

  it('announces errors assertively and supports a retry action', () => {
    const onRetry = vi.fn();
    render(
      <PosShiftStateNotice
        variant="error"
        title="Shift status unavailable"
        message="Try loading the status again."
        actionLabel="Try again"
        onAction={onRetry}
      />
    );

    const error = screen.getByRole('alert');
    expect(error.getAttribute('aria-live')).toBe('assertive');
    expect(error.textContent).toContain('Shift status unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('uses status semantics for empty and warning states', () => {
    const { rerender } = render(<PosShiftStateNotice variant="empty" message="No open shifts." />);
    expect(screen.getByRole('status').textContent).toContain('No open shifts.');

    rerender(<PosShiftStateNotice variant="warning" message="Close this shift before day close." />);
    expect(screen.getByRole('status').textContent).toContain('Close this shift before day close.');

    rerender(<PosShiftStateNotice variant="success" message="Day Close is ready." />);
    expect(screen.getByRole('status').textContent).toContain('Day Close is ready.');
  });
});
