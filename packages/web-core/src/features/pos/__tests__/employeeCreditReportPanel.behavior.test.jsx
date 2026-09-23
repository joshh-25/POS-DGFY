/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeCreditReportPanel from '../components/EmployeeCreditReportPanel.jsx';
import { fetchEmployeeCreditReport } from '../services/employeeCreditService.js';

vi.mock('../services/employeeCreditService.js', () => ({
  fetchEmployeeCreditReport: vi.fn()
}));

const report = {
  entries: [{
    ledger_entry_id: 1,
    created_at: '2026-07-02T08:00:00.000Z',
    entry_type: 'charge',
    amount: 125,
    balance_after: 125,
    authorization_reference: 'AUTH-1',
    account: { employeeProfile: { full_name: 'Maria Employee' } },
    actor: { username: 'cashier-1' }
  }],
  totals: { credit_sales: 125, repayments: 0, grants: 0, reversals: 0 },
  excluded_from_cashflow: true
};

describe('EmployeeCreditReportPanel', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    fetchEmployeeCreditReport.mockResolvedValue(report);
  });

  it('renders the ledger with shared table columns and publishes loaded data for Reports actions', async () => {
    const onReportDataChange = vi.fn();

    render(
      <EmployeeCreditReportPanel
        dateFrom="2026-07-01"
        dateTo="2026-07-06"
        onReportDataChange={onReportDataChange}
      />
    );

    await waitFor(() => expect(screen.getByRole('region', { name: 'Employee Credit activity table' })).toBeTruthy());
    expect(fetchEmployeeCreditReport).toHaveBeenCalledWith({
      date_from: '2026-07-01',
      date_to: '2026-07-06',
      signal: expect.any(AbortSignal)
    });
    expect(screen.getByRole('button', { name: 'Sort by Outstanding After' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
    await waitFor(() => expect(screen.getAllByText('Maria Employee').length).toBeGreaterThan(0));
    expect(screen.getByText('Credit sales')).toBeTruthy();
    expect(screen.getByText('Credit sales').closest('article').className).toContain('rounded-xl');
    expect(screen.getByText('Repayments').closest('article').className).toContain('rounded-xl');
    expect(onReportDataChange).toHaveBeenCalledWith(report);
  });

  it('uses the shared Reports search query for activity rows', async () => {
    render(
      <EmployeeCreditReportPanel
        dateFrom="2026-07-01"
        dateTo="2026-07-06"
        searchQuery="repayment"
      />
    );

    await waitFor(() => expect(screen.getAllByText('No Employee Credit activity matches your search.').length).toBeGreaterThan(0));
    expect(screen.getByText('Showing 0–0 of 0 activity entries')).toBeTruthy();
  });
});
