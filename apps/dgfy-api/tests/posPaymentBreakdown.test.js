import { describe, expect, it } from '@jest/globals';
import {
    getPosCashPaymentAmount,
    normalizePosPaymentBreakdown,
    resolvePosPaymentCategory
} from '../src/modules/pos/utils/paymentBreakdown.js';
import {
    buildShiftSummaryLines,
    buildZReadingLines
} from '../device-bridge/receipts/receiptFormatter.js';

describe('POS close-report payment breakdown', () => {
    const rawBreakdown = [
        { payment_type: 'cash', count: 1, amount: 100 },
        { payment_type: 'gcash', count: 2, amount: 200 },
        { payment_type: 'maya', count: 1, amount: 150 },
        { payment_type: 'card', count: 1, amount: 300 },
        { payment_type: 'employee_credit', count: 1, amount: 75 },
        { payment_type: 'qrph', count: 1, amount: 80 },
        { payment_type: 'bank_transfer', count: 2, amount: 120 },
        { payment_type: 'future_wallet', count: 1, amount: 25 }
    ];

    it('normalizes every supported tender in a stable order and preserves the recognized total', () => {
        const result = normalizePosPaymentBreakdown(rawBreakdown);

        expect(result).toEqual([
            { payment_type: 'cash', payment_label: 'Cash', count: 1, amount: 100 },
            { payment_type: 'gcash', payment_label: 'GCash', count: 2, amount: 200 },
            { payment_type: 'maya', payment_label: 'Maya', count: 1, amount: 150 },
            { payment_type: 'card', payment_label: 'Card (Credit/Debit)', count: 1, amount: 300 },
            { payment_type: 'bank_transfer', payment_label: 'Bank Transfer', count: 2, amount: 120 },
            { payment_type: 'employee_credit', payment_label: 'Employee Credit', count: 1, amount: 75 },
            { payment_type: 'other', payment_label: 'Other', count: 2, amount: 105 }
        ]);
        expect(result.reduce((total, entry) => total + entry.amount, 0)).toBe(1050);
    });

    it('keeps card tenders separate from employee account credit', () => {
        expect(resolvePosPaymentCategory('credit_card')).toBe('card');
        expect(resolvePosPaymentCategory('debit_card')).toBe('card');
        expect(resolvePosPaymentCategory('employee_credit')).toBe('employee_credit');
    });

    it('derives cash sales from the normalized payment breakdown', () => {
        expect(getPosCashPaymentAmount(rawBreakdown)).toBe(100);
        expect(getPosCashPaymentAmount([{ payment_type: 'gcash', amount: 250 }])).toBe(0);
    });

    it('includes zero-value rows and remains stable when normalizing an existing snapshot', () => {
        const firstPass = normalizePosPaymentBreakdown([
            { payment_type: 'cash', count: 2, amount: 250 }
        ]);

        expect(firstPass).toHaveLength(7);
        expect(firstPass[1]).toEqual({
            payment_type: 'gcash',
            payment_label: 'GCash',
            count: 0,
            amount: 0
        });
        expect(normalizePosPaymentBreakdown(firstPass)).toEqual(firstPass);
    });

    it('uses authoritative labels in LAN shift-summary and Z-reading print output', () => {
        const paymentBreakdown = normalizePosPaymentBreakdown(rawBreakdown);
        const shiftLines = buildShiftSummaryLines({
            sales_summary: {
                transaction_count: 10,
                total_amount: 1050,
                void_transaction_count: 2,
                void_amount: 125,
                payment_breakdown: paymentBreakdown
            }
        });
        const zReadingLines = buildZReadingLines({
            z_reading: {
                summary: {
                    transaction_count: 10,
                    total_amount: 1050,
                    void_transaction_count: 2,
                    void_amount: 125,
                    payment_breakdown: paymentBreakdown
                }
            }
        });

        expect(shiftLines).toContainEqual(expect.stringContaining('Card (Credit/Debit) (1)'));
        expect(shiftLines).toContainEqual(expect.stringContaining('Bank Transfer (2)'));
        expect(shiftLines).toContainEqual(expect.stringContaining('Employee Credit (1)'));
        expect(shiftLines).toContainEqual(expect.stringContaining('Other (2)'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('GCash (2)'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Maya (1)'));
        expect(shiftLines).toContainEqual(expect.stringContaining('POS voids'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('POS voids'));
        expect(zReadingLines).toContain('Provider refunds are reconciled separately.');
    });
});
