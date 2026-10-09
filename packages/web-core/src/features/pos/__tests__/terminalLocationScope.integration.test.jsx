/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import TerminalOperationsWorkspace from '../components/TerminalOperationsWorkspace.jsx';

const buildLocationsState = () => ({
  loading: false,
  locations: [
    { location_id: 1, name: 'Main Branch' },
    { location_id: 2, name: 'East Branch' }
  ]
});

const buildBaseProps = (overrides = {}) => ({
  viewMode: 'shift_controls',
  isMsmeMode: false,
  terminalUser: { username: 'cashier1' },
  terminalRegistry: [
    { terminal_id: 'MAIN-01', label: 'Main Register', location_id: 1, is_active: true },
    { terminal_id: 'EAST-01', label: 'East Register', location_id: 2, is_active: true }
  ],
  locked: false,
  terminalMeta: {
    pettyCashSymbol: 'PHP',
    pettyCashAmount: 500,
    activeDiscountCount: 1,
    enabledFeeMethods: []
  },
  shiftState: {
    loading: false,
    shift: null,
    cashSummary: null
  },
  todayDashboard: {
    loading: false,
    businessDate: '2026-04-21',
    salesSummary: {
      transaction_count: 0,
      total_amount: 0
    }
  },
  canViewPos: true,
  canTransactPos: true,
  canAdminBypassShiftPrompt: false,
  canViewAdminLocationMonitor: false,
  canSwitchPosLocation: false,
  canAdjustCashDrawer: true,
  canCloseDay: true,
  openShiftForm: { openingFloatAmount: '', openingNote: '' },
  setOpenShiftForm: vi.fn(),
  cashEventForm: { eventType: 'cash_in', amount: '', reason: '' },
  setCashEventForm: vi.fn(),
  closeShiftForm: { closingCashAmount: '', closingNote: '' },
  setCloseShiftForm: vi.fn(),
  shiftActionLoading: {
    open: false,
    switchLocation: false,
    cashEvent: false,
    close: false
  },
  handleOpenShift: vi.fn(),
  handleSwitchShiftLocation: vi.fn(),
  handleRecordCashEvent: vi.fn(),
  handleCloseShift: vi.fn(),
  refreshOperationalContext: vi.fn(),
  locationsState: buildLocationsState(),
  operatingLocationId: 1,
  setOperatingLocationId: vi.fn(),
  viewingLocationId: null,
  setViewingLocationId: vi.fn(),
  queueLocationScopeId: 2,
  adminLocationMonitorState: { loading: false, orders: [], terminalShifts: [], locationId: null },
  refreshAdminLocationMonitor: vi.fn(),
  setQueueLocationScopeId: vi.fn(),
  incomingOrdersState: { loading: false, orders: [] },
  incomingOrderActionState: {},
  handleIncomingOrderStatusChange: vi.fn(),
  handleOpenIncomingOrderReceipt: vi.fn(),
  incomingReceiptOpeningId: null,
  handleOpenIncomingOrderHistory: vi.fn(),
  incomingHistoryOpeningId: null,
  refreshIncomingOrders: vi.fn(),
  sectionIds: {},
  ...overrides
});

const buildAdminNoShiftProps = (overrides = {}) => buildBaseProps({
  canAdminBypassShiftPrompt: true,
  canOpenShift: true,
  canViewBranchLocations: true,
  activeTerminalId: 'MAIN-01',
  adminLocationMonitorState: {
    loading: false,
    locationId: 1,
    orders: [{
      pos_transaction_id: 302,
      customer_name: 'Main Branch Buyer',
      tracking_pin: 'MAIN-302',
      fulfillment_status: 'placed',
      order_method: 'pickup',
      payment_status: 'paid',
      created_at: '2026-04-21T09:00:00.000Z'
    }],
    terminalShifts: [{
      pos_terminal_shift_id: 81,
      terminal_id: 'MAIN-01',
      cashier_id: 5,
      cashier: { username: 'Cashier One' },
      opened_at: '2026-04-21T08:00:00.000Z',
      stale_recovery: { is_stale: true, age_minutes: 135 }
    }]
  },
  branchDirectoryState: {
    loading: false,
    errorMessage: '',
    locations: [{
      location_id: 1,
      name: 'Main Branch',
      can_view: true,
      terminals: [{
        terminal_id: 'MAIN-01',
        label: 'Main Register',
        status: 'stale',
        current_operator: { display_name: 'Cashier One' },
        shift: {
          pos_terminal_shift_id: 81,
          opened_at: '2026-04-21T08:00:00.000Z',
          cashier: { display_name: 'Cashier One' }
        }
      }]
    }]
  },
  ...overrides
});

