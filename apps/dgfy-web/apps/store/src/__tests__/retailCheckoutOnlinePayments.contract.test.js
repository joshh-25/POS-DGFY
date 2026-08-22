import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { buildStorefrontCheckoutPaymentOptions } from '../shared/model/storefrontCheckoutPaymentOptions.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

// Phase 142 (#823): Retail's payment step was a hardcoded cash-only placeholder
// (PLACEHOLDER_PAYMENT_OPTIONS/RetailOnlinePaymentPlaceholder, see git history) with no path to
// create an online payment session at all -- this mirrors simpleCheckoutOnlinePayments.contract.test.js's
// coverage for the now-real Retail wiring.
describe('Retail Storefront online payment contract', () => {
  it('shows backend-enabled PayMongo payment methods for Retail, same options model as Simple/F&B', () => {
    const options = buildStorefrontCheckoutPaymentOptions({
      card: { enabled: true, environment: 'test' },
      gcash: { enabled: true, environment: 'test' },
      qrph: { enabled: true, environment: 'test' }
    });

    expect(options).toEqual([
      { value: 'cash', label: 'Cash on delivery/pickup' },
      { value: 'card', label: 'Card (PayMongo test)' },
      { value: 'gcash', label: 'GCash (PayMongo test)' },
      { value: 'qrph', label: 'Pay via QR Ph (PayMongo test)' }
    ]);
  });

  it('hides cash for a downpayment-required Retail store', () => {
    const options = buildStorefrontCheckoutPaymentOptions(
      { qrph: { enabled: true, environment: 'test' } },
      { hideCash: true }
    );
    expect(options.some((option) => option.value === 'cash')).toBe(false);
  });

  // Phase 150 (#866) RF-3: a customer_choice store never offers plain COD-in-full -- see
  // simpleCheckoutOnlinePayments.contract.test.js's own copy of this assertion for the rationale.
  it('hides cash for a customer_choice Retail store regardless of the current election', () => {
    const page = readSource('modes/retail/checkout/pages/RetailOrderPage.jsx');
    expect(page).toContain('hideCash: downpaymentDisplay.active || isCustomerChoiceStore(selectedStore)');
  });

  it('wires Retail checkout to live payment capabilities, PayMongo sessions, and step-3 return recovery', () => {
    const page = readSource('modes/retail/checkout/pages/RetailOrderPage.jsx');
    const step = readSource('modes/retail/checkout/components/RetailOrderPaymentStep.jsx');
    const props = readSource('modes/retail/checkout/hooks/useRetailOrderPageProps.js');
    const submission = readSource('shared/hooks/useCheckoutSubmission.js');
    const shell = readSource('StorefrontApp.jsx');

    // Retail no longer owns a disconnected local paymentType state -- it's shared with
    // F&B/MSME via StorefrontApp.jsx's fnbPaymentType/handlePaymentTypeChange.
    expect(page).not.toContain("useState('cash')");
    expect(page).toContain('buildStorefrontCheckoutPaymentOptions(');
    expect(page).toContain('StorefrontOnlinePaymentPanel');
    expect(page).toContain('isStorefrontOnlinePaymentType(paymentType)');
    expect(step).not.toContain('PLACEHOLDER_PAYMENT_OPTIONS');
    expect(step).not.toContain('RetailOnlinePaymentPlaceholder');
    expect(props).toContain('paymentType: fnbPaymentType');
    expect(props).toContain('onPaymentTypeChange: handlePaymentTypeChange');
    expect(props).toContain('qrphPaymentSession');
    expect(submission).toContain('(isSimpleMode || isRetailMode) && isStorefrontOnlinePaymentType(fnbPaymentType)');
    expect(shell).toContain('(isSimpleMode || isRetailMode) && isResolvedOrderSubpage');
  });

  it('resumes to the payment step after a PayMongo return, self-contained (no hoisted retail step)', () => {
    const page = readSource('modes/retail/checkout/pages/RetailOrderPage.jsx');
    expect(page).toContain("if (qrphPaymentSession?.payment_session_id && step !== 3) setStep(3);");
  });
});
