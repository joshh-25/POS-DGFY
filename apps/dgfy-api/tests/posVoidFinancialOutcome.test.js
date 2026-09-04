import { resolvePosVoidFinancialOutcome } from '../src/modules/pos/domain/posVoidFinancialOutcome.js';

describe('POS void financial outcome classification', () => {
    it('does not require a refund for unpaid transactions', () => {
        expect(resolvePosVoidFinancialOutcome({
            payment_status: 'unpaid',
            payment_type: 'cash',
            total_amount: 125
        })).toEqual(expect.objectContaining({
            internal_void: 'succeeded',
            refund_required: false,
            refund_state: 'not_required',
            reason_code: 'UNPAID_INTERNAL_VOID',
            refund_amount: 0
        }));
    });

    it('requires a cash refund and drawer evidence for paid cash', () => {
        expect(resolvePosVoidFinancialOutcome({
            payment_status: 'paid',
            payment_type: 'cash',
            total_amount: 125
        })).toEqual(expect.objectContaining({
            refund_required: true,
            refund_state: 'manual_review_required',
            refund_method: 'cash',
            next_action: 'record_cash_refund_with_cash_drawer_event',
            reason_code: 'CASH_REFUND_REQUIRED',
            refund_amount: 125
        }));
    });

    it('requires external reversal evidence for merchant-owned digital tender', () => {
        expect(resolvePosVoidFinancialOutcome({
            payment_status: 'paid',
            payment_type: 'gcash',
            payment_provider: 'merchant_owned',
            total_amount: 250
        })).toEqual(expect.objectContaining({
            refund_required: true,
            refund_method: 'external_reversal',
            tender_ownership: 'merchant_owned',
            next_action: 'record_external_reversal_reference',
            reason_code: 'MERCHANT_OWNED_EXTERNAL_REVERSAL_REQUIRED'
        }));
    });

    it('does not infer provider ownership from a provider label alone', () => {
        expect(resolvePosVoidFinancialOutcome({
            payment_status: 'paid',
            payment_type: 'card',
            payment_provider: 'paymongo',
            total_amount: 300
        })).toEqual(expect.objectContaining({
            refund_required: true,
            refund_method: 'provider_refund',
            tender_ownership: 'unconfirmed',
            next_action: 'confirm_provider_ownership_and_refund',
            reason_code: 'PROVIDER_REFUND_REQUIRES_VERIFIED_OWNERSHIP'
        }));
    });

    it('requires allocation-level handling for split tender', () => {
        expect(resolvePosVoidFinancialOutcome({
            payment_status: 'paid',
            payment_type: 'cash',
            payment_breakdown: [
                { payment_type: 'cash', amount: 100 },
                { payment_type: 'card', amount: 50 }
            ],
            total_amount: 150
        })).toEqual(expect.objectContaining({
            refund_required: true,
            refund_method: 'split_tender',
            tender_ownership: 'mixed',
            next_action: 'reverse_each_successful_allocation',
            reason_code: 'SPLIT_TENDER_REFUND_REQUIRED'
        }));
    });

    it('does not require a second refund after a completed refund', () => {
        expect(resolvePosVoidFinancialOutcome({
            payment_status: 'refunded',
            payment_type: 'cash',
            total_amount: 125
        })).toEqual(expect.objectContaining({
            refund_required: false,
            refund_state: 'already_refunded',
            reason_code: 'REFUND_ALREADY_COMPLETED',
            refund_amount: 0
        }));
    });
});
