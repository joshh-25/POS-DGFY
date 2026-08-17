import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { buildStorefrontCheckoutPaymentOptions } from '../shared/model/storefrontCheckoutPaymentOptions.js';
import { createStorefrontOnlinePaymentSession } from '../shared/services/storefrontOnlinePaymentSession.js';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

describe('Simple Storefront online payment contract', () => {
  it('shows only backend-enabled PayMongo payment methods plus cash', () => {
    const options = buildStorefrontCheckoutPaymentOptions({
      card: { enabled: true, environment: 'test' },
      gcash: { enabled: true, environment: 'test' },
      maya: { enabled: false, environment: 'test' },
      qrph: { enabled: true, environment: 'test' }
    });

    expect(options).toEqual([
      { value: 'cash', label: 'Cash on delivery/pickup' },
      { value: 'card', label: 'Card (PayMongo test)' },
      { value: 'gcash', label: 'GCash (PayMongo test)' },
      { value: 'qrph', label: 'Pay via QR Ph (PayMongo test)' }
    ]);
  });

  it('shows every active hosted wallet method as its own exact selection', () => {
    const options = buildStorefrontCheckoutPaymentOptions({
      card: { enabled: true, environment: 'test' },
      gcash: { enabled: true, environment: 'test' },
      maya: { enabled: true, environment: 'test' },
      grab_pay: { enabled: true, environment: 'test' },
      shopeepay: { enabled: true, environment: 'test' },
      qrph: { enabled: true, environment: 'test' }
    });

    expect(options).toEqual([
      { value: 'cash', label: 'Cash on delivery/pickup' },
      { value: 'card', label: 'Card (PayMongo test)' },
      { value: 'gcash', label: 'GCash (PayMongo test)' },
      { value: 'maya', label: 'Maya (PayMongo test)' },
      { value: 'grab_pay', label: 'GrabPay (PayMongo test)' },
      { value: 'shopeepay', label: 'ShopeePay (PayMongo test)' },
      { value: 'qrph', label: 'Pay via QR Ph (PayMongo test)' }
    ]);
  });

  it.each(['card', 'gcash', 'maya', 'grab_pay', 'shopeepay', 'qrph'])('routes online %s through the PayMongo commerce-session endpoint', async (paymentType) => {
    const requestJson = vi.fn().mockResolvedValue({
      payment_session: {
        payment_session_id: 'CPS-ABC1234567',
        payment_method: paymentType,
        status: 'awaiting_payment'
      }
    });

    const paymentSession = await createStorefrontOnlinePaymentSession({
      authToken: 'customer-token',
      checkoutPayload: { customer_name: 'Test Customer', items: [{ item_id: 1, quantity: 1 }] },
      guestCheckoutProof: null,
      idempotencyKey: `checkout-${paymentType}`,
      paymentType,
      requestJson,
      storeSlug: 'masu-cafe-ed841f'
    });

    expect(requestJson).toHaveBeenCalledOnce();
    expect(requestJson).toHaveBeenCalledWith('/api/v1/store/checkout/payment-sessions', expect.objectContaining({
      method: 'POST',
      storeSlug: 'masu-cafe-ed841f',
      body: expect.objectContaining({
        idempotency_key: `checkout-${paymentType}`,
        payment_type: paymentType
      })
    }));
    expect(paymentSession.payment_method).toBe(paymentType);
  });

  it('rejects cash from the PayMongo online-session helper', async () => {
    const requestJson = vi.fn();

    await expect(createStorefrontOnlinePaymentSession({
      checkoutPayload: {},
      idempotencyKey: 'cash-checkout',
      paymentType: 'cash',
      requestJson,
      storeSlug: 'masu-cafe-ed841f'
    })).rejects.toThrow('Only QR Ph, card, GCash, Maya, GrabPay, or ShopeePay');
    expect(requestJson).not.toHaveBeenCalled();
  });

  it('wires Simple checkout to capability options, PayMongo sessions, and return recovery', () => {
    const route = readSource('modes/simple/checkout/pages/SimpleCheckoutRoutePage.jsx');
    const panel = readSource('shared/components/checkout/StorefrontOnlinePaymentPanel.jsx');
    const submission = readSource('shared/hooks/useCheckoutSubmission.js');
    const shell = readSource('StorefrontApp.jsx');

    expect(route).toContain('buildStorefrontCheckoutPaymentOptions(selectedStore?.payment_capabilities)');
    expect(route).toContain('StorefrontOnlinePaymentPanel');
    expect(route).toContain("fnbPaymentType === 'qrph'");
    expect(panel).toContain("paymentType === 'qrph' && typeof onConfirmTestPayment === 'function'");
    expect(submission).toContain('isSimpleMode && isStorefrontOnlinePaymentType(fnbPaymentType)');
    expect(submission).toContain('createStorefrontOnlinePaymentSession');
    expect(shell).toContain('isSimpleMode && isResolvedOrderSubpage');
    expect(shell).toContain("params.get('payment_session')");
    expect(shell).toContain('setSimpleOrderStep(3)');
    expect(shell).toContain("setCheckoutTab('checkout')");
    expect(shell).toContain("paymentSession?.status === 'finalized' && paymentSession?.tracking_pin");
    expect(shell).toContain('goStoreTrackPage({ pin: trackingPin });');
  });
});
