/** @vitest-environment jsdom */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TerminalPageLayout from '../components/TerminalPageLayout.jsx';

const { operationsWorkspacePropsSpy } = vi.hoisted(() => ({
  operationsWorkspacePropsSpy: vi.fn()
}));

vi.mock('../components/POSCheckoutTerminal.jsx', () => ({
  default: () => <div>POSCheckoutTerminal</div>
}));

vi.mock('../components/TerminalLockDrawer.jsx', () => ({
  default: () => null
}));

vi.mock('../components/TerminalWorkspaceSidebar.jsx', () => ({
  default: () => <div>TerminalWorkspaceSidebar</div>
}));

vi.mock('../components/TerminalOperationsWorkspace.jsx', () => ({
  default: (props) => {
    operationsWorkspacePropsSpy(props);
    return <div>TerminalOperationsWorkspace</div>;
  }
}));

const baseProps = {
  locked: false,
  isOnline: true,
  activeTerminalId: 'main',
  terminalIdOptions: [],
  headerSubtitle: 'POS workspace',
  mobileNavOpen: false,
  setMobileNavOpen: vi.fn(),
  isDesktopWide: true,
  canViewPos: true,
  canAdjustCashDrawer: true,
  canCloseDay: true,
  canTransactPos: true,
  terminalUser: { username: 'cashier', email: 'cashier@example.test' },
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
  isOperationsWorkspaceMode: true,
  TERMINAL_SECTION_IDS: { checkoutWorkspace: 'checkout-workspace' },
  drawerOpen: false,
  formData: {},
  setFormData: vi.fn(),
  submitting: false,
  handleLogin: vi.fn()
};

describe('TerminalPageLayout delivery job status wiring', () => {
  it('forwards handleDeliveryJobStatusChange into TerminalOperationsWorkspace instead of dropping it', async () => {
    const handleDeliveryJobStatusChange = vi.fn();

    render(
      <MemoryRouter>
        <TerminalPageLayout
          {...baseProps}
          handleDeliveryJobStatusChange={handleDeliveryJobStatusChange}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(operationsWorkspacePropsSpy).toHaveBeenCalled();
    });

    const latestProps = operationsWorkspacePropsSpy.mock.calls.at(-1)?.[0];
    // Regression pin for #312: TerminalPageLayout previously passed ~12 sibling
    // handlers (handleIncomingOrderStatusChange, handleOpenIncomingOrderReceipt, ...)
    // into TerminalOperationsWorkspace but silently dropped this one. Because the
    // workspace defaults it to a no-op (`handleDeliveryJobStatusChange = () => {}`),
    // the drop produced no warning or crash -- just a dead "Assign Delivery" button
    // that deadlocked every storefront delivery order at pending_dispatch.
    expect(latestProps?.handleDeliveryJobStatusChange).toBe(handleDeliveryJobStatusChange);
  });
});
