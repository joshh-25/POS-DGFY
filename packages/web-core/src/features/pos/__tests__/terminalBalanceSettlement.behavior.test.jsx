// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IncomingQueueWorkspace } from '../components/TerminalOperationsPanels.jsx';
import BalanceSettlementDialog from '../components/BalanceSettlementDialog.jsx';

afterEach(() => {
  cleanup();
});

// Phase 148 (#825). Phase 144 made the balance VISIBLE on the order card; nothing could act on it.
// This suite covers the action: who gets the button, and the fail-closed confirmation ADR 0063
// clause 6 [binding] requires before a merchant-owned tender can be submitted.

const DOWNPAYMENT_ORDER = {
  pos_transaction_id: 903,
  invoice_number: 'INV-000903',
  tracking_pin: 'SK-DOWN01',
  fulfillment_status: 'out_for_delivery',
  order_method: 'delivery',
  payment_type: 'cash',
  payment_status: 'partially_paid',
  amount_paid: 200,
  balance_due: 800,
  total_amount: 1000,
  customer_name: 'Ana Cruz',
  created_at: '2026-08-22T10:00:00Z'
};

const renderQueue = (orders, overrides = {}) => render(
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
    handleOpenBalanceSettlement={vi.fn()}
    handleOpenIncomingOrderReceipt={vi.fn()}
    refreshIncomingOrders={vi.fn()}
    refreshOrderHistory={vi.fn()}
    locationsState={{ locations: [] }}
    {...overrides}
  />
);

const renderDialog = (overrides = {}) => render(
  <BalanceSettlementDialog
    order={DOWNPAYMENT_ORDER}
    method="cash"
    cashInput="800"
    reference=""
    confirmed={false}
    saving={false}
    onClose={vi.fn()}
    onMethodChange={vi.fn()}
    onCashInputChange={vi.fn()}
    onReferenceChange={vi.fn()}
    onConfirmedChange={vi.fn()}
    onSubmit={vi.fn()}
    {...overrides}
  />
);

