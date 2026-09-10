import { describe, expect, it } from 'vitest';
import {
    formatPosVoidTimestamp,
    isVoidedPosTransaction,
    resolvePosVoidActorLabel,
    resolvePosVoidFinancialOutcome,
    resolvePosVoidFinancialOutcomeAmount,
    resolvePosVoidFinancialOutcomeLabel,
    resolvePosVoidReason
} from '../utils/posVoidAudit.js';

describe('POS void audit display helpers', () => {
    it('recognizes only voided transaction status', () => {
        expect(isVoidedPosTransaction({ status: 'voided' })).toBe(true);
        expect(isVoidedPosTransaction({ status: 'completed' })).toBe(false);
    });

    it('prefers the voiding user name and falls back to the stored user id', () => {
        expect(resolvePosVoidActorLabel({ voidedByUser: { username: 'April' }, voided_by: 7 })).toBe('April');
        expect(resolvePosVoidActorLabel({ voided_by: 7 })).toBe('User #7');
        expect(resolvePosVoidActorLabel({})).toBe('Unknown user');
    });

    it('shows a safe fallback when audit reason or timestamp is missing', () => {
        expect(resolvePosVoidReason({})).toBe('No reason recorded');
        expect(formatPosVoidTimestamp(null)).toBe('Unknown time');
        expect(formatPosVoidTimestamp('not-a-date')).toBe('Unknown time');
    });

    it('shows server-owned paid-cash follow-up without claiming the customer was refunded', () => {
        const transaction = {
            financial_outcome: {
                refund_required: true,
                refund_state: 'manual_review_required',
                next_action: 'record_cash_refund_with_cash_drawer_event',
                refund_amount: 125,
                currency: 'PHP'
            }
        };

        expect(resolvePosVoidFinancialOutcome(transaction)).toEqual(transaction.financial_outcome);
        expect(resolvePosVoidFinancialOutcomeLabel(transaction)).toBe(
            'Cash refund and a linked cash-drawer event are still required.'
        );
        expect(resolvePosVoidFinancialOutcomeAmount(transaction)).toBe('₱125.00');
    });

    it('falls back to the latest adjustment outcome and handles no-refund outcomes', () => {
        const transaction = {
            adjustments: [
                { financial_outcome: { refund_required: true, next_action: 'manual_review' } },
                { financial_outcome: { refund_required: false, reason_code: 'UNPAID_INTERNAL_VOID' } }
            ]
        };

        expect(resolvePosVoidFinancialOutcomeLabel(transaction)).toBe(
            'No customer refund is required. This is an internal POS void only.'
        );
        expect(resolvePosVoidFinancialOutcomeAmount(transaction)).toBeNull();
    });
});
