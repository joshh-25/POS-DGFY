/** @vitest-environment jsdom */

// Phase 205 (#1080), review round 2, RF-3. `SettingsWorkspace` (the internal component backing
// every `settings_*`/`terminal_setup`/`location_scope` view mode) rendered the Employees pane by
// reading `onDeliveryPersonnelChanged` -- a variable never present in its own destructured params,
// only in the unrelated outer `TerminalOperationsWorkspace` component further down the same file.
// That's a plain ReferenceError at render time for any admin who actually opens the Employees tab
// with delivery-personnel-management permission; a build never exercises this because it's a
// runtime reference, not a static/import-time one. This suite renders the real component tree
// (TerminalOperationsWorkspace -> SettingsWorkspace -> DeliveryPersonnelManagementPanel) through
// that exact path and proves the callback actually reaches the panel instead of crashing.

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';
import {
  createDeliveryPersonnel,
  fetchDeliveryPersonnelRegistry,
  updateDeliveryPersonnel
} from '../services/deliveryPersonnelService.js';

vi.mock('@/services/settingsService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAllSettings: vi.fn().mockResolvedValue({}),
    getCompanyInfo: vi.fn().mockResolvedValue(null)
  };
});

vi.mock('@/services/tenantLocationService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    listTenantLocations: vi.fn().mockResolvedValue([])
  };
});

vi.mock('../services/employeeService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchEmployees: vi.fn().mockResolvedValue([])
  };
});

vi.mock('../services/deliveryPersonnelService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchDeliveryPersonnelRegistry: vi.fn(),
    createDeliveryPersonnel: vi.fn(),
    updateDeliveryPersonnel: vi.fn()
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

const REGISTRY_ROWS = [
  { delivery_personnel_id: 1, display_name: 'Juan Dela Cruz', is_active: true, location_id: null, phone: '0917 123 4567', notes: '' },
  { delivery_personnel_id: 2, display_name: 'Inactive Rider', is_active: false, location_id: null, phone: null, notes: 'Weekend coverage' }
];

const buildProps = (overrides = {}) => ({
  viewMode: 'settings_pos',
  terminalUser: {
    user_id: 55,
    username: 'Ops Admin',
    is_master_admin: true,
    permissions: ['pos:employees:manage']
  },
  locked: false,
  terminalMeta: {},
  shiftState: {},
  todayDashboard: {},
  canViewPos: true,
  canTransactPos: true,
  sectionIds: {},
  ...overrides
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  fetchDeliveryPersonnelRegistry.mockResolvedValue(REGISTRY_ROWS);
});

describe('Delivery personnel registry panel inside the Settings > Employees pane', () => {
  it('renders the panel and reaches onDeliveryPersonnelChanged without crashing', async () => {
    const onDeliveryPersonnelChanged = vi.fn();
    render(<TerminalOperationsWorkspace {...buildProps({ onDeliveryPersonnelChanged })} />);

    fireEvent.click((await screen.findAllByRole('tab', { name: 'Employees' }))[0]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Delivery Personnel' }));

    expect(await screen.findByRole('heading', { name: 'Delivery Personnel' })).toBeTruthy();
    expect(await screen.findByText('Juan Dela Cruz')).toBeTruthy();
    expect(onDeliveryPersonnelChanged).toHaveBeenCalledWith(REGISTRY_ROWS);
  });

  it('does not crash the pane when no invalidation callback is supplied at all', async () => {
    render(<TerminalOperationsWorkspace {...buildProps()} />);

    fireEvent.click((await screen.findAllByRole('tab', { name: 'Employees' }))[0]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Delivery Personnel' }));

    expect(await screen.findByRole('heading', { name: 'Delivery Personnel' })).toBeTruthy();
  });

  it('uses the Employees add workflow while preserving a hidden draft', async () => {
    render(<TerminalOperationsWorkspace {...buildProps()} />);

    fireEvent.click((await screen.findAllByRole('tab', { name: 'Employees' }))[0]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Delivery Personnel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add Delivery Personnel' }));

    const nameInput = await screen.findByLabelText('Rider name *');
    fireEvent.change(nameInput, { target: { value: 'Maria Santos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hide form' }));
    expect(screen.queryByLabelText('Rider name *')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show form' }));
    expect(screen.getByLabelText('Rider name *').value).toBe('Maria Santos');
  });

  it('uses the Employees mobile bottom sheet and card layout for delivery personnel', async () => {
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
      render(<TerminalOperationsWorkspace {...buildProps()} />);
      fireEvent.click((await screen.findAllByRole('tab', { name: 'Employees' }))[0]);
      fireEvent.click(await screen.findByRole('tab', { name: 'Delivery Personnel' }));

      expect(await screen.findByText('Juan Dela Cruz')).toBeTruthy();
      expect(screen.getAllByRole('article')).toHaveLength(2);
      fireEvent.click(await screen.findByRole('button', { name: 'Add Delivery Personnel' }));

      const drawer = screen.getByRole('dialog', { name: 'Add Delivery Personnel' });
      expect(drawer.parentElement.className).toContain('fixed');
      expect(drawer.parentElement.className).toContain('bottom-0');
      expect(drawer.parentElement.className).toContain('rounded-t-2xl');
      expect(drawer.parentElement.className).toContain('translate-y-full');
      expect(drawer.parentElement.parentElement).toBe(document.body);
      expect(document.body.style.overflow).toBe('hidden');
      expect(within(drawer).getByLabelText('Rider name *').className).toContain('text-[16px]');
      expect(within(drawer).getByRole('button', { name: 'Cancel' })).toBeTruthy();

      fireEvent.click(within(drawer).getByRole('button', { name: 'Close delivery personnel form' }));
      expect(screen.queryByRole('dialog', { name: 'Add Delivery Personnel' })).toBeNull();
      expect(document.body.style.overflow).toBe('');
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('applies the compact pending status filter only after Done', async () => {
    render(<TerminalOperationsWorkspace {...buildProps()} />);

    fireEvent.click((await screen.findAllByRole('tab', { name: 'Employees' }))[0]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Delivery Personnel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Filters' }));

    const filterRegion = await screen.findByRole('region', { name: 'Filter delivery personnel' });
    expect(within(filterRegion).getByRole('button', { name: 'Enabled' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(filterRegion).getByRole('button', { name: 'Enabled' }));
    expect(screen.getByText('Inactive Rider')).toBeTruthy();
    fireEvent.click(within(filterRegion).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByText('Inactive Rider')).toBeNull());
    expect(screen.getByText('Juan Dela Cruz')).toBeTruthy();
  });

  it('keeps icon-only edit and activation actions wired to the delivery service', async () => {
    updateDeliveryPersonnel.mockResolvedValue({});
    render(<TerminalOperationsWorkspace {...buildProps()} />);

    fireEvent.click((await screen.findAllByRole('tab', { name: 'Employees' }))[0]);
    fireEvent.click(await screen.findByRole('tab', { name: 'Delivery Personnel' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Juan Dela Cruz' }));
    expect(await screen.findByDisplayValue('Juan Dela Cruz')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disable Juan Dela Cruz' }));

    await waitFor(() => expect(updateDeliveryPersonnel).toHaveBeenCalledWith(1, { is_active: false }));
    expect(createDeliveryPersonnel).not.toHaveBeenCalled();
  });
});
