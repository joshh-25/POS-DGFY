/** @vitest-environment jsdom */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalPageLayout from '../components/TerminalPageLayout.jsx';

const { checkoutTerminalPropsSpy, playOrderAlertWithIminBridge } = vi.hoisted(() => ({
  checkoutTerminalPropsSpy: vi.fn(),
  playOrderAlertWithIminBridge: vi.fn()
}));

vi.mock('../utils/iminHardwareBridge.js', () => ({
  playOrderAlertWithIminBridge
}));

vi.mock('../components/POSCheckoutTerminal.jsx', () => ({
  default: (props) => {
    checkoutTerminalPropsSpy(props);
    return <div>POSCheckoutTerminal</div>;
  }
}));

vi.mock('../components/TerminalLockDrawer.jsx', () => ({
  default: () => null
}));

vi.mock('../components/TerminalWorkspaceSidebar.jsx', () => ({
  default: () => <div>TerminalWorkspaceSidebar</div>
}));

vi.mock('../components/TerminalOperationsWorkspace.jsx', () => ({
  default: () => <div>TerminalOperationsWorkspace</div>
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
  isOperationsWorkspaceMode: false,
  TERMINAL_SECTION_IDS: { checkoutWorkspace: 'checkout-workspace' },
  drawerOpen: false,
  formData: {},
  setFormData: vi.fn(),
  submitting: false,
  handleLogin: vi.fn()
};

const renderLayout = () => render(
  <MemoryRouter>
    <TerminalPageLayout {...baseProps} />
  </MemoryRouter>
);

const renderLayoutWithProps = (overrides = {}) => render(
  <MemoryRouter>
    <TerminalPageLayout {...baseProps} {...overrides} />
  </MemoryRouter>
);

describe('TerminalPageLayout capability notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows POS-specific capability block events and dismisses them', async () => {
    renderLayout();

    window.dispatchEvent(new CustomEvent('tenant:capability-blocked', {
      detail: {
        title: 'Platform admin changed your permissions',
        message: 'POS access is disabled for this company. Catalog, checkout, scanning, and POS transactions are unavailable until platform admin enables POS again.',
        code: 'TENANT_CAPABILITY_DISABLED',
        capability: 'tenant_pos_enabled'
      }
    }));

    await screen.findByText(/POS access is disabled for this company/);
    expect(screen.getByText('Reason code: TENANT_CAPABILITY_DISABLED')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => {
      expect(screen.queryByText(/POS access is disabled for this company/)).toBeNull();
    });
  });

  it('ignores non-POS capability block events', async () => {
    renderLayout();

    window.dispatchEvent(new CustomEvent('tenant:capability-blocked', {
      detail: {
        title: 'Platform admin changed your permissions',
        message: 'IMS access is disabled for this company.',
        code: 'TENANT_CAPABILITY_DISABLED',
        capability: 'tenant_ims_enabled'
      }
    }));

    await waitFor(() => {
      expect(screen.queryByText(/IMS access is disabled/)).toBeNull();
    });
  });

  it('restores the desktop sidebar toggle button', () => {
    renderLayout();

    const [toggleButton] = screen.getAllByRole('button', { name: 'Show sidebar' });
    fireEvent.click(toggleButton);

    expect(baseProps.setSidebarCollapsed).toHaveBeenCalledTimes(1);
    const toggleUpdater = baseProps.setSidebarCollapsed.mock.calls[0][0];
    expect(toggleUpdater(true)).toBe(false);
    expect(toggleUpdater(false)).toBe(true);
    expect(baseProps.setMobileNavOpen).not.toHaveBeenCalled();
  });

  it('keeps the mobile sidebar menu trigger available and opens the navigation drawer', () => {
    renderLayoutWithProps({
      isDesktopWide: false,
      effectiveSidebarCollapsed: false
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar menu' }));

    expect(baseProps.setMobileNavOpen).toHaveBeenCalledWith(true);
    expect(baseProps.setSidebarCollapsed).not.toHaveBeenCalled();
  });

  it('passes the selected business workflow into checkout', async () => {
    renderLayoutWithProps({
      workflowMode: 'services',
      isCheckoutWorkspaceMode: true
    });

    await waitFor(() => {
      expect(checkoutTerminalPropsSpy).toHaveBeenCalled();
    });

    const latestProps = checkoutTerminalPropsSpy.mock.calls.at(-1)?.[0];
    expect(latestProps?.workflowMode).toBe('services');
  });

  it('remounts an opaque sticky header when the terminal unlocks', () => {
    const { container, rerender } = renderLayoutWithProps({
      locked: true,
      isDesktopWide: false
    });

    const lockedHeader = container.querySelector('.dgfy-pos-panel');
    expect(lockedHeader?.className).toContain('pointer-events-none');
    expect(lockedHeader?.className).toContain('dgfy-pos-panel-strong');
    expect(lockedHeader?.className).not.toContain('blur-[2px]');
    expect(lockedHeader?.className).not.toContain('backdrop-blur');

    rerender(
      <MemoryRouter>
        <TerminalPageLayout {...baseProps} locked={false} isDesktopWide={false} />
      </MemoryRouter>
    );

    const unlockedHeader = container.querySelector('.dgfy-pos-panel');
    const menuButton = container.querySelector('button[aria-label="Open sidebar menu"]');

    expect(unlockedHeader).not.toBe(lockedHeader);
    expect(unlockedHeader?.className).not.toContain('pointer-events-none');
    expect(menuButton?.disabled).toBe(false);
  });

  it('plays a native order alert only for newly seen incoming order ids after initial hydration', () => {
    const initialOrders = [
      { pos_transaction_id: 101, customer_name: 'Guest A' }
    ];
    const { rerender } = renderLayoutWithProps({
      queueLocationScopeId: 5,
      incomingOrdersState: {
        loading: false,
        accessState: 'allowed',
        orders: initialOrders
      }
    });

    expect(playOrderAlertWithIminBridge).not.toHaveBeenCalled();

    rerender(
      <MemoryRouter>
        <TerminalPageLayout
          {...baseProps}
          queueLocationScopeId={5}
          incomingOrdersState={{
            loading: false,
            accessState: 'allowed',
            orders: [
              ...initialOrders,
              { pos_transaction_id: 102, customer_name: 'Guest B' }
            ]
          }}
        />
      </MemoryRouter>
    );

    expect(playOrderAlertWithIminBridge).toHaveBeenCalledTimes(1);
    expect(playOrderAlertWithIminBridge).toHaveBeenCalledWith('new_order');
  });

  it('does not play a native order alert when the device setting is disabled', () => {
    const initialOrders = [
      { pos_transaction_id: 201, customer_name: 'Guest A' }
    ];
    const { rerender } = renderLayoutWithProps({
      queueLocationScopeId: 7,
      onlineOrderSoundEnabled: false,
      incomingOrdersState: {
        loading: false,
        accessState: 'allowed',
        orders: initialOrders
      }
    });

    rerender(
      <MemoryRouter>
        <TerminalPageLayout
          {...baseProps}
          queueLocationScopeId={7}
          onlineOrderSoundEnabled={false}
          incomingOrdersState={{
            loading: false,
            accessState: 'allowed',
            orders: [
              ...initialOrders,
              { pos_transaction_id: 202, customer_name: 'Guest B' }
            ]
          }}
        />
      </MemoryRouter>
    );

    expect(playOrderAlertWithIminBridge).not.toHaveBeenCalled();
  });
});
