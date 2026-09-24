/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

afterEach(() => {
  cleanup();
});

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

    // This panel is loaded through React.lazy; give its dynamically imported chunk enough time
    // to resolve on slower CI workers before asserting the rendered location scope.
    expect(await screen.findByText('Location scope:', {}, { timeout: 5000 })).toBeTruthy();
    expect(await screen.findByText('East Branch')).toBeTruthy();
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
    expect(await screen.findByText('East Branch Buyer')).toBeTruthy();
    expect(await screen.findByText(/Read-only admin view/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Accept|Reject|Process/i })).toBeNull();
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
      setQueueLocationScopeId,
      setOperatingLocationId
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Current Shift Location')).toBeTruthy();
    expect(setOperatingLocationId).not.toHaveBeenCalled();
    expect(setQueueLocationScopeId).not.toHaveBeenCalled();
  });

  it('keeps register branch selection separate from admin viewing branch selection', () => {
    const setOperatingLocationId = vi.fn();
    const setViewingLocationId = vi.fn();
    const props = buildBaseProps({
      canAdminBypassShiftPrompt: true,
      canViewAdminLocationMonitor: true,
      setOperatingLocationId,
      setViewingLocationId
    });

    render(<TerminalOperationsWorkspace {...props} />);

    fireEvent.change(screen.getByLabelText('Register Branch'), { target: { value: '2' } });

    expect(setOperatingLocationId).toHaveBeenCalledWith(2);
    fireEvent.change(screen.getByLabelText('Viewing Branch'), { target: { value: '2' } });

    expect(setViewingLocationId).toHaveBeenCalledWith(2);
    expect(screen.getByText(/Read-only orders and shift monitoring/i)).toBeTruthy();
  });

  it('does not expose branch viewing to a cashier without the admin monitor permission', () => {
    render(<TerminalOperationsWorkspace {...buildBaseProps()} />);

    expect(screen.queryByLabelText('Viewing Branch')).toBeNull();
    expect(screen.queryByText('Branch Order Monitor')).toBeNull();
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

    fireEvent.change(screen.getByLabelText('New Shift Location'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Destination Terminal'), { target: { value: 'EAST-01' } });
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

  it('shows only current-scope admin orders and never paints stale rows under the new branch', () => {
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

    expect(screen.getByLabelText('Viewing Branch')).toBeTruthy();
    expect(screen.queryByText('Main Branch Buyer')).toBeNull();
  });

  it('does not offer inactive branches in either admin selector', () => {
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

    expect(screen.getByLabelText('Register Branch').textContent).not.toContain('East Branch');
    expect(screen.getByLabelText('Viewing Branch').textContent).not.toContain('East Branch');
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
    expect(screen.queryByText('Change Shift Location')).toBeNull();
  });

  it('allows privileged users to switch location with reason and target payload', () => {
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
    fireEvent.change(screen.getByRole('combobox', { name: 'New Shift Location' }), {
      target: { value: '2' }
    });
    expect(props.setOperatingLocationId).not.toHaveBeenCalled();
    expect(handleSwitchShiftLocation).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Change Shift Location' }).disabled).toBe(true);

    fireEvent.change(screen.getByRole('combobox', { name: 'Destination Terminal' }), {
      target: { value: 'EAST-01' }
    });
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

  it('renders the MSME incoming queue and still requires an active shift', () => {
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

    expect(screen.getByRole('tab', { name: /Active Queue/ })).toBeTruthy();
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

  it('shows the address and map link without exposing coordinates for incoming delivery orders with a saved pin', () => {
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

    expect(screen.getByText('Address')).toBeTruthy();
    expect(screen.getByText('123 Test Street')).toBeTruthy();
    expect(screen.getByText('09171234567')).toBeTruthy();
    expect(screen.getByText('10.72020000, 122.56210000')).toBeTruthy();
    const mapLink = screen.getByRole('link', { name: 'Open pin in map' });
    expect(mapLink.getAttribute('href')).toBe('https://maps.google.com/?q=10.7202,122.5621');
  });

  it('keeps incoming text-only delivery orders link-free when no coordinates are present', () => {
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

    expect(screen.getByText('Text-only landmark address')).toBeTruthy();
    expect(screen.getByText('Pin coordinates')).toBeTruthy();
    expect(screen.getAllByText('Not provided')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: 'Open pin in map' })).toBeNull();
  });
});
