/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
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

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
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

const getEmployeeCreditTable = () => screen.getByRole('table', { name: 'Employee Credit directory' });

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

    await waitFor(() => expect(getEmployeeCreditTable()).toBeTruthy());
    await user.click(within(getEmployeeCreditTable()).getByRole('button', { name: 'View credit for Branch Employee' }));
    await waitFor(() => expect(screen.getByText('Outstanding balance:')).toBeTruthy());
    const repaymentAction = screen.getByRole('button', { name: 'Record repayment', exact: true });
    const adjustmentAction = screen.getByRole('button', { name: 'Administrative adjustment', exact: true });
    await user.click(repaymentAction);
    expect(repaymentAction.getAttribute('aria-pressed')).toBe('true');
    expect(adjustmentAction.getAttribute('aria-pressed')).toBe('false');
    await user.click(screen.getByRole('button', { name: 'Repay all' }));

    expect(screen.getByRole('heading', { name: 'Repay Employee Credit in full?' })).toBeTruthy();
    expect(screen.getByText(/full repayment of PHP 125\.00/)).toBeTruthy();
    const dialog = screen.getByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Repay all' }));
    expect(recordEmployeeCreditRepayment).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Repayment reason must be at least 3 characters.');

    await user.type(within(dialog).getByLabelText(/Repayment reason/), 'Final payroll repayment');
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

    await waitFor(() => expect(getEmployeeCreditTable()).toBeTruthy());
    await userEvent.setup().click(within(getEmployeeCreditTable()).getByRole('button', { name: 'View credit for Branch Employee' }));
    await waitFor(() => expect(screen.getByText('Outstanding balance:')).toBeTruthy());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Record repayment', exact: true }));
    expect(screen.getByRole('button', { name: 'Repay all' }).disabled).toBe(true);
  });

  it('uses red for an outstanding balance and green for a zero balance', async () => {
    fetchEmployees.mockResolvedValue([
      employee,
      {
        ...employee,
        employee_id: 45,
        employee_code: 'EMP-045',
        full_name: 'Settled Employee',
        employeeCreditAccount: {
          ...employee.employeeCreditAccount,
          account_id: 8,
          account_code: 'EC-E45-TEST',
          outstanding_balance: 0
        }
      }
    ]);
    render(<EmployeeCreditManagementPanel />);

    await waitFor(() => expect(getEmployeeCreditTable()).toBeTruthy());

    const positiveBalance = within(screen.getByRole('row', { name: /Branch Employee/ })).getByText('PHP 125.00');
    const zeroBalance = within(screen.getByRole('row', { name: /Settled Employee/ })).getByText('PHP 0.00');
    expect(positiveBalance.className).toContain('text-red-600');
    expect(zeroBalance.className).toContain('text-emerald-600');
  });

  it('filters Employee Credit rows with button options and applies on Done', async () => {
    fetchEmployees.mockResolvedValue([
      { ...employee, is_active: true },
      {
        ...employee,
        employee_id: 45,
        employee_code: 'EMP-045',
        full_name: 'Inactive Employee',
        is_active: false,
        employeeCreditAccount: {
          ...employee.employeeCreditAccount,
          account_id: 8,
          account_code: 'EC-E45-TEST'
        }
      }
    ]);
    const user = userEvent.setup();
    render(<EmployeeCreditManagementPanel />);

    await waitFor(() => expect(getEmployeeCreditTable()).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'Filters' }));

    const popover = screen.getByRole('region', { name: 'Filter employee credit' });
    const disabledOption = within(popover).getByRole('button', { name: 'Disabled', exact: true });
    expect(disabledOption.getAttribute('aria-pressed')).toBe('false');
    await user.click(disabledOption);
    expect(screen.getByRole('row', { name: /Branch Employee/ })).toBeTruthy();
    await user.click(within(popover).getByRole('button', { name: 'Done', exact: true }));

    expect(screen.queryByRole('row', { name: /Branch Employee/ })).toBeNull();
    expect(screen.getByRole('row', { name: /Inactive Employee/ })).toBeTruthy();
  });

  it('explains that Employee Credit must be set up before recording a repayment', async () => {
    fetchEmployees.mockResolvedValue([{ ...employee, employeeCreditAccount: null }]);
    const user = userEvent.setup();
    render(<EmployeeCreditManagementPanel />);

    await waitFor(() => expect(getEmployeeCreditTable()).toBeTruthy());
    await user.click(within(getEmployeeCreditTable()).getByRole('button', { name: 'View credit for Branch Employee' }));
    const repaymentAction = screen.getByRole('button', { name: 'Record repayment', exact: true });
    expect(repaymentAction.disabled).toBe(false);

    await user.click(repaymentAction);

    expect(toast.error).toHaveBeenCalledWith('No employee credit available yet.');
    expect(screen.queryByLabelText('Amount paid')).toBeNull();
  });

  it('keeps the table as the default view and preserves a hidden configuration draft', async () => {
    const user = userEvent.setup();
    render(<EmployeeCreditManagementPanel />);

    await waitFor(() => expect(getEmployeeCreditTable()).toBeTruthy());
    expect(screen.queryByRole('complementary', { name: 'Manage Employee Credit' })).toBeNull();

    await user.click(within(getEmployeeCreditTable()).getByRole('button', { name: 'View credit for Branch Employee' }));
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit settings' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    const limitInput = await screen.findByLabelText('Credit limit (optional)');
    await user.clear(limitInput);
    await user.type(limitInput, '500');
    await user.click(screen.getByRole('button', { name: 'Hide form' }));
    expect(screen.queryByLabelText('Credit limit (optional)')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show form' }));
    expect(screen.getByLabelText('Credit limit (optional)').value).toBe('500');
  });

  it('uses the Employees mobile bottom sheet and card layout for Employee Credit', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query) => {
      const matches = query === '(max-width: 767px)';
      return {
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn()
      };
    });

    try {
      render(<EmployeeCreditManagementPanel />);
      const employeeCard = await screen.findByRole('article');
      const viewButton = within(employeeCard).getByRole('button', { name: 'View credit for Branch Employee' });
      expect(viewButton).toBeTruthy();
      expect(screen.getAllByRole('article')).toHaveLength(1);
      await userEvent.setup().click(viewButton);

      const drawer = screen.getByRole('dialog', { name: 'Branch Employee' });
      expect(drawer.parentElement.className).toContain('fixed');
      expect(drawer.parentElement.className).toContain('bottom-0');
      expect(drawer.parentElement.className).toContain('rounded-t-2xl');
      await waitFor(() => expect(drawer.parentElement.className).toContain('translate-y-0'));
      expect(drawer.parentElement.parentElement).toBe(document.body);
      expect(document.body.style.overflow).toBe('hidden');

      await userEvent.setup().click(within(drawer).getByRole('tab', { name: 'Settings' }));
      expect(within(drawer).getByLabelText('Credit limit (optional)').className).toContain('text-[16px]');
      await userEvent.setup().click(within(drawer).getByRole('button', { name: 'Close employee credit form' }));
      expect(screen.queryByRole('dialog', { name: 'Branch Employee' })).toBeNull();
      expect(document.body.style.overflow).toBe('');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('exposes the bulk credit action beside the table filters', async () => {
    const user = userEvent.setup();
    render(<EmployeeCreditManagementPanel />);

    await waitFor(() => expect(screen.getByRole('table', { name: 'Employee Credit directory' })).toBeTruthy());
    const bulkButton = screen.getByRole('button', { name: 'Enable Credit to All Employees' });
    expect(bulkButton.disabled).toBe(false);

    await user.click(bulkButton);
    expect(screen.getByRole('heading', { name: 'Enable Employee Credit for active employees?' })).toBeTruthy();
  });
});
