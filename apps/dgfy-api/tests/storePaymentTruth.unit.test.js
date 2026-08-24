import { resolveStorefrontPaymentSnapshot } from '../src/modules/store/usecases/storeUseCases.js';

describe('Storefront payment truth', () => {
    test('rejects client-asserted paid state for an unverified payment selection', () => {
        expect(resolveStorefrontPaymentSnapshot({
            paymentType: 'cash',
            payload: {
                payment_status: 'paid',
                payment_provider: 'client-provider',
                payment_reference: 'client-reference'
            }
        })).toEqual({
            payment_status: 'unpaid',
            payment_reference: null,
            payment_checkout_url: null,
            payment_provider: null,
            payment_session_reference: null
        });
    });

    test('retains provider evidence only for webhook-confirmed QR Ph', () => {
        expect(resolveStorefrontPaymentSnapshot({
            paymentType: 'qrph',
            payload: {
                payment_webhook_confirmed: true,
                payment_status: 'paid',
                payment_provider: 'forged-provider-name',
                payment_reference: 'pay_verified_123',
                payment_checkout_url: 'https://checkout.example/session',
                payment_session_reference: 'CPS-VERIFIED1'
            }
        })).toEqual({
            payment_status: 'paid',
            payment_reference: 'pay_verified_123',
            payment_checkout_url: 'https://checkout.example/session',
            payment_provider: 'paymongo',
            payment_session_reference: 'CPS-VERIFIED1'
        });
    });

    // Phase 141 (#822): capturedPayment is a server-internal argument, never a payload field -- see
    // tests/downpaymentWebhookFinalization.unit.test.js for the full webhook-finalization path this
    // branch actually serves. These two cases pin the pure conversion in isolation.
    test('capturedPayment with a remaining balance reports partially_paid, amount_paid/balance_due in pesos', () => {
        expect(resolveStorefrontPaymentSnapshot({
            paymentType: 'cash',
            payload: {},
            capturedPayment: {
                captured_centavos: 10100,
                order_total_centavos: 50500,
                method: 'gcash',
                provider_payment_id: 'pay_dp_123',
                session_reference: 'CPS-DPTEST1'
            }
        })).toEqual({
            payment_status: 'partially_paid',
            payment_reference: 'pay_dp_123',
            payment_checkout_url: null,
            payment_provider: 'paymongo',
            payment_session_reference: 'CPS-DPTEST1',
            amount_paid: 101,
            balance_due: 404
        });
    });

    test('capturedPayment whose captured amount equals the order total reports paid, zero balance', () => {
        expect(resolveStorefrontPaymentSnapshot({
            paymentType: 'cash',
            payload: {},
            capturedPayment: {
                captured_centavos: 50500,
                order_total_centavos: 50500,
                method: 'qrph',
                provider_payment_id: 'pay_dp_full',
                session_reference: 'CPS-DPTEST2'
            }
        })).toEqual(expect.objectContaining({
            payment_status: 'paid',
            amount_paid: 505,
            balance_due: 0
        }));
    });
});
