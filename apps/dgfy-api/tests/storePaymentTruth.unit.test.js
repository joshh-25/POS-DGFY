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
});
