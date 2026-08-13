import { describe, expect, it } from 'vitest';
import {
    getPaymentStatusClassName,
    getPaymentStatusLabel,
    getReceiptPrintStatusClassName,
    getReceiptPrintStatusLabel
} from '../utils/posHistoryStatus.js';

describe('POS history payment and receipt status presentation', () => {
    it('shows payment status independently from the payment method', () => {
        expect(getPaymentStatusLabel('paid')).toBe('Paid');
        expect(getPaymentStatusLabel('unpaid')).toBe('Unpaid');
        expect(getPaymentStatusClassName('paid')).toContain('text-emerald-700');
    });

    it('does not treat a paid order as a printed receipt', () => {
        expect(getReceiptPrintStatusLabel('pending')).toBe('Not Printed');
        expect(getReceiptPrintStatusLabel(undefined)).toBe('Not Printed');
        expect(getReceiptPrintStatusLabel('printed')).toBe('Printed');
        expect(getReceiptPrintStatusLabel('failed')).toBe('Failed');
        expect(getReceiptPrintStatusClassName('pending')).toContain('text-amber-700');
    });
});
