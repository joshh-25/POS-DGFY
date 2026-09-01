import { assertMobilePosExpectedTransactionState } from '../src/modules/pos/domain/mobilePosReplayGuard.js';

describe('mobile POS replay state guard', () => {
    const transaction = {
        status: 'voided',
        payment_status: 'paid',
        updated_at: '2026-09-01T00:00:00.000Z'
    };

    it('accepts the exact transaction state captured offline', () => {
        expect(() => assertMobilePosExpectedTransactionState({
            transaction,
            payload: {
                expected_status: 'voided',
                expected_payment_status: 'paid',
                expected_server_version: '2026-09-01T00:00:00.000Z'
            },
            operation: 'cash_refund'
        })).not.toThrow();
    });

    it('returns a durable conflict reason when server state changed', () => {
        expect(() => assertMobilePosExpectedTransactionState({
            transaction,
            payload: {
                expected_status: 'voided',
                expected_payment_status: 'paid',
                expected_server_version: '2026-08-31T23:59:00.000Z'
            },
            operation: 'cash_refund'
        })).toThrow(expect.objectContaining({
            code: 'CONFLICT',
            statusCode: 409,
            details: expect.objectContaining({ reason_code: 'MOBILE_TRANSACTION_VERSION_CONFLICT' })
        }));
    });
});
