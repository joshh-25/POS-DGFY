import crypto from 'crypto';
import { describe, expect, it } from '@jest/globals';
import {
    buildPosPaymentProviderConfirmationCanonical,
    createPosPaymentProviderConfirmationVerifier
} from '../src/modules/pos/services/posPaymentProviderConfirmation.js';

describe('POS provider confirmation verifier', () => {
    const session = { pos_payment_session_id: 501, session_reference: 'PAY-501' };
    const allocation = {
        pos_payment_allocation_id: 701,
        payment_provider: 'paymongo',
        payment_reference: 'GC-501',
        applied_amount: 750
    };

    it('accepts a current HMAC-signed provider event and returns its audit identity', async () => {
        const providerConfirmedAt = new Date().toISOString();
        const payload = {
            provider_event_id: 'provider-event-501',
            provider_confirmed_at: providerConfirmedAt
        };
        const signature = crypto.createHmac('sha256', 'phase-62-test-secret-0123456789abcdef')
            .update(buildPosPaymentProviderConfirmationCanonical({ session, allocation, payload }))
            .digest('hex');
        const verifier = createPosPaymentProviderConfirmationVerifier({ secret: 'phase-62-test-secret-0123456789abcdef' });

        await expect(verifier({ session, allocation, payload: { ...payload, provider_confirmed_at: new Date(providerConfirmedAt), provider_signature: signature } })).resolves.toEqual(expect.objectContaining({
            verified: true,
            provider_event_id: 'provider-event-501'
        }));
    });

    it('rejects tampered signatures and fails closed when no secret is configured', async () => {
        const payload = {
            provider_event_id: 'provider-event-502',
            provider_confirmed_at: new Date().toISOString(),
            provider_signature: 'a'.repeat(64)
        };
        const verifier = createPosPaymentProviderConfirmationVerifier({ secret: 'phase-62-test-secret-0123456789abcdef' });
        await expect(verifier({ session, allocation, payload })).resolves.toEqual(expect.objectContaining({ verified: false }));
        await expect(createPosPaymentProviderConfirmationVerifier({ secret: '' })({ session, allocation, payload })).resolves.toEqual(expect.objectContaining({ verified: false }));
    });
});
