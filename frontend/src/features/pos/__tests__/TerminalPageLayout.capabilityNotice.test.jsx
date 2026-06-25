/** @vitest-environment jsdom */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  default: () => <div>TerminalOperationsWorkspace</div>
}));

const { default: TerminalPageLayout } = await import('../components/TerminalPageLayout.jsx');

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
  locationsState: {},
  operatingLocationId: 1,
  queueLocationScopeId: 1,
  handleSelectViewMode: vi.fn(),
  handleLock: vi.fn(),
  setDrawerOpen: vi.fn(),
  effectiveSidebarCollapsed: true,
  setSidebarCollapsed: vi.fn(),
  queuedTerminalOperationCount: 0,
  queuedTerminalBlockedCount: 0,
  queueSummary: {},
  complianceBlockerDetails: null,
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
});
