// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IncomingQueueWorkspace } from '../components/TerminalOperationsPanels.jsx';

afterEach(() => {
  cleanup();
});

// Phase 144 (#824). Before this, the incoming-order card rendered only "Cash on delivery" and the
// raw payment_status ("partially paid") for a downpayment order -- amount_paid/balance_due had
// zero references anywhere in apps/dgfy-web -- so staff handing over goods could not see how much
// cash to collect. The reject dialog separately asserted an unconditional "full refund".

const DOWNPAYMENT_ORDER = {
  pos_transaction_id: 903,
  invoice_number: 'INV-000903',
  tracking_pin: 'SK-DOWN01',
  fulfillment_status: 'placed',
  order_method: 'delivery',
  payment_type: 'cash',
  payment_status: 'partially_paid',
  amount_paid: 200,
  balance_due: 800,
  total_amount: 1000,
  customer_name: 'Ana Cruz',
  created_at: '2026-08-22T10:00:00Z'
};

const FULL_PAYMENT_ORDER = {
  ...DOWNPAYMENT_ORDER,
  pos_transaction_id: 904,
  invoice_number: 'INV-000904',
  tracking_pin: 'SK-FULL01',
  payment_status: 'paid',
  amount_paid: 0,
  balance_due: 0
};

const renderQueue = (orders) => render(
  <IncomingQueueWorkspace
    canViewPos
    canTransactPos
    isOnline
    locked={false}
    shiftState={{ shift: { pos_terminal_shift_id: 12, location_id: 3 } }}
    incomingOrdersState={{ orders, loading: false, accessState: 'ready' }}
    orderHistoryState={{ orders: [], pagination: {}, accessState: 'ready' }}
    incomingOrderActionState={{}}
    handleIncomingOrderStatusChange={vi.fn()}
    handleDeliveryJobStatusChange={vi.fn()}
    handleAssignDeliveryPersonnel={vi.fn()}
    deliveryPersonnelState={{ personnel: [] }}
    handleOpenCashCollection={vi.fn()}
    handleOpenIncomingOrderReceipt={vi.fn()}
    refreshIncomingOrders={vi.fn()}
    refreshOrderHistory={vi.fn()}
    locationsState={{ locations: [] }}
  />
);

describe('POS downpayment visibility (Phase 144, #824)', () => {
  it('shows the downpayment paid and the balance still to collect on the order card', () => {
    renderQueue([DOWNPAYMENT_ORDER]);

    expect(screen.getByText('Downpayment')).toBeTruthy();
    expect(screen.getByText(/₱200\.00/)).toBeTruthy();
    expect(screen.getByText('Balance due')).toBeTruthy();
    expect(screen.getByText(/₱800\.00/)).toBeTruthy();
  });

  // The balance is always collected in person (ADR 0069 clause 2 [binding]); only the wording
  // changes between delivery and pickup.
  it('words the balance line for how the order is actually handed over', () => {
    renderQueue([DOWNPAYMENT_ORDER]);
    expect(screen.getByText('Collect on delivery')).toBeTruthy();
    cleanup();

    renderQueue([{ ...DOWNPAYMENT_ORDER, order_method: 'pickup' }]);
    expect(screen.getByText('Collect at pickup')).toBeTruthy();
  });

  it('renders no split rows for an ordinary fully-paid order', () => {
    renderQueue([FULL_PAYMENT_ORDER]);

    expect(screen.queryByText('Downpayment')).toBeNull();
    expect(screen.queryByText('Balance due')).toBeNull();
  });

  it('renders no split rows when partially_paid carries no collected amount', () => {
    renderQueue([{ ...DOWNPAYMENT_ORDER, amount_paid: 0 }]);

    expect(screen.queryByText('Downpayment')).toBeNull();
  });

  it('names the real downpayment amount in the reject dialog instead of claiming a full refund', () => {
    renderQueue([DOWNPAYMENT_ORDER]);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    const dialogCopy = screen.getByText(/DGFY will request a refund of the ₱200\.00 downpayment/i);
    expect(dialogCopy).toBeTruthy();
    expect(dialogCopy.textContent).toContain('₱800.00 balance was never charged');
    // A store-side reject always refunds, even under a non-refundable policy -- so this dialog
    // must never suggest the customer's deposit is being kept.
    expect(dialogCopy.textContent).not.toMatch(/forfeit/i);
  });

  it('keeps the original generic copy for a non-downpayment order', () => {
    renderQueue([FULL_PAYMENT_ORDER]);

    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    expect(screen.getByText(/DGFY will request a full refund/i)).toBeTruthy();
    expect(screen.queryByText(/downpayment collected online/i)).toBeNull();
  });
});
