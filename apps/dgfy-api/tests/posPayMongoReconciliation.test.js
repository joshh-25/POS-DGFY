import { describe, expect, it, jest } from '@jest/globals';
import { createPosPayMongoReconciler } from '../src/modules/pos/services/posPayMongoReconciliation.js';

const session = {
    session_reference: 'PSES-ABC123'
};

const allocation = {
    allocation_reference: 'ALLOC-ABC123',
    payment_provider: 'paymongo',
    payment_reference: 'pay_ABC123',
    payment_method: 'gcash',
    applied_amount: 750
};

const payment = (overrides = {}) => ({
    id: 'pay_ABC123',
    attributes: {
        status: 'paid',
        amount: 75000,
        currency: 'PHP',
        paid_at: 1786500000,
        source: { type: 'gcash' },
        metadata: {
            pos_payment_session_reference: 'PSES-ABC123',
            pos_payment_allocation_reference: 'ALLOC-ABC123'
        },
        refunds: [],
        ...overrides
    }
});

describe('POS PayMongo reconciliation adapter', () => {
    it('confirms a paid payment only after amount, method, currency, and scope metadata match', async () => {
        const paymongoService = { getPayment: jest.fn().mockResolvedValue(payment()) };
        const reconcile = createPosPayMongoReconciler({ paymongoService });

        const result = await reconcile({ session, allocation });

        expect(result).toEqual(expect.objectContaining({
            reconciled: true,
            action: 'confirm',
            provider_event_id: 'paymongo:payment:pay_ABC123:paid'
        }));
        expect(paymongoService.getPayment).toHaveBeenCalledWith('pay_ABC123');
    });

    it.each([
        ['scope', payment({ metadata: {} }), 'PAYMENT_PROVIDER_SCOPE_MISMATCH'],
        ['amount', payment({ amount: 74900 }), 'PAYMENT_PROVIDER_AMOUNT_MISMATCH'],
        ['currency', payment({ currency: 'USD' }), 'PAYMENT_PROVIDER_AMOUNT_MISMATCH'],
        ['method', payment({ source: { type: 'card' } }), 'PAYMENT_PROVIDER_METHOD_MISMATCH'],
        ['status', payment({ status: 'pending' }), 'PAYMENT_PROVIDER_NOT_PAID']
    ])('rejects a %s mismatch without confirming the allocation', async (label, providerPayment, reasonCode) => {
        const reconcile = createPosPayMongoReconciler({
            paymongoService: { getPayment: jest.fn().mockResolvedValue(providerPayment) }
        });

        const result = await reconcile({ session, allocation });

        expect(result.reconciled).toBe(false);
        expect(result.reason_code).toBe(reasonCode);
    });

    it('returns a full-refund reversal with a stable replay identity', async () => {
        const reconcile = createPosPayMongoReconciler({
            paymongoService: {
                getPayment: jest.fn().mockResolvedValue(payment({
                    refunds: [{
                        id: 'ref_FULL123',
                        attributes: { status: 'succeeded', amount: 75000, updated_at: 1786500300 }
                    }]
                }))
            }
        });

        const result = await reconcile({ session, allocation });

        expect(result).toEqual(expect.objectContaining({
            reconciled: true,
            action: 'reverse',
            provider_refund_ids: ['ref_FULL123'],
            provider_refund_event_id: 'paymongo:refund:ref_FULL123:succeeded',
            provider_refund_status: 'succeeded'
        }));
    });

    it('fails closed on a partial refund that cannot reverse the complete tender leg', async () => {
        const reconcile = createPosPayMongoReconciler({
            paymongoService: {
                getPayment: jest.fn().mockResolvedValue(payment({
                    refunds: [{
                        id: 'ref_PARTIAL123',
                        attributes: { status: 'succeeded', amount: 10000 }
                    }]
                }))
            }
        });

        const result = await reconcile({ session, allocation });

        expect(result.reconciled).toBe(false);
        expect(result.reason_code).toBe('PAYMENT_PROVIDER_PARTIAL_REFUND_REQUIRES_REVIEW');
    });
});