describe('POS balance settlement action (Phase 148, #825)', () => {
  it('offers Settle Balance on a partially-paid order at handover', () => {
    renderQueue([DOWNPAYMENT_ORDER]);

    expect(screen.getByRole('button', { name: /settle balance/i })).toBeTruthy();
    // The two buttons are mutually exclusive by construction -- collect-cash owns `unpaid`,
    // settlement owns `partially_paid` -- so a downpayment order must never offer both.
    expect(screen.queryByRole('button', { name: /collect.*cash/i })).toBeNull();
  });

  it('never offers Settle Balance on the plain COD path collect-cash owns', () => {
    renderQueue([{ ...DOWNPAYMENT_ORDER, payment_status: 'unpaid', amount_paid: 0, balance_due: 0 }]);

    expect(screen.queryByRole('button', { name: /settle balance/i })).toBeNull();
    expect(screen.getByRole('button', { name: /collect.*cash/i })).toBeTruthy();
  });

  it('never offers Settle Balance once the balance is zero', () => {
    renderQueue([{ ...DOWNPAYMENT_ORDER, payment_status: 'paid', amount_paid: 1000, balance_due: 0 }]);

    expect(screen.queryByRole('button', { name: /settle balance/i })).toBeNull();
  });

  it('never offers Settle Balance before the order reaches handover', () => {
    renderQueue([{ ...DOWNPAYMENT_ORDER, fulfillment_status: 'preparing' }]);

    expect(screen.queryByRole('button', { name: /settle balance/i })).toBeNull();
  });

  it('opens settlement for the order that was clicked', () => {
    const handleOpenBalanceSettlement = vi.fn();
    renderQueue([DOWNPAYMENT_ORDER], { handleOpenBalanceSettlement });

    fireEvent.click(screen.getByRole('button', { name: /settle balance/i }));

    expect(handleOpenBalanceSettlement).toHaveBeenCalledWith(DOWNPAYMENT_ORDER);
  });

  it('bases the dialog on the balance due, not the order total', () => {
    // The bug this pins: computing change off total_amount -- which is what the Collect Cash
    // dialog correctly does for its own flow -- would show PHP 0.00 change on PHP 1000 tendered
    // against an PHP 800 balance, shorting the customer PHP 200 at the counter.
    renderDialog({ cashInput: '1000' });

    expect(screen.getByText(/Balance due: PHP 800\.00/)).toBeTruthy();
    expect(screen.getByText(/Change: PHP 200\.00/)).toBeTruthy();
  });

  it('lets a cash settlement be submitted without any extra attestation', () => {
    renderDialog({ method: 'cash', cashInput: '800' });

    expect(screen.getByRole('button', { name: /record payment/i }).disabled).toBe(false);
  });

  it('blocks a cash settlement that does not cover the balance', () => {
    renderDialog({ method: 'cash', cashInput: '799' });

    expect(screen.getByRole('button', { name: /record payment/i }).disabled).toBe(true);
  });

  it('fails closed on a merchant-owned method until the store attests it received the money', () => {
    // ADR 0063 clause 6 [binding]: selecting a digital method alone is insufficient. This is the
    // UI half of that rule; the server enforces the same thing independently.
    const { unmount } = renderDialog({ method: 'gcash', confirmed: false });
    expect(screen.getByRole('button', { name: /record payment/i }).disabled).toBe(true);
    unmount();

    renderDialog({ method: 'gcash', confirmed: true });
    expect(screen.getByRole('button', { name: /record payment/i }).disabled).toBe(false);
  });

  it('offers every merchant-owned method ADR 0063 clause 4 (as scoped-superseded by ADR 0077) authorizes', () => {
    renderDialog();

    ['Cash', 'GCash', 'Maya', 'Card terminal', 'Bank transfer', 'Cheque'].forEach((label) => {
      expect(screen.getByLabelText(label)).toBeTruthy();
    });
  });

  it('states plainly that a merchant-owned settlement is store-attested, not DGFY-verified', () => {
    // ADR 0063 clause 5 [binding] / clause 7 [default]: cashier attestation is operational
    // evidence, and a reference number is an audit aid -- neither is provider verification, and
    // the copy must not let staff believe otherwise.
    renderDialog({ method: 'gcash' });

    expect(screen.getByText(/not verified by DGFY/i)).toBeTruthy();
    expect(screen.getByText(/not proof that DGFY verified the payment/i)).toBeTruthy();
  });

  // Phase 202 (#1085): ADR 0077 scoped-supersedes ADR 0063 clause 4 to add `cheque` as a sixth
  // balance-settlement method. Cheque falls on the existing non-cash branch by construction --
  // these pin its method-aware copy, not a new code path.
  it('shows a cheque-number label and presented-not-cleared copy when cheque is selected', () => {
    renderDialog({ method: 'cheque' });

    expect(screen.getByLabelText(/cheque number/i)).toBeTruthy();
    expect(screen.getByText(/presented bearing this number/i)).toBeTruthy();
    expect(screen.getByText(/not that it will clear/i)).toBeTruthy();
  });

  it('fails closed on cheque until the store attests it received the cheque', () => {
    const { unmount } = renderDialog({ method: 'cheque', confirmed: false });
    expect(screen.getByRole('button', { name: /record payment/i }).disabled).toBe(true);
    unmount();

    renderDialog({ method: 'cheque', confirmed: true });
    expect(screen.getByRole('button', { name: /record payment/i }).disabled).toBe(false);
  });

  it('states the cheque attestation copy as receiving a cheque, not an account transfer', () => {
    renderDialog({ method: 'cheque' });

    expect(screen.getByText(/received a cheque for/i)).toBeTruthy();
    expect(screen.getByText(/not confirmation that the cheque has cleared/i)).toBeTruthy();
  });
});
