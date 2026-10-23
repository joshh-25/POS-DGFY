// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminBranchShiftMonitor from '../components/AdminBranchShiftMonitor.jsx';

afterEach(() => cleanup());

describe('AdminBranchShiftMonitor', () => {
  it('shows loading instead of a false zero-shift empty state', () => {
    render(<AdminBranchShiftMonitor loading />);

    expect(screen.getByRole('status').textContent).toContain('Loading shifts…');
    expect(screen.queryByText('No active shifts.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('shows refresh errors while leaving retry in the shared Shift Location toolbar', () => {
    render(<AdminBranchShiftMonitor errorMessage="Branch monitor is unavailable." />);

    expect(screen.getByRole('alert').textContent).toContain('Branch monitor is unavailable.');
    expect(screen.queryByText('No active shifts.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('shows the empty state only after a successful response without adding a local refresh control', () => {
    render(<AdminBranchShiftMonitor />);
    expect(screen.getByRole('status').textContent).toContain('No active shifts.');
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
  });

  it('renders a compact stale-shift card and sends the selected shift to recovery', () => {
    const onRecoverShift = vi.fn();
    const shift = {
      pos_terminal_shift_id: 11,
      terminal_id: 'COUNTER-01',
      cashier: { username: 'Len2' },
      opened_at: '2026-10-01T18:20:27.000Z',
      stale_recovery: { is_stale: true, age_minutes: 8460 }
    };

    render(
      <AdminBranchShiftMonitor
        shifts={[shift]}
        canRecoverStaleShifts
        onRecoverShift={onRecoverShift}
        formatDateTime={() => '10/1/2026, 6:20:27 PM'}
      />
    );

    expect(screen.getByRole('heading', { name: 'Active Shifts' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Active Shifts' }).className).toContain('text-base');
    expect(screen.getByRole('heading', { name: 'Active Shifts' }).className).toContain('leading-5');
    expect(screen.getByRole('heading', { name: 'Active Shifts' }).className).toContain('pos-terminal-section-heading');
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(screen.getByText('1 active · 1 stale to review')).toBeTruthy();
    expect(screen.getByText('COUNTER-01')).toBeTruthy();
    const counterCard = screen.getByText('COUNTER-01').parentElement?.parentElement?.parentElement;
    expect(counterCard?.className).toContain('border-[#C9DCF5]');
    expect(counterCard?.className).toContain('bg-[#F2F7FF]');
    expect(screen.getByTestId('pos-admin-branch-shift-monitor').className).not.toContain('rounded-lg');
    expect(screen.getByText('Opened by Len2')).toBeTruthy();
    expect(screen.getByText('Opened: 10/1/2026, 6:20:27 PM')).toBeTruthy();
    expect(screen.getByText('Shift ID: #11')).toBeTruthy();
    expect(screen.getByText('Open for 141h')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Recover Stale Shift' }));
    expect(onRecoverShift).toHaveBeenCalledWith(shift);
  });

  it('places the shared refresh action beside the shift title and summary', () => {
    render(
      <AdminBranchShiftMonitor
        shifts={[]}
        refreshAction={<button type="button" aria-label="Refresh branch activity">Refresh</button>}
      />
    );

    const header = screen.getByTestId('pos-admin-branch-monitor-header');
    expect(header.contains(screen.getByRole('heading', { name: 'Active Shifts' }))).toBe(true);
    expect(header.contains(screen.getByText('0 active'))).toBe(true);
    expect(header.contains(screen.getByRole('button', { name: 'Refresh branch activity' }))).toBe(true);
  });

  it('keeps recovery absent for active shifts and stale shifts without recovery permission', () => {
    const activeShift = {
      pos_terminal_shift_id: 12,
      terminal_id: 'COUNTER-02',
      stale_recovery: { is_stale: false }
    };
    const staleShift = {
      pos_terminal_shift_id: 13,
      terminal_id: 'COUNTER-03',
      stale_recovery: { is_stale: true, age_minutes: 180 }
    };

    const { rerender } = render(
      <AdminBranchShiftMonitor shifts={[activeShift]} canRecoverStaleShifts />
    );
    expect(screen.queryByRole('button', { name: 'Recover Stale Shift' })).toBeNull();

    rerender(<AdminBranchShiftMonitor shifts={[staleShift]} canRecoverStaleShifts={false} />);
    expect(screen.getByText('Stale')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Recover Stale Shift' })).toBeNull();
  });

  it('marks prior shift data stale after refresh fails without showing an empty state', () => {
    const shift = {
      pos_terminal_shift_id: 21,
      terminal_id: 'COUNTER-02',
      cashier: { username: 'Tinda' },
      opened_at: '2026-10-01T18:20:27.000Z'
    };

    render(<AdminBranchShiftMonitor shifts={[shift]} errorMessage="Monitor unavailable." />);

    expect(screen.getByRole('alert').textContent).toContain('Refresh failed — showing last results');
    expect(screen.getByText('COUNTER-02')).toBeTruthy();
    expect(screen.queryByText('No active shifts.')).toBeNull();
  });
});
