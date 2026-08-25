/** @vitest-environment jsdom */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalPageLayout from '../components/TerminalPageLayout.jsx';

vi.mock('../utils/iminHardwareBridge.js', () => ({
  playOrderAlertWithIminBridge: vi.fn()
}));

vi.mock('../components/TerminalLockDrawer.jsx', () => ({
  default: () => null
}));

vi.mock('../components/TerminalWorkspaceSidebar.jsx', () => ({
  default: () => null
}));

vi.mock('../components/TerminalOperationsWorkspace.jsx', () => ({
  default: () => null
}));

vi.mock('../components/PosAttendancePanel.jsx', () => ({
  default: () => <div data-testid="pos-attendance-panel">Attendance panel</div>
}));

const baseProps = {
  locked: false,
  isOnline: true,
  activeTerminalId: 'main',
  terminalIdOptions: [],
  mobileNavOpen: false,
  setMobileNavOpen: vi.fn(),
  isDesktopWide: true,
  canViewPos: true,
  canViewAttendance: true,
  canOperateAttendance: true,
  canAdjustCashDrawer: true,
  canCloseDay: true,
  canTransactPos: true,
  terminalUser: { username: 'cashier', email: 'cashier@example.test' },
  posViewMode: 'checkout',
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
  workspacePaneRef: { current: null },
  isCheckoutWorkspaceMode: false,
  isOperationsWorkspaceMode: false,
  TERMINAL_SECTION_IDS: { checkoutWorkspace: 'checkout-workspace' },
  drawerOpen: false,
  formData: {},
  setFormData: vi.fn(),
  submitting: false,
  handleLogin: vi.fn(),
  activeShiftId: 88
};

const renderLayout = (overrides = {}) => render(
  <MemoryRouter>
    <TerminalPageLayout {...baseProps} {...overrides} />
  </MemoryRouter>
);

describe('TerminalPageLayout attendance visibility', () => {
  afterEach(() => {
    cleanup();
  });

  it('hides the attendance panel on Sell', () => {
    renderLayout({ posViewMode: 'checkout' });

    expect(screen.queryByTestId('pos-attendance-panel')).toBeNull();
  });

  it.each(['shift_controls', 'close_shift', 'cash_drawer'])('shows the attendance panel in %s', (posViewMode) => {
    renderLayout({ posViewMode });

    expect(screen.getByTestId('pos-attendance-panel')).toBeTruthy();
  });
});
