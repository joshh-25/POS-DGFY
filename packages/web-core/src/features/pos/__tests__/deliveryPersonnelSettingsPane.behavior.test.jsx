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
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';
import { fetchDeliveryPersonnelRegistry } from '../services/deliveryPersonnelService.js';

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
  { delivery_personnel_id: 1, display_name: 'Juan Dela Cruz', is_active: true, location_id: null }
];

const buildProps = (overrides = {}) => ({
  viewMode: 'settings_pos',
  terminalUser: {
    user_id: 55,
    username: 'Ops Admin',
    is_master_admin: false,
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

    fireEvent.click((await screen.findAllByRole('button', { name: 'Employees' }))[0]);

    expect(await screen.findByText('Delivery Personnel Registry')).toBeTruthy();
    expect(await screen.findByText('Juan Dela Cruz')).toBeTruthy();
    expect(onDeliveryPersonnelChanged).toHaveBeenCalledWith(REGISTRY_ROWS);
  });

  it('does not crash the pane when no invalidation callback is supplied at all', async () => {
    render(<TerminalOperationsWorkspace {...buildProps()} />);

    fireEvent.click((await screen.findAllByRole('button', { name: 'Employees' }))[0]);

    expect(await screen.findByText('Delivery Personnel Registry')).toBeTruthy();
  });
});
