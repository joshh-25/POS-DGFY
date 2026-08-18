import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ShiftCloseSummaryPrintView from '../components/ShiftCloseSummaryPrintView.jsx';
import ZReadingPrintView from '../components/ZReadingPrintView.jsx';
import {
    formatIminShiftSummaryText,
    formatIminZReadingText
} from '../utils/iminHardwareBridge.js';

const paymentBreakdown = [
    { payment_type: 'cash', payment_label: 'Cash', count: 2, amount: 200 },
    { payment_type: 'gcash', payment_label: 'GCash', count: 1, amount: 100 },
    { payment_type: 'maya', payment_label: 'Maya', count: 0, amount: 0 },
    { payment_type: 'card', payment_label: 'Card (Credit/Debit)', count: 1, amount: 250 },
    { payment_type: 'employee_credit', payment_label: 'Employee Credit', count: 1, amount: 75 },
    { payment_type: 'other', payment_label: 'Other', count: 1, amount: 80 }
];
const businessSettings = {
    pos_business_name: 'Acme Corporation',
    storefront_profile_image_url: '/uploads/acme-logo.png'
};
const salesSummary = {
    payment_breakdown: paymentBreakdown,
    void_transaction_count: 2,
    void_amount: 125
};

describe('close-report payment breakdown rendering', () => {
    it('renders the normalized method labels in both browser-print reports', () => {
        const shiftMarkup = renderToStaticMarkup(
            <ShiftCloseSummaryPrintView report={{ sales_summary: salesSummary }} businessSettings={businessSettings} />
        );
        const zReadingMarkup = renderToStaticMarkup(
            <ZReadingPrintView report={{ summary: salesSummary }} businessSettings={businessSettings} />
        );

        [shiftMarkup, zReadingMarkup].forEach((markup) => {
            expect(markup).toContain('Acme Corporation');
            expect(markup).toContain('acme-logo.png');
            expect(markup).toContain('Payment method breakdown');
            expect(markup).toContain('POS voids (2)');
            expect(markup).toContain('Cash (2)');
            expect(markup).toContain('GCash (1)');
            expect(markup).toContain('Maya (0)');
            expect(markup).toContain('Card (Credit/Debit) (1)');
            expect(markup).toContain('Employee Credit (1)');
            expect(markup).toContain('Other (1)');
        });
        expect(shiftMarkup).toContain('Total sales (excluding opening cash)');
        expect(shiftMarkup).toContain('Opening/petty cash');
        expect(shiftMarkup).toContain('Expected cash in drawer');
    });

    it('uses the same method labels for iMin shift-summary and Z-reading text', () => {
        const shiftText = formatIminShiftSummaryText({
            shiftSummary: { sales_summary: salesSummary },
            businessSettings
        });
        const zReadingText = formatIminZReadingText({
            zReading: { z_reading: { summary: salesSummary } },
            businessSettings
        });

        [shiftText, zReadingText].forEach((text) => {
            expect(text).toContain('Acme Corporation');
            expect(text).toContain('POS voids (2)');
            expect(text).toContain('Cash (2)');
            expect(text).toContain('GCash (1)');
            expect(text).toContain('Maya (0)');
            expect(text).toContain('Card (Credit/Debit) (1)');
            expect(text).toContain('Employee Credit (1)');
            expect(text).toContain('Other (1)');
        });
        expect(zReadingText).toContain('Provider refunds reconciled separately.');
    });

    it('does not show zero closing cash or variance before an open shift is closed', () => {
        const markup = renderToStaticMarkup(
            <ShiftCloseSummaryPrintView
                report={{
                    shift: { status: 'open' },
                    cash_summary: {
                        opening_float_amount: 1000,
                        cash_sales_amount: 123,
                        expected_cash_amount: 1123,
                        closing_cash_amount: null,
                        cash_variance_amount: null
                    },
                    sales_summary: {
                        transaction_count: 1,
                        total_amount: 123,
                        payment_breakdown: [{ payment_type: 'cash', count: 1, amount: 123 }]
                    }
                }}
            />
        );

        expect(markup).toContain('Closing cash</span><span class="whitespace-nowrap text-right tabular-nums">Not closed');
        expect(markup).toContain('Variance</span><span class="whitespace-nowrap text-right tabular-nums">Pending close');
        expect(markup).not.toContain('Closing cash</span><span class="whitespace-nowrap text-right tabular-nums">PHP 0.00');
        expect(markup).not.toContain('Variance</span><span class="whitespace-nowrap text-right tabular-nums">PHP 0.00');
    });
});
