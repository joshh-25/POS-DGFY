// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CashDrawerClosedState from '../components/CashDrawerClosedState.jsx';

afterEach(() => cleanup());

const closedRecord = (overrides = {}) => ({
  shift: {
    pos_terminal_shift_id: 14,
    terminal_id: 'COUNTER-01',
    status: 'closed',
    closed_at: '2026-10-01T08:00:00.000Z',
    ...overrides.shift
  },
  cash_summary: { expected_cash_amount: 5000, ...overrides.cash_summary }
});

describe('CashDrawerClosedState', () => {
  it('loads closed history for the current terminal and displays only its matching closed shift', async () => {
    const onRefresh = vi.fn().mockResolvedValue(null);
    const onOpenShiftSession = vi.fn();
    render(
      <CashDrawerClosedState
        terminalId="COUNTER-01"
        locationId={7}
        state={{
          loading: false,
          cashier: { cashier_id: 3, cashier_name: 'Tinda Han' },
          errorMessage: '',
          records: [
            closedRecord(),
            closedRecord({
              shift: { pos_terminal_shift_id: 15, closed_at: '2026-10-02T08:00:00.000Z' },
              cash_summary: { expected_cash_amount: 7250 }
            }),
            closedRecord({ shift: { pos_terminal_shift_id: 99, terminal_id: 'COUNTER-02' } }),
            closedRecord({ shift: { pos_terminal_shift_id: 100, status: 'open' } })
          ]
        }}
        onRefresh={onRefresh}
        onOpenShiftSession={onOpenShiftSession}
      />
    );

    expect(screen.getByText('No active shift')).toBeTruthy();
    expect(screen.getByText('#15')).toBeTruthy();
    expect(screen.getByText('₱7,250.00')).toBeTruthy();
    expect(screen.getByText(/Oct\. 2, 2026,/i)).toBeTruthy();
    expect(screen.queryByText('#14')).toBeNull();
    expect(screen.queryByText('#99')).toBeNull();
    expect(screen.queryByText('#100')).toBeNull();
    expect(screen.queryByRole('button', { name: /open cash drawer/i })).toBeNull();
    await waitFor(() => expect(onRefresh).toHaveBeenCalledWith({
      status: 'closed',
      page: 1,
      limit: 50,
      location_id: 7
    }));

    fireEvent.click(screen.getByRole('button', { name: /go to shift session/i }));
    expect(onOpenShiftSession).toHaveBeenCalledOnce();
  });

  it('shows an empty-history state without borrowing another terminal’s shift', () => {
    render(
      <CashDrawerClosedState
        terminalId="COUNTER-01"
        state={{
          loading: false,
          cashier: { cashier_id: 3, cashier_name: 'Tinda Han' },
          errorMessage: '',
          records: [closedRecord({ shift: { terminal_id: 'COUNTER-02' } })]
        }}
        onRefresh={vi.fn().mockResolvedValue(null)}
      />
    );

    expect(screen.getByRole('heading', { name: 'Shift Status' })).toBeTruthy();
    expect(screen.getByText('No closed shift found for this terminal.')).toBeTruthy();
    expect(screen.queryByText('No matching shift')).toBeNull();
  });

  it('announces loading and history errors accessibly', () => {
    const { rerender } = render(
      <CashDrawerClosedState
        terminalId="COUNTER-01"
        state={{ loading: true, records: [], errorMessage: '' }}
        onRefresh={vi.fn().mockResolvedValue(null)}
      />
    );

    expect(screen.getByRole('status').textContent).toMatch(/loading the latest closed shift/i);

    rerender(
      <CashDrawerClosedState
        terminalId="COUNTER-01"
        state={{ loading: false, records: [], errorMessage: 'History unavailable.' }}
        onRefresh={vi.fn().mockResolvedValue(null)}
      />
    );
    expect(screen.getByRole('alert').textContent).toBe('History unavailable.');
    expect(screen.queryByText('No closed shift found for this terminal.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh closed shift history' })).toBeTruthy();
  });

  it('keeps the last closed shift visible and marks it stale after history refresh fails', () => {
    render(
      <CashDrawerClosedState
        terminalId="COUNTER-01"
        state={{
          loading: false,
          cashier: { cashier_id: 3, cashier_name: 'Tinda Han' },
          errorMessage: 'History unavailable.',
          records: [closedRecord({ shift: { pos_terminal_shift_id: 22 } })]
        }}
        onRefresh={vi.fn().mockResolvedValue(null)}
      />
    );

    expect(screen.getByRole('alert').textContent).toContain('Refresh failed — showing last results');
    expect(screen.getByText('#22')).toBeTruthy();
    expect(screen.queryByText('No closed shift found for this terminal.')).toBeNull();
  });

  it('does not claim the shift is closed or offer navigation while current shift status is loading', () => {
    render(
      <CashDrawerClosedState
        terminalId="COUNTER-01"
        shiftStatusLoading
        state={{ loading: false, cashier: null, records: [], errorMessage: '' }}
        onRefresh={vi.fn().mockResolvedValue(null)}
      />
    );

    expect(screen.getAllByText('Checking shift status')).toHaveLength(1);
    expect(screen.queryByText('No active shift')).toBeNull();
    expect(screen.getByRole('button', { name: /go to shift session/i }).disabled).toBe(true);
    expect(screen.getByTestId('cash-drawer-closed-state').getAttribute('aria-busy')).toBe('true');
  });

  it('does not make a history request while offline or without a terminal', () => {
    const onRefresh = vi.fn().mockResolvedValue(null);
    const { rerender } = render(
      <CashDrawerClosedState terminalId="COUNTER-01" isOnline={false} onRefresh={onRefresh} />
    );
    rerender(<CashDrawerClosedState terminalId="" isOnline onRefresh={onRefresh} />);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
