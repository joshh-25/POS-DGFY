/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeCreditManagementPanel from '../components/EmployeeCreditManagementPanel.jsx';
import {
  recordEmployeeCreditRepayment,
  updateEmployeeCreditEmployeeAccount
} from '../services/employeeCreditService.js';
import { fetchEmployees } from '../services/employeeService.js';

vi.mock('../services/employeeCreditService.js', () => ({
  adjustEmployeeCreditOutstanding: vi.fn(),
  enableEmployeeCreditForActiveEmployees: vi.fn(),
  recordEmployeeCreditRepayment: vi.fn(),
  updateEmployeeCreditEmployeeAccount: vi.fn()
}));

vi.mock('../services/employeeService.js', () => ({
  fetchEmployees: vi.fn()
}));

const employee = {
  employee_id: 44,
  employee_code: 'EMP-044',
  full_name: 'Branch Employee',
  employeeCreditAccount: {
    account_id: 7,
    account_code: 'EC-E44-TEST',
    is_eligible: true,
    outstanding_balance: 125,
    balance: 0,
    version: 2
  }
};

describe('EmployeeCreditManagementPanel Repay All flow', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    fetchEmployees.mockResolvedValue([employee]);
    recordEmployeeCreditRepayment.mockResolvedValue({});
    updateEmployeeCreditEmployeeAccount.mockResolvedValue({});
  });

  it('requires confirmation and a reason before submitting the full balance', async () => {
    const user = userEvent.setup();
    render(<EmployeeCreditManagementPanel />);

    await waitFor(() => expect(screen.getByText('Outstanding balance:')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Repay all' }));

    expect(screen.getByRole('heading', { name: 'Repay Employee Credit in full?' })).toBeTruthy();
    expect(screen.getByText(/full repayment of PHP 125\.00/)).toBeTruthy();
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Repay all' }));
    expect(recordEmployeeCreditRepayment).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Repayment reason must be at least 3 characters.');

    await user.type(screen.getByLabelText(/Repayment reason/), 'Final payroll repayment');
    await user.click(within(dialog).getByRole('button', { name: 'Repay all' }));

    await waitFor(() => expect(recordEmployeeCreditRepayment).toHaveBeenCalledWith(7, expect.objectContaining({
      repay_all: true,
      expected_version: 2,
      reason: 'Final payroll repayment',
      idempotency_key: expect.any(String)
    })));
    expect(recordEmployeeCreditRepayment.mock.calls[0][1]).not.toHaveProperty('amount');
    expect(updateEmployeeCreditEmployeeAccount).not.toHaveBeenCalled();
  });

  it('does not offer the full-repayment action for a zero balance', async () => {
    fetchEmployees.mockResolvedValue([{ ...employee, employeeCreditAccount: { ...employee.employeeCreditAccount, outstanding_balance: 0 } }]);
    render(<EmployeeCreditManagementPanel />);

    await waitFor(() => expect(screen.getByText('Outstanding balance:')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Repay all' }).disabled).toBe(true);
  });
});
