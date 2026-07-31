/** @vitest-environment jsdom */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeManagementPanel from '../components/EmployeeManagementPanel.jsx';
import { listTenantLocations } from '@/services/tenantLocationService.js';
import { fetchEmployees } from '../services/employeeService.js';

vi.mock('@/services/tenantLocationService.js', () => ({
  listTenantLocations: vi.fn()
}));

vi.mock('../services/employeeService.js', () => ({
  createEmployee: vi.fn(),
  fetchEmployees: vi.fn(),
  updateEmployee: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

describe('EmployeeManagementPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchEmployees.mockResolvedValue([]);
    listTenantLocations.mockResolvedValue([
      { location_id: 1, name: 'Masu Cafe' },
      { location_id: 3, name: 'Ungka Branch' }
    ]);
  });

  it('renders tenant location names in the employee branch dropdown', async () => {
    render(<EmployeeManagementPanel />);

    expect(await screen.findByRole('option', { name: 'Masu Cafe' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Ungka Branch' })).toBeTruthy();
    expect(listTenantLocations).toHaveBeenCalledWith({ include_inactive: false });
  });
});
