/** @vitest-environment jsdom */
import React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalPageLayout from '../../../../packages/web-core/src/features/pos/components/TerminalPageLayout.jsx';

vi.mock('../../../../packages/web-core/src/features/pos/components/POSCheckoutTerminal.jsx', () => ({
  default: () => <div>POSCheckoutTerminal</div>
}));
vi.mock('../../../../packages/web-core/src/features/pos/components/TerminalLockDrawer.jsx', () => ({ default: () => null }));
vi.mock('../../../../packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx', () => ({ default: () => null }));
vi.mock('../../../../packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx', () => ({ default: () => null }));

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../');
const posHeaderStyles = readFileSync(path.join(repositoryRoot, 'packages/web-core/src/index.css'), 'utf8');

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
  accessibleCompanies: [],
  onSwitchCompany: vi.fn(),
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
  vi.clearAllMocks();
});

describe('TerminalPageLayout responsive header', () => {
  it('keeps the title and the shared actions in one header, while hiding customer display below wide desktop', () => {
    const { container } = renderLayout();
    const header = container.querySelector('[data-pos-surface="pos"]');
    const title = header?.querySelector('h1');
    const actionsContainer = header?.querySelector('.dgfy-pos-header-actions');
    const customerDisplay = screen.getByRole('button', { name: 'Open customer display' });

    expect(header).toBeTruthy();
    expect(actionsContainer?.className).toContain('gap-3');
    expect(actionsContainer?.className).not.toContain('sm:gap-4');
    expect(title?.className).toContain('whitespace-nowrap');
    expect(title?.className).not.toContain('truncate');
    expect(customerDisplay.className).toContain('hidden');
    expect(customerDisplay.className).toContain('min-[1200px]:inline-flex');
    expect(header?.querySelector('.dgfy-pos-header-menu-button')).toBeTruthy();
    expect(header?.querySelector('.pos-text-size-control')).toBeTruthy();
    expect(header?.querySelectorAll('[aria-label="Open notifications"]').length).toBe(2);
    expect(header?.querySelector('.dgfy-pos-header-profile')).toBeTruthy();

    const actions = Array.from(header?.querySelector('.dgfy-pos-header-actions')?.children || []);
    expect(actions.map((action) => {
      if (action.matches('[data-testid="pos-open-customer-display"]')) return 'customer-display';
      if (action.matches('[data-testid="pos-header-park-slot"]')) return 'parked-sales';
      if (action.classList.contains('pos-text-size-control')) return 'text-size';
      if (action.querySelector('[aria-label="Open notifications"]')) return 'notifications';
      if (action.classList.contains('dgfy-pos-header-profile')) return 'profile';
      return 'unrecognized';
    })).toEqual(['customer-display', 'parked-sales', 'text-size', 'notifications', 'notifications', 'profile']);
  });

  it('uses the compact mobile and small-phone dimensions from the header sizing guide', () => {
    expect(posHeaderStyles).toContain('@media screen and (max-width: 374.98px)');
    expect(posHeaderStyles).toContain('min-height: 60px;');
    expect(posHeaderStyles).toContain('padding: 7px 6px !important;');
    expect(posHeaderStyles).toContain('font-size: 12px;');
    expect(posHeaderStyles).toContain('width: 16px !important;');

    expect(posHeaderStyles).toContain('@media screen and (min-width: 375px) and (max-width: 767.98px)');
    expect(posHeaderStyles).toContain('min-height: 64px;');
    expect(posHeaderStyles).toContain('padding: 8px 10px !important;');
    expect(posHeaderStyles).toContain('font-size: 14px;');
    expect(posHeaderStyles).toContain('width: 18px !important;');
    expect(posHeaderStyles).toContain('flex: 0 0 44px;');
  });

  it('does not render the checkout-only customer-display action on other POS views', () => {
    renderLayout({ posViewMode: 'items' });

    expect(screen.queryByRole('button', { name: 'Open customer display' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Open notifications' }).length).toBe(2);
  });
});
