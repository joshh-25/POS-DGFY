import { describe, expect, it } from 'vitest';
import { resolvePosRefundWorkflow } from '../components/POSRefundWorkflowDialog.jsx';

describe('POS refund workflow resolution', () => {
    it('routes a stale provider outcome back to the cash drawer workflow', () => {
        expect(resolvePosRefundWorkflow({
            payment_type: null,
            payment_breakdown: JSON.stringify([
                { payment_type: 'cash', amount: 90 },
                { payment_type: 'gcash', amount: 0 },
                { payment_type: 'card', amount: 0 }
            ]),
            financial_outcome: {
                next_action: 'confirm_provider_ownership_and_refund'
            }
        })).toBe('cash');
    });

    it('keeps funded split allocations on the split workflow', () => {
        expect(resolvePosRefundWorkflow({
            payment_type: 'cash',
            payment_breakdown: [
                { payment_type: 'cash', amount: 100 },
                { payment_type: 'card', amount: 50 }
            ],
            financial_outcome: {
                next_action: 'confirm_provider_ownership_and_refund'
            }
        })).toBe('split');
    });
});