afterEach(() => {
  cleanup();
});

const chooseDropdownOption = async (accessibleName, optionName) => {
  fireEvent.click(await screen.findByRole('combobox', { name: accessibleName }));
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
};

describe('POS terminal location UX integration', () => {
  it('renders the incoming queue scope without exposing the operating-location selector', async () => {
    const setQueueLocationScopeId = vi.fn();
    const setOperatingLocationId = vi.fn();
    const props = buildBaseProps({
      viewMode: 'incoming_queue',
      setQueueLocationScopeId,
      setOperatingLocationId
    });

    render(<TerminalOperationsWorkspace {...props} />);

    // The incoming queue loads behind a lazy boundary. Allow a cold module import
    // more than Testing Library's 1s default when the contract suite runs under CI load.
    expect(await screen.findByText('Location scope:', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByText('East Branch')).toBeTruthy();
    expect(screen.queryByLabelText('Operating Location')).toBeNull();
    expect(setQueueLocationScopeId).not.toHaveBeenCalled();
    expect(setOperatingLocationId).not.toHaveBeenCalled();
  });

  it('hides incoming orders until the terminal has an active shift', async () => {
    const props = buildBaseProps({
      viewMode: 'incoming_queue',
      incomingOrdersState: {
        loading: false,
        accessState: 'shift_required',
        errorMessage: 'Open a shift to view orders for this branch.',
        orders: [{
          pos_transaction_id: 301,
          customer_name: 'Main Branch Buyer',
          fulfillment_status: 'placed'
        }]
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(await screen.findByText('Open a shift to view orders for this branch.')).toBeTruthy();
    expect(screen.queryByText('Main Branch Buyer')).toBeNull();
  });

  it('renders no-shift admin Orders as read-only branch monitoring', async () => {
    const refreshAdminLocationMonitor = vi.fn();
    const props = buildBaseProps({
      viewMode: 'incoming_queue',
      canAdminBypassShiftPrompt: true,
      canViewAdminLocationMonitor: true,
      viewingLocationId: 2,
      refreshAdminLocationMonitor,
      adminLocationMonitorState: {
        loading: false,
        locationId: 2,
        orders: [{
          pos_transaction_id: 302,
          customer_name: 'East Branch Buyer',
          tracking_pin: 'EAST-302',
          fulfillment_status: 'placed',
          order_method: 'pickup',
          payment_status: 'paid',
          created_at: '2026-04-21T09:00:00.000Z'
        }],
        terminalShifts: []
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(await screen.findByTestId('admin-branch-orders')).toBeTruthy();
    expect(screen.getByText('East Branch Buyer')).toBeTruthy();
    expect(screen.getByText(/Read-only admin view/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Accept|Reject|Process/i })).toBeNull();
  });

  it('keeps Admin branch monitoring in Shift Location and opens shifts in the shared Shift Session', async () => {
    const handleOpenShift = vi.fn();
    render(<TerminalOperationsWorkspace {...buildAdminNoShiftProps({
      canRecoverStaleShifts: true,
      handleOpenShift
    })} />);

    expect(screen.getByRole('tab', { name: 'Branch Terminals' }).getAttribute('aria-selected')).toBe('true');
    const shiftSections = screen.getByRole('tablist', { name: 'Shift sections' });
    expect(shiftSections.parentElement.className).toContain('overflow-x-hidden');
    expect(shiftSections.className).toContain('grid grid-cols-2 min-w-0 w-full');
    expect(shiftSections.className).not.toContain('min-w-max');
    const adminShiftSections = screen.getByRole('tablist', { name: 'Admin shift location sections' });
    expect(adminShiftSections.className).toContain('overflow-x-auto');
    expect(adminShiftSections.className).toContain('pt-2');
    expect(adminShiftSections.firstElementChild.className).toContain('grid grid-cols-3 min-w-0 w-full');
    const branchTerminalsTab = screen.getByRole('tab', { name: 'Branch Terminals' });
    expect(branchTerminalsTab.className).toContain('w-full');
    expect(branchTerminalsTab.className).toContain('justify-center');
    expect(screen.getByRole('heading', { name: 'Terminals' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Current Operator' })).toBeTruthy();
    const desktopTerminals = within(screen.getByRole('region', { name: 'Branch terminals at Main Branch' }));
    const desktopDetailsButton = desktopTerminals.getByRole('button', { name: 'View details for Main Register' });
    const desktopMonitorButton = desktopTerminals.getByRole('button', { name: 'Open read-only branch monitor for Main Branch from Main Register' });
    expect(desktopDetailsButton.textContent).toBe('');
    expect(desktopDetailsButton.querySelector('svg')).toBeTruthy();
    expect(desktopDetailsButton.title).toBe('View details for Main Register');
    expect(desktopMonitorButton.textContent).toBe('');
    expect(desktopMonitorButton.querySelector('svg')).toBeTruthy();
    expect(desktopMonitorButton.title).toBe('Monitor Main Register');
    const mobileTerminals = screen.getByTestId('pos-admin-branch-terminals-mobile-view');
    const mobileMonitorButton = within(mobileTerminals)
      .getByRole('button', { name: 'Open read-only branch monitor for Main Branch from Main Register' });
    expect(mobileMonitorButton.textContent).toBe('');
    expect(mobileMonitorButton.className).toContain('h-11 w-11');
    fireEvent.click(within(mobileTerminals)
      .getByRole('button', { name: 'View details for Main Register' }));
    const terminalDetails = within(mobileTerminals)
      .getByRole('region', { name: 'Additional details for Main Register' });
    expect(within(terminalDetails).getByText('Shift owner')).toBeTruthy();
    expect(within(terminalDetails).getByText('Shift ID')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Open Shift' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Monitor' }));
    expect(screen.getByRole('heading', { name: 'Active Shifts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recover Stale Shift' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Terminals' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Branch Orders (1)' }));
    expect(screen.getByRole('heading', { name: 'Active Orders' })).toBeTruthy();
    expect(screen.getByTestId('pos-admin-branch-order-monitor').textContent).toContain('Main Branch · View-only online orders.');
    expect(within(screen.getByTestId('pos-admin-branch-orders-mobile-view'))
      .getByText('Main Branch Buyer')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Active Shifts' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Session' }));
    expect(await screen.findByRole('heading', { name: 'Select a terminal' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Start Shift' })).toBeTruthy();
    expect(screen.getByLabelText('Opening Float (PHP)')).toBeTruthy();
    const emptyShiftSession = screen.getByTestId('pos-shift-session-empty');
    expect(emptyShiftSession.className).toContain('space-y-4');
    expect(emptyShiftSession.className).not.toContain('rounded-2xl');
    expect(screen.getByTestId('pos-admin-open-shift-terminal').className).not.toContain('rounded-lg');
    expect(screen.getByTestId('pos-admin-open-shift-panel')).toBeTruthy();
    expect(screen.getByTestId('pos-admin-open-shift-panel').className).toContain('border-t');
    expect(screen.getByTestId('pos-admin-open-shift-panel').className).not.toContain('rounded-xl');
    expect(screen.getByTestId('pos-branch-day-close-panel').className).toContain('border-t');
    expect(screen.getByTestId('pos-branch-day-close-panel').className).not.toContain('rounded-xl');
    expect(screen.getByRole('button', { name: 'Use Selected Terminal' }).disabled).toBe(true);
    expect(screen.getByText('Current terminal: MAIN-01')).toBeTruthy();
    expect(screen.queryByTestId('pos-admin-open-shift-disclosure')).toBeNull();
    expect(handleOpenShift).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Location' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Branch Terminals' })).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'Branch Terminals' }));
    expect(screen.getByRole('table', { name: 'Terminals at Main Branch' })).toBeTruthy();
  });

  it('keeps Admin Shift Location subtabs available while an admin shift is open', () => {
    render(<TerminalOperationsWorkspace {...buildAdminNoShiftProps({
      shiftState: {
        loading: false,
        shift: {
          pos_terminal_shift_id: 82,
          business_date: '2026-04-21',
          location_id: 1,
          location_name: 'Main Branch',
          opened_at: '2026-04-21T08:00:00.000Z',
          opening_float_amount: 100,
          cashier: { username: 'Admin One' }
        },
        cashSummary: { expected_cash_amount: 125, cash_sales_amount: 25 },
        salesSummary: { transaction_count: 1, total_amount: 30 }
      }
    })} />);

    expect(screen.getByRole('tab', { name: 'Branch Terminals' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Shift Monitor' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Branch Orders (1)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Shift Management' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Terminals at Main Branch' })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Monitor' }));
    expect(screen.getByRole('heading', { name: 'Active Shifts' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Shift Management' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Branch Orders (1)' }));
    expect(screen.getByRole('heading', { name: 'Active Orders' })).toBeTruthy();
    expect(within(screen.getByTestId('pos-admin-branch-orders-mobile-view'))
      .getByText('Main Branch Buyer')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Branch Terminals' }));
    expect(screen.getByRole('heading', { name: 'Shift Management' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Terminals at Main Branch' })).toBeTruthy();
  });

  it('keeps one refresh action for the selected Shift Location subtab', () => {
    const refreshBranchDirectory = vi.fn();
    const refreshOperationalContext = vi.fn();
    const refreshAdminLocationMonitor = vi.fn();
    render(<TerminalOperationsWorkspace {...buildAdminNoShiftProps({
      refreshBranchDirectory,
      refreshOperationalContext,
      refreshAdminLocationMonitor
    })} />);

    const sharedRefresh = screen.getByTestId('pos-admin-shift-location-refresh');
    expect(screen.getAllByTestId('pos-admin-shift-location-refresh')).toHaveLength(1);
    fireEvent.click(sharedRefresh);
    expect(refreshBranchDirectory).toHaveBeenCalledOnce();
    expect(refreshOperationalContext).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Monitor' }));
    const monitorRefresh = screen.getByRole('button', { name: 'Refresh branch activity' });
    expect(screen.getByTestId('pos-admin-branch-monitor-header').contains(monitorRefresh)).toBe(true);
    expect(monitorRefresh.classList.contains('!bg-[#1A4E8D]')).toBe(true);
    fireEvent.click(monitorRefresh);
    expect(refreshAdminLocationMonitor).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('tab', { name: 'Branch Orders (1)' }));
    const ordersRefresh = screen.getByRole('button', { name: 'Refresh branch activity' });
    expect(screen.getAllByTestId('pos-admin-shift-location-refresh')).toHaveLength(1);
    expect(screen.getByTestId('pos-admin-branch-monitor-header').contains(ordersRefresh)).toBe(true);
    fireEvent.click(ordersRefresh);
    expect(refreshAdminLocationMonitor).toHaveBeenCalledTimes(2);
  });

  it('keeps the Shift Location subtab rail full-width and places monitor refresh beside its header', () => {
    render(<TerminalOperationsWorkspace {...buildAdminNoShiftProps()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Monitor' }));
    const tablist = screen.getByRole('tablist', { name: 'Admin shift location sections' });
    const tabWrapper = tablist.parentElement;
    const tabRow = tabWrapper.parentElement;
    const refresh = screen.getByTestId('pos-admin-shift-location-refresh');
    const monitorHeader = screen.getByTestId('pos-admin-branch-monitor-header');

    expect(tabRow.className).toContain('flex min-w-0 flex-col gap-2');
    expect(monitorHeader.contains(refresh)).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Branch Orders (1)' }));
    const ordersHeader = screen.getByTestId('pos-admin-branch-monitor-header');
    expect(ordersHeader.contains(screen.getByTestId('pos-admin-shift-location-refresh'))).toBe(true);
  });

  it('labels branch orders with the viewed branch, not the operating branch', () => {
    const props = buildAdminNoShiftProps({
      viewingLocationId: 2,
      adminLocationMonitorState: {
        loading: false,
        locationId: 2,
        orders: [{
          pos_transaction_id: 322,
          customer_name: 'East Branch Buyer',
          tracking_pin: 'EAST-322',
          fulfillment_status: 'placed',
          order_method: 'pickup',
          payment_status: 'unpaid',
          created_at: '2026-04-21T09:00:00.000Z'
        }],
        terminalShifts: []
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Branch Orders (1)' }));

    expect(screen.getByTestId('pos-admin-branch-order-monitor').textContent).toContain('East Branch · View-only online orders.');
    expect(within(screen.getByTestId('pos-admin-branch-orders-mobile-view'))
      .getByText('East Branch Buyer')).toBeTruthy();
    expect(screen.queryByText('Main Branch Buyer')).toBeNull();
  });

  it('does not show an opening-float form to a read-only Admin in Shift Session', async () => {
    render(<TerminalOperationsWorkspace {...buildAdminNoShiftProps({ canOpenShift: false })} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Session' }));
    expect(await screen.findByText('Admin view only. POS transact permission is required to open a shift.')).toBeTruthy();
    expect(screen.queryByLabelText('Opening Float (PHP)')).toBeNull();
  });

  it('keeps terminal-confirmation guidance beside the selector without a duplicate blocked panel', async () => {
    render(<TerminalOperationsWorkspace {...buildAdminNoShiftProps({ activeTerminalId: 'EAST-01' })} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Session' }));

    expect(await screen.findByText('Select and confirm a terminal in this branch before opening a shift.')).toBeTruthy();
    expect(screen.queryByTestId('pos-admin-open-shift-panel')).toBeNull();
    expect(screen.queryByLabelText('Opening Float (PHP)')).toBeNull();
  });

  it('uses one Shift Session tab for Cashier opening and closing states', async () => {
    const handleCloseShift = vi.fn();
    const initialProps = buildBaseProps({ canOpenShift: true, canCloseShift: true, handleCloseShift });
    const { rerender } = render(<TerminalOperationsWorkspace {...initialProps} />);

    expect(screen.queryByLabelText('Opening Float (PHP)')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Shift Session' }));
    expect(await screen.findByLabelText('Opening Float (PHP)')).toBeTruthy();
    expect(screen.queryByLabelText('Closing Cash (PHP)')).toBeNull();

    rerender(<TerminalOperationsWorkspace {...buildBaseProps({
      canOpenShift: true,
      canCloseShift: true,
      handleCloseShift,
      shiftState: {
        loading: false,
        shift: {
          pos_terminal_shift_id: 101,
          business_date: '2026-04-21',
          location_id: 1,
          location_name: 'Main Branch',
          opened_at: '2026-04-21T08:00:00.000Z',
          opening_float_amount: 100
        },
        cashSummary: { expected_cash_amount: 125, cash_sales_amount: 25 },
        salesSummary: { subtotal_amount: 40, total_amount: 40 }
      }
    })} />);

    expect(await screen.findByTestId('pos-shift-session-summary')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Shift details' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cash overview' })).toBeTruthy();
    expect(screen.getByText('Total gross sales')).toBeTruthy();
    expect(screen.getByText('PHP 40.00')).toBeTruthy();
    expect(screen.queryByText('Before discounts and service fees')).toBeNull();
    expect(screen.getByLabelText('Physical cash counted (PHP)')).toBeTruthy();
    expect(screen.queryByLabelText('Opening Float (PHP)')).toBeNull();
    const closeShiftButton = screen.getByRole('button', { name: 'Close Shift', exact: true });
    expect(closeShiftButton.classList.contains('!bg-[#1A4E8D]')).toBe(true);
    const refreshStatusButton = screen.getByRole('button', { name: 'Refresh day-close status' });
    expect(refreshStatusButton.classList.contains('!bg-[#1A4E8D]')).toBe(true);

    const closeShiftSection = screen.getByRole('heading', { name: 'Close Shift' }).closest('section');

    expect(closeShiftSection).toBe(screen.getByTestId('pos-close-cashier-shift-panel'));
    expect(closeShiftSection.classList.contains('rounded-xl')).toBe(true);
    expect(screen.getByTestId('pos-branch-day-close-panel')).toBeTruthy();
    expect(screen.getByText('Close this cashier shift before generating the branch Z-reading.')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Cash Drawer' }));
    const recordCashEventButton = await screen.findByRole('button', { name: 'Record Cash Event' });
    expect(recordCashEventButton.classList.contains('!bg-[#1A4E8D]')).toBe(true);
    expect(screen.getByRole('button', { name: /Cashier History/ }).classList.contains('border-[#8AA8CD]')).toBe(true);
  });

  it('keeps stale-shift recovery hidden unless the recovery capability is present', () => {
    render(<TerminalOperationsWorkspace {...buildAdminNoShiftProps()} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Monitor' }));

    expect(screen.getByRole('heading', { name: 'Active Shifts' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Recover Stale Shift' })).toBeNull();
  });

  it('does not render an unguarded operating-location selector while a shift is active', () => {
    const setQueueLocationScopeId = vi.fn();
    const setOperatingLocationId = vi.fn();
    const props = buildBaseProps({
      viewMode: 'shift_controls',
      shiftState: {
        loading: false,
        shift: {
          pos_terminal_shift_id: 101,
          business_date: '2026-04-21',
          location_id: 1,
          location_name: 'Main Branch',
          opened_at: '2026-04-21T08:00:00.000Z',
          opening_float_amount: 100
        },
        cashSummary: {
          expected_cash_amount: 100,
          cash_sales_amount: 80
        }
      },
      canViewBranchLocations: true,
      branchDirectoryState: {
        loading: false,
        locations: [{
          location_id: 1,
          name: 'Masu Cafe',
          open_shift_count: 1,
          is_open: true,
          can_view: true,
          terminals: [{
            terminal_id: 'MASU-01',
            label: 'Masu Register',
            status: 'occupied',
            shift: { cashier: { display_name: 'Admin' } }
          }]
        }]
      },
      setQueueLocationScopeId,
      setOperatingLocationId
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Masu Cafe')).toBeTruthy();
    expect(screen.getByTestId('pos-view-branch-1')).toBeTruthy();
    expect(screen.queryByText('View authorized branches and their current cashier/terminal occupancy. Branch viewing is read-only.')).toBeNull();
    expect(screen.getByText('Current Shift Location')).toBeTruthy();
    expect(setOperatingLocationId).not.toHaveBeenCalled();
    expect(setQueueLocationScopeId).not.toHaveBeenCalled();
  });

  it('keeps register branch selection separate from admin viewing branch selection', async () => {
    const setOperatingLocationId = vi.fn();
    const setViewingLocationId = vi.fn();
    const props = buildBaseProps({
      canAdminBypassShiftPrompt: true,
      canViewAdminLocationMonitor: true,
      setOperatingLocationId,
      setViewingLocationId
    });

    render(<TerminalOperationsWorkspace {...props} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Shift Session' }));

    await chooseDropdownOption('Register Branch', 'East Branch');

    expect(setOperatingLocationId).toHaveBeenCalledWith(2);
    await chooseDropdownOption('Viewing Branch', 'East Branch');

    expect(setViewingLocationId).toHaveBeenCalledWith(2);
    expect(screen.getByText('View orders and shifts only; the register branch stays unchanged.')).toBeTruthy();
  });

  it('does not expose branch viewing to a cashier without the admin monitor permission', () => {
    render(<TerminalOperationsWorkspace {...buildBaseProps()} />);

    expect(screen.queryByLabelText('Viewing Branch')).toBeNull();
    expect(screen.queryByText('Active Orders')).toBeNull();
  });

  it('keeps a rejected shift switch actionable without taking over the destination terminal', async () => {
    const handleSwitchShiftLocation = vi.fn().mockResolvedValue({
      ok: false,
      conflict: {
        reasonCode: 'POS_TARGET_TERMINAL_OCCUPIED',
        message: 'The destination terminal already has an active shift. Close it before switching this register.',
        targetLocationId: 2,
        targetTerminalId: 'EAST-01'
      }
    });
    const refreshOperationalContext = vi.fn();
    const refreshAdminLocationMonitor = vi.fn();
    const props = buildBaseProps({
      canSwitchPosLocation: true,
      handleSwitchShiftLocation,
      refreshOperationalContext,
      refreshAdminLocationMonitor,
      shiftState: {
        loading: false,
        shift: {
          pos_terminal_shift_id: 101,
          business_date: '2026-04-21',
          location_id: 1,
          location_name: 'Main Branch',
          opened_at: '2026-04-21T08:00:00.000Z',
          opening_float_amount: 100
        },
        cashSummary: { expected_cash_amount: 100, cash_sales_amount: 80 }
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    await chooseDropdownOption('New Shift Location', 'East Branch');
    await chooseDropdownOption('Destination Terminal', /EAST-01/);
    fireEvent.change(screen.getByLabelText('Counted Closing Cash'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Destination Opening Float'), { target: { value: '100' } });
    fireEvent.change(screen.getByPlaceholderText('Reason for shift location change'), { target: { value: 'Move register to East branch' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Shift Location' }));

    await waitFor(() => expect(screen.getByTestId('pos-shift-location-conflict')).toBeTruthy());
    expect(screen.getByText(/Current register: Main Branch/i)).toBeTruthy();
    expect(screen.getByText(/Requested: East Register · East Branch/i)).toBeTruthy();
    expect(screen.getByText(/No takeover, cash transfer, or automatic close was performed/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh shift and terminal availability' }));
    await waitFor(() => {
      expect(refreshOperationalContext).toHaveBeenCalled();
      expect(refreshAdminLocationMonitor).toHaveBeenCalled();
    });
    expect(handleSwitchShiftLocation).toHaveBeenCalledTimes(1);
  });

  it('shows only current-scope admin orders and never paints stale rows under the new branch', async () => {
    const props = buildBaseProps({
      canAdminBypassShiftPrompt: true,
      canViewAdminLocationMonitor: true,
      viewingLocationId: 2,
      adminLocationMonitorState: {
        loading: false,
        locationId: 1,
        orders: [{ pos_transaction_id: 901, customer_name: 'Main Branch Buyer' }],
        terminalShifts: []
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Session' }));
    expect(await screen.findByLabelText('Viewing Branch')).toBeTruthy();
    expect(screen.queryByText('Main Branch Buyer')).toBeNull();
  });

  it('does not offer inactive branches in either admin selector', async () => {
    const props = buildBaseProps({
      canAdminBypassShiftPrompt: true,
      canViewAdminLocationMonitor: true,
      locationsState: {
        loading: false,
        locations: [
          { location_id: 1, name: 'Main Branch' },
          { location_id: 2, name: 'East Branch', is_active: false }
        ]
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Shift Session' }));
    expect((await screen.findByLabelText('Register Branch')).textContent).not.toContain('East Branch');
    expect((await screen.findByLabelText('Viewing Branch')).textContent).not.toContain('East Branch');
  });

  it('shows denied guidance when user cannot switch shift location', () => {
    const props = buildBaseProps({
      viewMode: 'shift_controls',
      canSwitchPosLocation: false,
      shiftState: {
        loading: false,
        shift: {
          pos_terminal_shift_id: 100,
          business_date: '2026-04-21',
          location_id: 1,
          location_name: 'Main Branch',
          opened_at: '2026-04-21T08:00:00.000Z',
          opening_float_amount: 100
        },
        cashSummary: {
          expected_cash_amount: 100,
          cash_sales_amount: 80
        }
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByText('You do not have permission to change the active shift location.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change Shift Location' })).toBeNull();
  });

  it('allows privileged users to switch location with reason and target payload', async () => {
    const handleSwitchShiftLocation = vi.fn();
    const props = buildBaseProps({
      viewMode: 'shift_controls',
      canSwitchPosLocation: true,
      operatingLocationId: 2,
      handleSwitchShiftLocation,
      shiftState: {
        loading: false,
        shift: {
          pos_terminal_shift_id: 200,
          business_date: '2026-04-21',
          location_id: 1,
          location_name: 'Main Branch',
          opened_at: '2026-04-21T09:00:00.000Z',
          opening_float_amount: 200
        },
        cashSummary: {
          expected_cash_amount: 210,
          cash_sales_amount: 150
        }
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByRole('button', { name: 'Change Shift Location' }).disabled).toBe(true);
    await chooseDropdownOption('New Shift Location', 'East Branch');
    expect(props.setOperatingLocationId).not.toHaveBeenCalled();
    expect(handleSwitchShiftLocation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Change Shift Location' }).disabled).toBe(true);

    await chooseDropdownOption('Destination Terminal', /EAST-01/);
    fireEvent.change(screen.getByRole('textbox', { name: 'Counted Closing Cash' }), {
      target: { value: '195' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Destination Opening Float' }), {
      target: { value: '100' }
    });

    fireEvent.change(screen.getByPlaceholderText('Reason for shift location change'), {
      target: { value: 'Need to cover neighboring branch' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change Shift Location' }));

    expect(handleSwitchShiftLocation).toHaveBeenCalledWith({
      targetLocationId: 2,
      terminalId: 'EAST-01',
      closingCashAmount: '195',
      openingFloatAmount: '100',
      closingNote: '',
      openingNote: '',
      reason: 'Need to cover neighboring branch'
    });
  });

  it('disables active-shift location switching while offline', () => {
    const props = buildBaseProps({
      viewMode: 'shift_controls',
      isOnline: false,
      canSwitchPosLocation: true,
      shiftState: {
        loading: false,
        shift: {
          pos_terminal_shift_id: 201,
          business_date: '2026-04-21',
          location_id: 1,
          location_name: 'Main Branch',
          opened_at: '2026-04-21T09:00:00.000Z',
          opening_float_amount: 200
        },
        cashSummary: {
          expected_cash_amount: 210,
          cash_sales_amount: 150
        }
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByRole('combobox', { name: 'New Shift Location' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Change Shift Location' }).disabled).toBe(true);
  });

  it('renders the MSME incoming queue and still requires an active shift', async () => {
    const props = buildBaseProps({
      isMsmeMode: true,
      viewMode: 'incoming_queue',
      shiftState: { loading: false, shift: null, cashSummary: null },
      incomingOrdersState: {
        loading: false,
        accessState: 'shift_required',
        errorMessage: 'Open a shift to view orders for this branch.',
        orders: []
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(await screen.findByRole('tab', { name: /Active Queue/ })).toBeTruthy();
    expect(screen.getByText('Open a shift to view orders for this branch.')).toBeTruthy();
  });

  it('renders location-binding readiness summary in terminal setup context', () => {
    const props = buildBaseProps({
      viewMode: 'terminal_setup',
      terminalMeta: {
        pettyCashSymbol: 'PHP',
        pettyCashAmount: 500,
        activeDiscountCount: 2,
        enabledFeeMethods: ['dine_in'],
        locationBindingReadiness: {
          migration_tag: '20260421000002_shift_location_remediation_v1',
          total_shifts: 10,
          unresolved_count: 0,
          low_confidence_count: 0,
          ready_for_strict_mode: true
        }
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByText('Loading shared tenant settings...')).toBeTruthy();
  });

  it('shows the address and map link without exposing coordinates for incoming delivery orders with a saved pin', async () => {
    const props = buildBaseProps({
      viewMode: 'incoming_queue',
      incomingOrdersState: {
        loading: false,
        orders: [{
          pos_transaction_id: 500,
          customer_name: 'Delivery Buyer',
          tracking_pin: 'SK-PIN500',
          order_method: 'delivery',
          payment_type: 'cash',
          fulfillment_status: 'placed',
          customer_phone: '09171234567',
          delivery_address: '123 Test Street',
          delivery_latitude: '10.7202',
          delivery_longitude: '122.5621'
        }]
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(await screen.findByText('Address')).toBeTruthy();
    expect(screen.getByText('123 Test Street')).toBeTruthy();
    expect(screen.getByText('09171234567')).toBeTruthy();
    expect(screen.getByText('10.72020000, 122.56210000')).toBeTruthy();
    const mapLink = screen.getByRole('link', { name: 'Open pin in map' });
    expect(mapLink.getAttribute('href')).toBe('https://maps.google.com/?q=10.7202,122.5621');
  });

  it('keeps incoming text-only delivery orders link-free when no coordinates are present', async () => {
    const props = buildBaseProps({
      viewMode: 'incoming_queue',
      incomingOrdersState: {
        loading: false,
        orders: [{
          pos_transaction_id: 501,
          customer_name: 'Text Buyer',
          tracking_pin: 'SK-TEXT1',
          order_method: 'delivery',
          payment_type: 'cash',
          fulfillment_status: 'placed',
          delivery_address: 'Text-only landmark address',
          delivery_latitude: null,
          delivery_longitude: null
        }]
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(await screen.findByText('Text-only landmark address')).toBeTruthy();
    expect(screen.getByText('Pin coordinates')).toBeTruthy();
    expect(screen.getAllByText('Not provided')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Open pin in map' })).toBeNull();
  });

  it('shows one non-actionable selected-branch marker without duplicating branch-view controls', () => {
    const props = buildAdminNoShiftProps({ branchViewLocationId: 1 });

    render(<TerminalOperationsWorkspace {...props} />);

    const selectedBranch = screen.getByTestId('pos-view-branch-1');
    expect(selectedBranch.tagName).toBe('SPAN');
    expect(selectedBranch.getAttribute('aria-current')).toBe('location');
    expect(screen.queryByRole('button', { name: 'Viewing this branch' })).toBeNull();
    expect(screen.queryByText('Read-only branch view')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exit Branch View' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Active online orders' })).toBeTruthy();
  });

  it('keeps branch content hidden until the selected branch monitor finishes its entry load', () => {
    const props = buildAdminNoShiftProps({
      branchViewLocationId: 1,
      branchViewTransitionLoading: true
    });
    const { rerender } = render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByTestId('pos-branch-view-loading').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('pos-branch-directory')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Active online orders' })).toBeNull();

    rerender(<TerminalOperationsWorkspace {...props} branchViewTransitionLoading={false} />);

    expect(screen.queryByTestId('pos-branch-view-loading')).toBeNull();
    expect(screen.getByTestId('pos-branch-directory')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Active online orders' })).toBeTruthy();
  });

  it('keeps the last branch terminal snapshot visible after refresh fails', () => {
    const props = buildAdminNoShiftProps();
    props.branchDirectoryState = {
      ...props.branchDirectoryState,
      errorMessage: 'Branch terminals are unavailable.'
    };

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByRole('alert').textContent).toContain('Refresh failed — showing last results');
    expect(screen.getByRole('region', { name: 'Branch terminals at Main Branch' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Terminals at Main Branch' })).toBeTruthy();
    expect(screen.queryByText('No active terminals are registered at Main Branch.')).toBeNull();
    expect(screen.getByText('Scroll horizontally to view all columns.')).toBeTruthy();
  });

  it('announces a branch-order refresh while retaining the last loaded orders', () => {
    const props = buildAdminNoShiftProps({
      branchViewLocationId: 1,
      adminLocationMonitorState: {
        loading: true,
        locationId: 1,
        orders: [{
          pos_transaction_id: 302,
          customer_name: 'Main Branch Buyer',
          fulfillment_status: 'placed'
        }],
        terminalShifts: []
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByText('Refreshing orders…')).toBeTruthy();
    expect(screen.getByText('Main Branch Buyer')).toBeTruthy();
  });

  it('does not show an empty branch-order state when the monitor request fails', () => {
    const props = buildAdminNoShiftProps({
      branchViewLocationId: 1,
      adminLocationMonitorState: {
        loading: false,
        locationId: 1,
        orders: [],
        terminalShifts: [],
        errorMessage: 'Branch monitor is unavailable.'
      }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByRole('alert').textContent).toContain('Branch monitor is unavailable.');
    expect(screen.queryByText('No active online orders.')).toBeNull();
  });
});
