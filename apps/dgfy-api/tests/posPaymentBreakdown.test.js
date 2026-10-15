import { describe, expect, it } from '@jest/globals';
import {
    getPosCashPaymentAmount,
    normalizePosPaymentBreakdown,
    resolvePosPaymentCategory
} from '../src/modules/pos/utils/paymentBreakdown.js';
import {
    aggregateDeliveryProviderBreakdown,
    assertDeliveryProviderBreakdown,
    normalizeDeliveryProviderBreakdown
} from '../src/modules/pos/utils/deliveryProviderBreakdown.js';
import {
    buildReceiptLines,
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
                post_close_void_transaction_count: 1,
                post_close_void_amount: 125,
                payment_breakdown: paymentBreakdown
            }
        });
        const zReadingLines = buildZReadingLines({
            z_reading: {
                generated_at: '2026-08-19T12:00:00.000Z',
                reconciliation: {
                    status: 'matched',
                    report_recognized_sales: 1050,
                    z_total_amount: 1050,
                    variance: 0,
                    report_refunds_voids: 20,
                    report_adjustment_amount: 0,
                    evaluated_at: '2026-08-19T12:01:00.000Z'
                },
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
        expect(shiftLines).toContainEqual(expect.stringContaining('Transactions'));
        expect(shiftLines).toContainEqual(expect.stringContaining('Subtotal'));
        expect(shiftLines).toContainEqual(expect.stringContaining('Discounts'));
        expect(shiftLines).toContainEqual(expect.stringContaining('VAT'));
        expect(shiftLines).toContainEqual(expect.stringContaining('POS voids'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Transactions'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Subtotal'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Discounts'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('VAT'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Total sales'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('POS voids'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Generated:'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('2026'));
        expect(zReadingLines).toContain('REPORT RECONCILIATION');
        expect(zReadingLines).toContainEqual(expect.stringContaining('MATCHED'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Report recognized'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Difference'));
        expect(zReadingLines).toContainEqual(expect.stringContaining('Checked'));
        expect(zReadingLines).toContain('Provider refunds are reconciled separately.');
        expect(zReadingLines).not.toContainEqual(expect.stringContaining('Lifetime total'));
    });

    it('prints delivery provider allocations on the physical receipt path', () => {
        const receiptLines = buildReceiptLines({
            business: { name: 'Test Kitchen' },
            transaction: {
                invoice_number: 'INV-001',
                subtotal_amount: 270,
                vat_amount: 0,
                total_amount: 270,
                delivery_provider_breakdown: [
                    { provider_type: 'grab', amount: 180 },
                    { provider_type: 'other', provider_name: 'Maxim', amount: 90 }
                ],
                lines: []
            },
            receipt_contract: { document_type: 'non_fiscal_slip', version: 'test' }
        });

        expect(receiptLines).toContain('DELIVERY PROVIDER BREAKDOWN');
        expect(receiptLines).toContainEqual(expect.stringContaining('Grab'));
        expect(receiptLines).toContainEqual(expect.stringContaining('Maxim (Other)'));
    });
});

describe('POS delivery provider payment breakdown', () => {
    it('validates one delivery provider against the server-calculated transaction total', () => {
        expect(assertDeliveryProviderBreakdown({
            orderMethod: 'delivery',
            totalAmount: 270,
            entries: [{ provider_type: 'grab', amount: 270 }]
        })).toEqual([
            { provider_type: 'grab', provider_name: null, amount: 270, display_label: 'Grab' }
        ]);
    });

    it('rejects multiple providers, missing Other names, duplicate provider types, and mismatched totals', () => {
        expect(() => normalizeDeliveryProviderBreakdown([
            { provider_type: 'other', amount: 100 }
        ])).toThrow('require a provider name');
        expect(() => assertDeliveryProviderBreakdown({
            orderMethod: 'delivery',
            totalAmount: 270,
            entries: [
                { provider_type: 'grab', amount: 180 },
                { provider_type: 'other', provider_name: 'Maxim', amount: 90 }
            ]
        })).toThrow('exactly one delivery provider');
        expect(() => normalizeDeliveryProviderBreakdown([
            { provider_type: 'grab', amount: 100 },
            { provider_type: 'grab', amount: 50 }
        ])).toThrow('only one Grab');
        expect(() => assertDeliveryProviderBreakdown({
            orderMethod: 'delivery',
            totalAmount: 150,
            entries: [{ provider_type: 'grab', amount: 100 }]
        })).toThrow('must equal the transaction total');
        expect(() => assertDeliveryProviderBreakdown({
            orderMethod: 'dine_in',
            totalAmount: 100,
            entries: [{ provider_type: 'grab', amount: 100 }]
        })).toThrow('allowed only for Delivery');
    });

    it('aggregates the same provider across transactions by canonical provider name', () => {
        const result = aggregateDeliveryProviderBreakdown([
            {
                transaction_id: 101,
                delivery_provider_breakdown: [{ provider_type: 'grab', amount: 100 }]
            },
            {
                transaction_id: 101,
                delivery_provider_breakdown: [{ provider_type: 'grab', amount: 100 }]
            },
            {
                transaction_id: 102,
                delivery_provider_breakdown: [{ provider_type: 'grab', amount: 50 }]
            },
            {
                transaction_id: 103,
                delivery_provider_breakdown: [{ provider_type: 'other', provider_name: ' maxim ', amount: 90 }]
            },
            {
                transaction_id: 104,
                delivery_provider_breakdown: [{ provider_type: 'other', provider_name: 'Maxim', amount: 10 }]
            }
        ]);

        expect(result).toEqual([
            {
                provider_type: 'grab',
                provider_name: null,
                display_label: 'Grab',
                transaction_count: 2,
                amount: 150
            },
            {
                provider_type: 'other',
                provider_name: 'maxim',
                display_label: 'maxim (Other)',
                transaction_count: 2,
                amount: 100
            }
        ]);
    });
});
