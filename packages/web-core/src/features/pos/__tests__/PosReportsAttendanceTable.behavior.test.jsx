/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsAttendanceTable from '../components/PosReportsAttendanceTable.jsx';

const rows = [
  {
    attendance_session_id: 301,
    cashier_name: 'John D.',
    duty_type: 'regular',
    status: 'closed',
    started_at: '2026-08-28T08:00:00+08:00',
    ended_at: '2026-08-28T20:00:00+08:00',
    break_minutes: 60,
    worked_minutes: 660,
    breaks: [{ status: 'closed' }]
  },
  {
    attendance_session_id: 302,
    cashier_name: 'Maya S.',
    duty_type: 'relief',
    status: 'open',
    started_at: '2026-08-28T09:00:00+08:00',
    ended_at: null,
    break_minutes: 60,
    worked_minutes: 540,
    breaks: [{ status: 'open' }]
  },
  {
    attendance_session_id: 303,
    cashier_name: 'Alex R.',
    duty_type: 'regular',
    status: 'open',
    started_at: '2026-08-28T10:00:00+08:00',
    ended_at: null,
    break_minutes: 0,
    worked_minutes: 120,
    breaks: []
  }
];

describe('POS reports attendance table', () => {
  afterEach(() => cleanup());

  it('renders the prioritized attendance columns plus the shared details action', () => {
    render(<PosReportsAttendanceTable rows={rows} />);

    ['Date', 'Cashier', 'Status', 'Time In', 'Time Out', 'Worked (Hours)'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Sort by ${label}` })).toBeTruthy();
    });
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sort by Duty/Role' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sort by Break (Hours)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sort by Late (Minutes)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sort by Early Out (Minutes)' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sort by Notes' })).toBeNull();
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('On Break').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('11.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–3 of 3 attendance sessions')).toBeTruthy();
  });

  it('filters attendance sessions through the shared report search value', () => {
    render(<PosReportsAttendanceTable rows={rows} searchQuery="Maya" />);

    expect(screen.getAllByText('Maya S.').length).toBeGreaterThan(0);
    expect(screen.queryByText('John D.')).toBeNull();
    expect(screen.getByText('Showing 1–1 of 1 attendance sessions')).toBeTruthy();
  });
});
