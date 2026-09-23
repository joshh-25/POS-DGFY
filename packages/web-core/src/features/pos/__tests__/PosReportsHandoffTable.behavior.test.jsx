/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PosReportsHandoffTable from '../components/PosReportsHandoffTable.jsx';

const rows = [
  {
    operator_session_id: 701,
    cashier_name: 'John D.',
    terminal_id: 'Register #1',
    started_at: '2026-08-28T09:00:00+08:00',
    ended_at: '2026-08-28T21:00:00+08:00',
    minutes: 720,
    status: 'ended'
  },
  {
    operator_session_id: 702,
    cashier_name: 'Maya S.',
    terminal_id: 'Register #2',
    started_at: '2026-08-28T13:00:00+08:00',
    ended_at: null,
    minutes: 120,
    status: 'active'
  }
];

describe('POS reports handoff table', () => {
  afterEach(() => cleanup());

  it('renders the proposed session columns from the operator session payload', () => {
    render(<PosReportsHandoffTable rows={rows} />);

    ['Session ID', 'Operator', 'Register', 'Start Time', 'End Time', 'Duration', 'Status'].forEach((label) => {
      expect(screen.getByRole('button', { name: `Sort by ${label}` })).toBeTruthy();
    });
    expect(screen.getAllByText('SES-000701').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Register #1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12h 00m').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 1–2 of 2 handoff sessions')).toBeTruthy();
  });

  it('filters sessions through the shared report search value', () => {
    render(<PosReportsHandoffTable rows={rows} searchQuery="Maya" />);

    expect(screen.getAllByText('SES-000702').length).toBeGreaterThan(0);
    expect(screen.queryByText('SES-000701')).toBeNull();
    expect(screen.getByText('Showing 1–1 of 1 handoff sessions')).toBeTruthy();
  });
});
