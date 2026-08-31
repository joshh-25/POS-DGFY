// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BalanceSettlementDialog from '../components/BalanceSettlementDialog.jsx';

afterEach(() => {
  cleanup();
});

// Phase 204 (#965). Covers the capture affordance only -- the upload-after-settle sequencing and
// "warning toast, never a thrown error" behaviour live in TerminalPage.jsx's handleSettleBalance
// and are not independently covered here; this suite pins what's testable at the dialog level.

const DOWNPAYMENT_ORDER = {
  pos_transaction_id: 903,
  fulfillment_status: 'out_for_delivery',
  order_method: 'delivery',
  payment_status: 'partially_paid',
  amount_paid: 200,
  balance_due: 800,
  total_amount: 1000
};

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
    proofFile={null}
    onProofFileChange={vi.fn()}
    proofUploading={false}
    proofError=""
    {...overrides}
  />
);

describe('POS balance-payment proof capture (Phase 204, #965)', () => {
  it('does not render the capture affordance on the cash branch', () => {
    renderDialog({ method: 'cash' });

    expect(screen.queryByLabelText(/attach proof/i)).toBeNull();
  });

  it('renders the capture affordance on a non-cash (merchant-owned) branch', () => {
    renderDialog({ method: 'gcash' });

    expect(screen.getByLabelText(/attach proof/i)).toBeTruthy();
  });

  it('carries the audit-aid copy -- never framed as DGFY-verified evidence', () => {
    renderDialog({ method: 'gcash' });

    // Both the reference-number note and the proof-capture note carry their own "audit aid
    // only... not proof that DGFY verified the payment" disclaimer, so a loose /audit aid only/i
    // or /not proof that dgfy verified the payment/i query matches two elements and throws
    // (caught only once this suite was actually executed, not just syntax-checked -- see PR
    // #1210's RF-2). Match each note's full text instead of a shared substring.
    expect(screen.getAllByText(/audit aid only/i)).toHaveLength(2);
    expect(screen.getByText('An audit aid only. It is not proof that DGFY verified the payment.')).toBeTruthy();
    expect(screen.getByText(
      'An audit aid only. An attached photo is evidence the store captured at the counter -- it is not proof that DGFY verified the payment.'
    )).toBeTruthy();
  });

  it('choosing a file never gates submit -- the proof is optional', () => {
    // Same balance/cash-received basis as the existing "lets a cash settlement be submitted"
    // case, but on the gcash branch with the attestation already ticked.
    renderDialog({ method: 'gcash', confirmed: true, proofFile: null });
    const enabledWithoutFile = screen.getByRole('button', { name: /record payment/i }).disabled;

    cleanup();
    renderDialog({ method: 'gcash', confirmed: true, proofFile: new File(['x'], 'proof.jpg', { type: 'image/jpeg' }) });
    const enabledWithFile = screen.getByRole('button', { name: /record payment/i }).disabled;

    expect(enabledWithoutFile).toBe(false);
    expect(enabledWithFile).toBe(false);
  });

  it('a chosen file can be cleared via the Remove control', () => {
    const onProofFileChange = vi.fn();
    renderDialog({
      method: 'gcash',
      proofFile: new File(['x'], 'proof.jpg', { type: 'image/jpeg' }),
      onProofFileChange
    });

    fireEvent.click(screen.getByRole('button', { name: /remove/i }));

    expect(onProofFileChange).toHaveBeenCalledWith(null);
  });

  it('surfaces a proof error message when one is passed in', () => {
    renderDialog({ method: 'gcash', proofError: 'Balance recorded, but the proof photo could not be uploaded.' });

    expect(screen.getByText(/could not be uploaded/i)).toBeTruthy();
  });
});
