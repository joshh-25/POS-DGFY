// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';

afterEach(() => cleanup());

const baseProps = {
  showBrand: false,
  locked: false,
  isOnline: true,
  terminalUser: { role: 'admin' },
  currentViewMode: 'settings_profile',
  shiftState: { shift: { pos_terminal_shift_id: 12, location_id: 3 } },
  showIncomingQueue: true,
  showServiceOperations: true,
  canAccessServiceOperations: false,
  canAccessPosOnlySetup: false,
  canManageCategories: false,
  onSelectViewMode: () => {}
};

describe('TerminalWorkspaceSidebar permission visibility', () => {
  it('hides POS modules when their parent access is absent', () => {
    render(
      <TerminalWorkspaceSidebar
        {...baseProps}
        canViewPos={false}
        canTransactPos={false}
        canViewItems={false}
        canViewReports={false}
        canViewAffiliates={false}
        canViewVouchers={false}
        canCloseShift={false}
        canAdjustCashDrawer={false}
      />
    );

    expect(screen.queryByTestId('pos-nav-sell')).toBeNull();
    expect(screen.queryByTestId('pos-nav-history')).toBeNull();
    expect(screen.queryByTestId('pos-nav-reports')).toBeNull();
    expect(screen.queryByTestId('pos-nav-items')).toBeNull();
    expect(screen.queryByTestId('pos-nav-services')).toBeNull();
    expect(screen.queryByTestId('pos-nav-orders')).toBeNull();
    expect(screen.queryByTestId('pos-nav-shift')).toBeNull();
    expect(screen.queryByTestId('pos-nav-vouchers')).toBeNull();
    expect(screen.queryByTestId('pos-nav-affiliates')).toBeNull();
  });

  it('keeps view-only modules while hiding Sell without transact permission', () => {
    render(
      <TerminalWorkspaceSidebar
        {...baseProps}
        canViewPos
        canTransactPos={false}
        canViewItems
        canViewReports
        canViewAffiliates
        canViewVouchers
        canCloseShift
      />
    );

    expect(screen.queryByTestId('pos-nav-sell')).toBeNull();
    expect(screen.getByTestId('pos-nav-history')).toBeDefined();
    expect(screen.getByTestId('pos-nav-reports')).toBeDefined();
    expect(screen.getByTestId('pos-nav-items')).toBeDefined();
    expect(screen.getByTestId('pos-nav-vouchers')).toBeDefined();
    expect(screen.getByTestId('pos-nav-affiliates')).toBeDefined();
    expect(screen.getByTestId('pos-nav-shift')).toBeDefined();
  });
});
