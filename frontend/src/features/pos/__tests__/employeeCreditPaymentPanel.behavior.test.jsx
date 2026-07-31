/** @vitest-environment jsdom */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('shows verified outstanding evidence and the projected outstanding after checkout', () => {
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
    expect(screen.getByText('Eligible. This sale will be added to the employee outstanding balance.')).toBeTruthy();
    expect(screen.getByText('PHP 80.00')).toBeTruthy();
    expect(screen.getByText('PHP 205.00')).toBeTruthy();
  });
});
