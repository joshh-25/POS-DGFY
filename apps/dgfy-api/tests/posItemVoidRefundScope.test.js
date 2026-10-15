import { resolvePosItemVoidRefundScope } from '../src/modules/pos/domain/posItemVoid.js';

describe('POS item void refund scope', () => {
    it('recomputes a stale item-void outcome from the current cash tender', async () => {
        const result = await resolvePosItemVoidRefundScope({
            posRepository: {
                listPosTransactionAdjustmentsForTransaction: async () => ([{
                    pos_transaction_adjustment_id: 64,
                    adjustment_type: 'void',
                    status: 'succeeded',
                    amount: 90,
                    metadata: {
                        evidence_scope: 'pos_item_void',
                        financial_outcome: {
                            next_action: 'confirm_provider_ownership_and_refund',
                            reason_code: 'TENDER_OWNERSHIP_UNCONFIRMED'
                        }
                    }
                }])
            },
            transactionId: 371,
            adjustmentId: 64,
            transaction: {
                payment_status: 'paid',
                payment_type: null,
                payment_breakdown: JSON.stringify([
                    { payment_type: 'cash', count: 1, amount: 92.7 },
                    { payment_type: 'gcash', count: 0, amount: 0 },
                    { payment_type: 'card', count: 0, amount: 0 }
                ]),
                total_amount: 0
            }
        });

        expect(result.metadata.financial_outcome).toEqual(expect.objectContaining({
            refund_method: 'cash',
            next_action: 'record_cash_refund_with_cash_drawer_event',
            reason_code: 'CASH_REFUND_REQUIRED',
            refund_amount: 90
        }));
    });
});
