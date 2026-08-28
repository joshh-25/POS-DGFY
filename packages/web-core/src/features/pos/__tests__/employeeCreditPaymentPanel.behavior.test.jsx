/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeCreditPaymentPanel from '../components/EmployeeCreditPaymentPanel.jsx';
import { fetchEmployeeCreditCheckoutOptions } from '../services/employeeCreditService.js';

vi.mock('../services/employeeCreditService.js', () => ({
  fetchEmployeeCreditCheckoutOptions: vi.fn()
}));

const eligibleEmployee = {
  option_key: 'employee:44',
  employee_id: 44,
  employee_code: 'EMP-044',
  employee_name: 'Branch Employee',
  branch_id: 3,
  branch_name: 'Makati Branch',
  is_active: true,
  is_eligible: true,
  account_configured: true,
  account_code: 'EC-E44-TEST',
  masked_account_code: '******TEST',
  current_balance: 80,
  outstanding_balance: 80,
  funded_balance: 450,
  available_credit: null,
  credit_mode: 'open_tab',
  credit_limit: 500
};

describe('EmployeeCreditPaymentPanel', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchEmployeeCreditCheckoutOptions.mockResolvedValue([eligibleEmployee]);
  });

  it('loads branch-scoped employees and sends the selected employee for automatic validation', async () => {
    const user = userEvent.setup();
    const onSelectEmployee = vi.fn();
    render(
      <EmployeeCreditPaymentPanel
        selectedEmployee={null}
        onSelectEmployee={onSelectEmployee}
        lookupLoading={false}
        account={null}
        totalDue={125}
        locationId={3}
      />
    );

    await waitFor(() => {
      expect(fetchEmployeeCreditCheckoutOptions).toHaveBeenCalledWith({
        search: '',
        locationId: 3,
        limit: 50
      });
    });

    await user.click(screen.getByRole('combobox', { name: /select employee/i }));
    const employeeMeta = await screen.findByText(/EMP-044/);
    expect(employeeMeta.textContent).toContain('Makati Branch');
    expect(screen.getByText(/Outstanding: PHP/).textContent).toContain('80.00');
    expect(screen.getByText('Open tab')).toBeTruthy();

    await user.click(screen.getByText('Branch Employee'));
    expect(onSelectEmployee).toHaveBeenCalledWith(eligibleEmployee);
  });

  it('shows branch and before/after balances for a verified account', () => {
    render(
      <EmployeeCreditPaymentPanel
        selectedEmployee={eligibleEmployee}
        onSelectEmployee={() => {}}
        lookupLoading={false}
        account={{ employee_name: 'Branch Employee', outstanding_balance: 80, funded_balance: 450 }}
        totalDue={125}
        locationId={3}
      />
    );

    expect(screen.getByText('EMP-044')).toBeTruthy();
    expect(screen.getByText('Employee ID')).toBeTruthy();
    expect(screen.getByText('Charge amount')).toBeTruthy();
    expect(screen.getByText('PHP 125.00')).toBeTruthy();
    expect(screen.getByText('Branch')).toBeTruthy();
    expect(screen.getByText('Makati Branch')).toBeTruthy();
    expect(screen.getByText('Current outstanding')).toBeTruthy();
    expect(screen.getByText('PHP 80.00')).toBeTruthy();
    expect(screen.getByText('Outstanding after sale')).toBeTruthy();
    expect(screen.getByText('PHP 205.00')).toBeTruthy();
  });

  it('prefills the eligible Employee Credit account linked to the sale-level employee discount', async () => {
    const onSelectEmployee = vi.fn();
    const onPrefillEmployee = vi.fn();
    const onClearPrefill = vi.fn();
    const { rerender } = render(
      <EmployeeCreditPaymentPanel
        selectedEmployee={null}
        onSelectEmployee={onSelectEmployee}
        onPrefillEmployee={onPrefillEmployee}
        onClearPrefill={onClearPrefill}
        lookupLoading={false}
        account={null}
        totalDue={125}
        locationId={3}
        preferredEmployeeId={44}
      />
    );

    await waitFor(() => {
      expect(onPrefillEmployee).toHaveBeenCalledWith(eligibleEmployee);
    });
    expect(fetchEmployeeCreditCheckoutOptions).toHaveBeenCalledWith({
      employeeId: 44,
      locationId: 3,
      limit: 1
    });
    expect(onSelectEmployee).not.toHaveBeenCalled();
    expect(screen.getByTestId('employee-credit-prefill-notice').textContent).toContain('Review the account');

    rerender(
      <EmployeeCreditPaymentPanel
        selectedEmployee={eligibleEmployee}
        onSelectEmployee={onSelectEmployee}
        onPrefillEmployee={onPrefillEmployee}
        onClearPrefill={onClearPrefill}
        lookupLoading={false}
        account={null}
        totalDue={125}
        locationId={3}
        preferredEmployeeId={null}
      />
    );
    await waitFor(() => {
      expect(onClearPrefill).toHaveBeenCalled();
    });
  });

  it('does not prefill an unavailable Employee Credit account', async () => {
    const onPrefillEmployee = vi.fn();
    const onClearPrefill = vi.fn();
    fetchEmployeeCreditCheckoutOptions.mockResolvedValue([{
      ...eligibleEmployee,
      is_eligible: false
    }]);

    render(
      <EmployeeCreditPaymentPanel
        selectedEmployee={null}
        onSelectEmployee={() => {}}
        onPrefillEmployee={onPrefillEmployee}
        onClearPrefill={onClearPrefill}
        lookupLoading={false}
        account={null}
        totalDue={125}
        locationId={3}
        preferredEmployeeId={44}
      />
    );

    await waitFor(() => {
      expect(onClearPrefill).toHaveBeenCalled();
    });
    expect(onPrefillEmployee).not.toHaveBeenCalled();
    expect(screen.getByTestId('employee-credit-prefill-notice').textContent).toContain('no active, eligible');
  });

  it('keeps a cashier-selected Employee Credit account instead of replacing it', async () => {
    const onPrefillEmployee = vi.fn();
    render(
      <EmployeeCreditPaymentPanel
        selectedEmployee={{ ...eligibleEmployee, employee_id: 45, employee_name: 'Cashier Choice' }}
        onSelectEmployee={() => {}}
        onPrefillEmployee={onPrefillEmployee}
        onClearPrefill={() => {}}
        lookupLoading={false}
        account={{ employee_name: 'Cashier Choice' }}
        totalDue={125}
        locationId={3}
        preferredEmployeeId={44}
        prefillLocked
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('employee-credit-prefill-notice').textContent).toContain('cashier-selected');
    });
    expect(onPrefillEmployee).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: /Cashier Choice/ })).toBeTruthy();
  });

  it('searches from the employee field and keeps the result list scrollable', async () => {
    const user = userEvent.setup();
    const initialOptions = Array.from({ length: 6 }, (_, index) => ({
      ...eligibleEmployee,
      option_key: `employee:${index + 1}`,
      employee_id: index + 1,
      employee_code: `EMP-00${index + 1}`,
      employee_name: `Branch Employee ${index + 1}`
    }));
    fetchEmployeeCreditCheckoutOptions.mockImplementation(({ search }) => (
      Promise.resolve(search ? [eligibleEmployee] : initialOptions)
    ));

    render(
      <EmployeeCreditPaymentPanel
        selectedEmployee={null}
        onSelectEmployee={() => {}}
        lookupLoading={false}
        account={null}
        totalDue={125}
        locationId={3}
      />
    );

    const employeeInput = await screen.findByRole('combobox', { name: 'Select Employee' });
    await user.click(employeeInput);
    expect(screen.getByTestId('employee-credit-options-list')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Search employees' })).toBeNull();

    await user.type(employeeInput, 'Branch Employee 6');
    await waitFor(() => {
      expect(fetchEmployeeCreditCheckoutOptions).toHaveBeenLastCalledWith({
        search: 'Branch Employee 6',
        locationId: 3,
        limit: 50
      });
    });
  });
});
