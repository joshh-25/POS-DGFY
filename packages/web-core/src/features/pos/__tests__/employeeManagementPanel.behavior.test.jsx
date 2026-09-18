/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    fetchEmployees.mockResolvedValue([]);
    listTenantLocations.mockResolvedValue([
      { location_id: 1, name: 'Masu Cafe' },
      { location_id: 3, name: 'Ungka Branch' }
    ]);
  });

  it('renders tenant location names in the employee branch dropdown', async () => {
    const refreshActionRef = { current: null };
    render(<EmployeeManagementPanel refreshActionRef={refreshActionRef} />);

    expect(screen.queryByRole('complementary', { name: 'Add Employee' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Employee' })).toBeTruthy();
    expect(refreshActionRef.current).toEqual(expect.any(Function));
    await refreshActionRef.current();
    expect(fetchEmployees).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add Employee' }).disabled).toBe(false));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Employee' }));

    const formPanel = screen.getByRole('complementary', { name: 'Add Employee' });
    const addEmployeeButtons = screen.getAllByRole('button', { name: 'Add Employee' });
    expect(addEmployeeButtons).toHaveLength(2);
    expect(addEmployeeButtons[0].disabled).toBe(true);
    expect(formPanel.className).toContain('relative');
    const hideFormButton = screen.getByRole('button', { name: 'Hide form' });
    expect(hideFormButton.className).toContain('min-[1200px]:left-[-1rem]');
    expect(hideFormButton.className).toContain('min-[1200px]:top-1/2');
    expect(formPanel.className).toContain('min-[1200px]:overflow-visible');
    expect(screen.getByRole('button', { name: 'Close employee form' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await within(formPanel).findByRole('option', { name: 'Masu Cafe' })).toBeTruthy();
    expect(within(formPanel).getByRole('option', { name: 'Ungka Branch' })).toBeTruthy();
    expect(formPanel).toBeTruthy();
    expect(listTenantLocations).toHaveBeenCalledWith({ include_inactive: false });

    fireEvent.change(within(formPanel).getByLabelText('Full name *'), { target: { value: 'Draft Employee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide form' }));
    expect(screen.queryByRole('complementary', { name: 'Add Employee' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Add Employee' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show form' }));
    expect(screen.getByLabelText('Full name *').value).toBe('Draft Employee');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(window.confirm).toHaveBeenCalledWith('Discard unsaved employee changes?');
    window.confirm.mockRestore();
  });

  it('uses a bottom portal sheet at tablet widths without losing the list context', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query) => {
      const matches = query === '(min-width: 768px) and (max-width: 1199px)';
      return {
        matches,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn()
      };
    });

    try {
      render(<EmployeeManagementPanel />);
      fireEvent.click(await screen.findByRole('button', { name: 'Add Employee' }));

      const drawer = screen.getByRole('dialog', { name: 'Add Employee' });
      expect(drawer.parentElement.className).toContain('fixed');
      expect(drawer.parentElement.className).toContain('inset-x-0');
      expect(drawer.parentElement.className).toContain('bottom-0');
      expect(drawer.parentElement.className).toContain('rounded-t-2xl');
      expect(drawer.parentElement.className).toContain('max-h-[calc(100vh-1rem)]');
      expect(drawer.parentElement.className).toContain('translate-y-full');
      expect(drawer.parentElement.parentElement).toBe(document.body);
      expect(document.body.style.overflow).toBe('hidden');
      expect(drawer.className).toContain('h-auto');
      expect(drawer.className).toContain('max-h-full');
      expect(drawer.querySelector('form > div').className).toContain('max-h-[calc(100vh-10rem)]');
      expect(screen.getAllByText('No employees added yet.').length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole('button', { name: 'Close employee form' }));
      expect(screen.queryByRole('dialog', { name: 'Add Employee' })).toBeNull();
      expect(document.body.style.overflow).toBe('');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('keeps the mobile Add Employee drawer compact while preserving an internal scroll limit', async () => {
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
      render(<EmployeeManagementPanel />);
      fireEvent.click(await screen.findByRole('button', { name: 'Add Employee' }));

      const drawer = screen.getByRole('dialog', { name: 'Add Employee' });
      const formBody = drawer.querySelector('form > div');
      expect(drawer.parentElement.className).toContain('inset-x-0');
      expect(drawer.parentElement.className).toContain('bottom-0');
      expect(drawer.parentElement.className).toContain('rounded-t-2xl');
      expect(drawer.parentElement.className).toContain('max-h-[calc(100vh-1rem)]');
      expect(drawer.parentElement.className).toContain('translate-y-full');
      expect(drawer.className).toContain('relative');
      expect(formBody.className).toContain('max-h-[calc(100vh-10rem)]');
      expect(formBody.className).not.toContain('flex-1');
      expect(within(drawer).getByRole('button', { name: 'Cancel' })).toBeTruthy();
      expect(within(drawer).getByRole('button', { name: 'Add Employee' })).toBeTruthy();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('uses the same bottom sheet for mobile Edit Employee forms', async () => {
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
    fetchEmployees.mockResolvedValue([{
      employee_id: 7,
      employee_code: 'HM-2234',
      full_name: 'Jasmine Yu',
      email: 'jasmineyu@gmail.com',
      phone: '09232234031',
      location: { location_name: 'All locations' },
      is_active: true
    }]);

    try {
      render(<EmployeeManagementPanel />);
      fireEvent.click((await screen.findAllByRole('button', { name: 'Edit Jasmine Yu' }))[0]);

      const drawer = screen.getByRole('dialog', { name: 'Edit Employee' });
      expect(drawer.parentElement.className).toContain('bottom-0');
      expect(drawer.parentElement.className).toContain('rounded-t-2xl');
      expect(drawer.parentElement.className).toContain('shadow-[0_-12px_30px_rgba(0,0,0,0.16)]');
      expect(within(drawer).getByLabelText('Full name *').value).toBe('Jasmine Yu');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('keeps the focused mobile field visible when the keyboard changes the visual viewport', async () => {
    const originalMatchMedia = window.matchMedia;
    const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const viewportListeners = {};
    const scrollIntoView = vi.fn();

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
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        height: 720,
        offsetTop: 0,
        addEventListener: vi.fn((eventName, callback) => { viewportListeners[eventName] = callback; }),
        removeEventListener: vi.fn()
      }
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView
    });

    try {
      render(<EmployeeManagementPanel />);
      fireEvent.click(await screen.findByRole('button', { name: 'Add Employee' }));

      const drawer = screen.getByRole('dialog', { name: 'Add Employee' });
      const employeeCode = within(drawer).getByLabelText('Employee code *');
      const fullName = within(drawer).getByLabelText('Full name *');
      expect(document.activeElement).not.toBe(employeeCode);
      expect(fullName.className).toContain('text-[16px]');

      fireEvent.focus(fullName);
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest', behavior: 'auto' }));
      viewportListeners.resize();
      expect(drawer.parentElement.style.maxHeight).toBe('712px');
    } finally {
      window.matchMedia = originalMatchMedia;
      if (originalVisualViewport) Object.defineProperty(window, 'visualViewport', originalVisualViewport);
      else delete window.visualViewport;
      if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
      else delete HTMLElement.prototype.scrollIntoView;
    }
  });

  it('places refresh beside the Employees heading and keeps it wired to the employee loader', async () => {
    const refreshActionRef = { current: null };
    render(<EmployeeManagementPanel refreshActionRef={refreshActionRef} />);

    const heading = await screen.findByRole('heading', { name: 'Employees', exact: true });
    const refreshButton = screen.getByRole('button', { name: 'Refresh', exact: true });

    expect(refreshButton.className).toContain('h-9');
    expect(refreshButton.className).toContain('sm:w-auto');
    fireEvent.click(refreshButton);
    await waitFor(() => expect(fetchEmployees).toHaveBeenCalledTimes(2));
    expect(heading).toBeTruthy();
  });

  it('filters the compact employee table from the search field', async () => {
    fetchEmployees.mockResolvedValue([
      {
        employee_id: 1,
        employee_code: 'EMP-001',
        full_name: 'Juan Dela Cruz',
        email: 'juan@example.com',
        phone: '09171234567',
        location: { location_name: 'Masu Cafe' },
        is_active: true,
        created_at: '2026-01-12T00:00:00.000Z'
      },
      {
        employee_id: 2,
        employee_code: 'EMP-002',
        full_name: 'Maria Santos',
        email: 'maria@example.com',
        phone: '09187654321',
        location: { location_name: 'Ungka Branch' },
        is_active: false,
        created_at: '2026-01-15T00:00:00.000Z'
      }
    ]);

    render(<EmployeeManagementPanel />);

    expect((await screen.findAllByText('Juan Dela Cruz')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Maria Santos').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search employees' }), { target: { value: 'maria' } });

    expect(screen.queryByText('Juan Dela Cruz')).toBeNull();
    expect(screen.getAllByText('Maria Santos').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Edit Maria Santos' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Enable Maria Santos' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Disable')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const filterPopover = await screen.findByRole('region', { name: 'Filter employees' });
    expect(screen.queryByRole('dialog', { name: 'Filter employees' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Filter employees by location' })).toBeNull();
    const allButton = within(filterPopover).getByRole('button', { name: 'All' });
    const enabledButton = within(filterPopover).getByRole('button', { name: 'Enabled' });
    expect(within(filterPopover).getByRole('button', { name: 'Disabled' })).toBeTruthy();
    expect(allButton.getAttribute('aria-pressed')).toBe('true');
    expect(within(filterPopover).getByRole('button', { name: 'Clear filter' }).disabled).toBe(true);
    fireEvent.click(enabledButton);
    expect(enabledButton.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByText('Maria Santos').length).toBeGreaterThan(0);
    expect(within(filterPopover).getByRole('button', { name: 'Clear filter' }).disabled).toBe(false);
    fireEvent.click(within(filterPopover).getByRole('button', { name: 'Clear filter' }));
    expect(allButton.getAttribute('aria-pressed')).toBe('true');
    expect(within(filterPopover).getByRole('button', { name: 'Clear filter' }).disabled).toBe(true);
    fireEvent.click(enabledButton);
    fireEvent.click(within(filterPopover).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('region', { name: 'Filter employees' })).toBeNull();
    expect(screen.queryByText('Maria Santos')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const reopenedFilterPopover = screen.getByRole('region', { name: 'Filter employees' });
    const disabledButton = within(reopenedFilterPopover).getByRole('button', { name: 'Disabled' });
    fireEvent.click(disabledButton);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('region', { name: 'Filter employees' })).toBeNull();
    expect(screen.queryByText('Maria Santos')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Filter employees' })).toBeNull();
  });
});
