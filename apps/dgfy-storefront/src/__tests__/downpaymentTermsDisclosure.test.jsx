/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DownpaymentPaymentCallout } from '../shared/components/checkout/DownpaymentPaymentCallout.jsx';
import { DOWNPAYMENT_TERMS_VERSION } from '../shared/model/downpaymentTermsDocument.js';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;
const display = (refundable) => ({
  active: true,
  downpaymentAmount: 200,
  balanceDueAmount: 800,
  orderTotalAmount: 1000,
  refundable
});

afterEach(cleanup);

// Phase 219 (#1220): the terms link rides the same `refundable === false` gate the neutral
// disclosure note has used since Phase 143 (#824) -- one gate, not two.
describe('DownpaymentPaymentCallout terms disclosure', () => {
  it('offers the terms link when the downpayment is non-refundable', () => {
    render(<DownpaymentPaymentCallout display={display(false)} money={money} orderMethod="delivery" />);
    expect(screen.getByRole('button', { name: 'Read the downpayment terms' })).toBeTruthy();
  });

  it('offers no terms link when the downpayment is refundable or unknown', () => {
    render(<DownpaymentPaymentCallout display={display(true)} money={money} orderMethod="delivery" />);
    render(<DownpaymentPaymentCallout display={display(null)} money={money} orderMethod="pickup" />);
    expect(screen.queryByRole('button', { name: 'Read the downpayment terms' })).toBeNull();
  });

  it('opens the versioned terms in a dialog and closes back to the checkout step', () => {
    render(<DownpaymentPaymentCallout display={display(false)} money={money} orderMethod="delivery" />);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Read the downpayment terms' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain(DOWNPAYMENT_TERMS_VERSION);
    // Pat's deliberate override of #1220's own instruction (2026-08-31): the draft/pending-review
    // status is recorded internally only -- never as a visible banner in this customer-facing
    // dialog. Locking that in as a regression test, not just an omission.
    expect(dialog.textContent).not.toContain('pending formal legal review');
    expect(dialog.textContent).not.toContain('not yet been reviewed by a lawyer');
    // The checkout amounts stay mounted underneath -- the modal never replaces the step.
    expect(screen.getByText('Downpayment due now: PHP 200.00')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Read the downpayment terms' })).toBeTruthy();
  });

  it('never gates payment on the terms -- no checkbox, no agreement control', () => {
    render(<DownpaymentPaymentCallout display={display(false)} money={money} orderMethod="delivery" />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/I agree/i)).toBeNull();
  });
});
