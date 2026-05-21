/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  queueLocationScopeId: 2,
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
  it('keeps queue scope control independent from operating location state', () => {
    const setQueueLocationScopeId = vi.fn();
    const setOperatingLocationId = vi.fn();
    const props = buildBaseProps({
      viewMode: 'location_scope',
      setQueueLocationScopeId,
      setOperatingLocationId
    });

    render(<TerminalOperationsWorkspace {...props} />);

    const queueScopeSelect = screen.getByRole('combobox');
    fireEvent.change(queueScopeSelect, { target: { value: '1' } });

    expect(setQueueLocationScopeId).toHaveBeenCalledWith(1);
    expect(setOperatingLocationId).not.toHaveBeenCalled();
  });

  it('updates operating location from shift controls without mutating queue scope', () => {
    const setQueueLocationScopeId = vi.fn();
    const setOperatingLocationId = vi.fn();
    const props = buildBaseProps({
      viewMode: 'shift_controls',
      shiftState: { loading: false, shift: null, cashSummary: null },
      setQueueLocationScopeId,
      setOperatingLocationId
    });

    render(<TerminalOperationsWorkspace {...props} />);

    const operatingSelect = screen.getByRole('combobox');
    fireEvent.change(operatingSelect, { target: { value: '2' } });

    expect(setOperatingLocationId).toHaveBeenCalledWith(2);
    expect(setQueueLocationScopeId).not.toHaveBeenCalled();
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

    expect(screen.getByText('You do not have permission to switch shift location.')).toBeTruthy();
    expect(screen.queryByText('Switch Shift Location')).toBeNull();
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

    fireEvent.change(screen.getByPlaceholderText('Reason for location switch'), {
      target: { value: 'Need to cover neighboring branch' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Shift Location' }));

    expect(handleSwitchShiftLocation).toHaveBeenCalledWith({
      targetLocationId: 2,
      reason: 'Need to cover neighboring branch'
    });
  });

  it('keeps MSME mode on minimal shift-controls workspace with operating selector visible', () => {
    const props = buildBaseProps({
      isMsmeMode: true,
      viewMode: 'incoming_queue',
      shiftState: { loading: false, shift: null, cashSummary: null }
    });

    render(<TerminalOperationsWorkspace {...props} />);

    expect(screen.getByText('Shift Controls')).toBeTruthy();
    expect(screen.getByText('Operating Location')).toBeTruthy();
    expect(screen.queryByText('Incoming Online Queue')).toBeNull();
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

    expect(screen.getByText('Location Binding Readiness: Ready')).toBeTruthy();
    expect(screen.getByText(/Unresolved:/)).toBeTruthy();
    expect(screen.getByText(/Low confidence:/)).toBeTruthy();
  });
});
