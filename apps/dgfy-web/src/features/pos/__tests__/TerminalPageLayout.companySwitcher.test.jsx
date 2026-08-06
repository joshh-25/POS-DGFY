/** @vitest-environment jsdom */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalPageLayout from '../components/TerminalPageLayout.jsx';

vi.mock('../components/POSCheckoutTerminal.jsx', () => ({
  default: () => <div>POSCheckoutTerminal</div>
}));

vi.mock('../components/TerminalLockDrawer.jsx', () => ({ default: () => null }));
vi.mock('../components/TerminalWorkspaceSidebar.jsx', () => ({ default: () => null }));
vi.mock('../components/TerminalOperationsWorkspace.jsx', () => ({ default: () => null }));

const onSwitchCompany = vi.fn();

const props = {
  locked: false,
  isOnline: true,
  activeTerminalId: 'COUNTER-01',
  terminalIdOptions: [],
  headerSubtitle: 'POS workspace',
  mobileNavOpen: false,
  setMobileNavOpen: vi.fn(),
  isDesktopWide: true,
  canViewPos: true,
  canAdjustCashDrawer: true,
  canCloseDay: true,
  canTransactPos: true,
  terminalUser: {
    username: 'Admin',
    email: 'admin@example.test',
    company: { id: 'tenant-current' }
  },
  accessibleCompanies: [
    {
      tenant_id: 'tenant-current',
      company_name: 'Current Cafe',
      role: 'fnb_cashier',
      is_current: true,
      can_switch: false
    },
    {
      tenant_id: 'tenant-second',
      company_name: 'Second Cafe',
      role: 'admin',
      can_switch: true
    }
  ],
  onSwitchCompany,
  posViewMode: 'checkout',
  isMsmeMode: true,
  shiftState: {},
  incomingOrdersState: { orders: [] },
  onlineOrderSoundEnabled: true,
  locationsState: {},
  operatingLocationId: 1,
  queueLocationScopeId: 1,
  handleSelectViewMode: vi.fn(),
  handleLock: vi.fn(),
  setDrawerOpen: vi.fn(),
  effectiveSidebarCollapsed: true,
  setSidebarCollapsed: vi.fn(),
  setOnlineOrderSoundEnabled: vi.fn(),
  queuedTerminalOperationCount: 0,
  queuedTerminalBlockedCount: 0,
  queueSummary: {},
  modeChangeNotice: null,
  dismissModeChangeNotice: vi.fn(),
  workspacePaneRef: { current: null },
  isCheckoutWorkspaceMode: false,
  isOperationsWorkspaceMode: false,
  TERMINAL_SECTION_IDS: { checkoutWorkspace: 'checkout-workspace' },
  drawerOpen: false,
  formData: {},
  setFormData: vi.fn(),
  submitting: false,
  handleLogin: vi.fn()
};

const renderLayout = (overrides = {}) => render(
  <MemoryRouter>
    <TerminalPageLayout {...props} {...overrides} />
  </MemoryRouter>
);

afterEach(() => {
  cleanup();
  onSwitchCompany.mockClear();
});

describe('TerminalPageLayout company switcher', () => {
  it('lists accessible companies and switches only a non-current company', () => {
    renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Open account profile menu' }));

    expect(screen.getByText('Current Cafe')).toBeTruthy();
    expect(screen.getByText('Second Cafe')).toBeTruthy();
    expect(screen.getByText('Cashier')).toBeTruthy();
    expect(screen.getByTitle('Switch to Second Cafe as Admin')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Current Cafe/i }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Second Cafe/i }));
    expect(onSwitchCompany).toHaveBeenCalledWith('tenant-second');
  });

  it('keeps company choices disabled while an active shift blocks switching', () => {
    renderLayout({ companySwitchBlockedReason: 'Close the active shift before switching companies.' });

    fireEvent.click(screen.getByRole('button', { name: 'Open account profile menu' }));

    expect(screen.getByText('Close the active shift before switching companies.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Second Cafe/i }).disabled).toBe(true);
  });
});
