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
    transaction_count: 6,
    total_amount: 705,
    payment_breakdown: paymentBreakdown,
    void_transaction_count: 2,
    void_amount: 125,
    post_close_void_transaction_count: 1,
    post_close_void_amount: 125
};

describe('close-report payment breakdown rendering', () => {
    it('renders the normalized method labels in both browser-print reports', () => {
        const shiftMarkup = renderToStaticMarkup(
            <ShiftCloseSummaryPrintView report={{ sales_summary: salesSummary }} businessSettings={businessSettings} />
        );
        const zReadingMarkup = renderToStaticMarkup(
            <ZReadingPrintView
                report={{
                    summary: salesSummary,
                    generated_at: '2026-08-19T12:00:00.000Z',
                    z_reading_reconciliation: {
                        status: 'matched',
                        report_recognized_sales: 1050,
                        z_total_amount: 1050,
                        variance: 0,
                        report_refunds_voids: 20,
                        report_adjustment_amount: 0,
                        evaluated_at: '2026-08-19T12:01:00.000Z'
                    }
                }}
                businessSettings={businessSettings}
            />
        );

        [shiftMarkup, zReadingMarkup].forEach((markup) => {
            expect(markup).toContain('Acme Corporation');
            expect(markup).toContain('acme-logo.png');
            expect(markup).toContain('Cash');
            expect(markup).toContain('GCash');
            expect(markup).toContain('Card (Credit/Debit)');
            expect(markup).toContain('Employee Credit');
            expect(markup).toContain('Other');
        });
        expect(shiftMarkup).toContain('Payment methods');
        expect(shiftMarkup).toContain('Overall sales');
        expect(shiftMarkup).toContain('₱705.00');
        expect(shiftMarkup).toContain('>6</span>');
        expect(shiftMarkup).not.toContain('Maya');
        expect(zReadingMarkup).toContain('Payment method breakdown');
        expect(zReadingMarkup).toContain('Maya (0)');
        expect(zReadingMarkup).toContain('Cash (2)');
        expect(zReadingMarkup).toContain('GCash (1)');
        expect(zReadingMarkup).toContain('Card (Credit/Debit) (1)');
        expect(zReadingMarkup).toContain('Employee Credit (1)');
        expect(zReadingMarkup).toContain('Other (1)');
        expect(shiftMarkup).toContain('Transactions');
        expect(shiftMarkup).not.toContain('Subtotal');
        expect(shiftMarkup).not.toContain('Discounts');
        expect(shiftMarkup).not.toContain('VAT');
        expect(shiftMarkup).not.toContain('Total sales (excluding opening cash)');
        expect(shiftMarkup).not.toContain('POS voids');
        expect(shiftMarkup).toContain('Opening/petty cash');
        expect(shiftMarkup).toContain('Expected cash in drawer');
        expect(zReadingMarkup).toContain('Transactions');
        expect(zReadingMarkup).toContain('Subtotal');
        expect(zReadingMarkup).toContain('Discounts');
        expect(zReadingMarkup).toContain('VAT');
        expect(zReadingMarkup).toContain('Overall total');
        expect(zReadingMarkup).toContain('POS voids (2)');
        expect(zReadingMarkup).toContain('Generated:');
        expect(zReadingMarkup).toContain('2026');
        expect(zReadingMarkup).toContain('Report reconciliation');
        expect(zReadingMarkup).toContain('MATCHED');
        expect(zReadingMarkup).toContain('Report recognized sales');
        expect(zReadingMarkup).toContain('Checked');
        expect(zReadingMarkup).not.toContain('Lifetime total');
    });

    it('uses the same method labels for iMin shift-summary and Z-reading text', () => {
        const shiftText = formatIminShiftSummaryText({
            shiftSummary: { sales_summary: salesSummary },
            businessSettings
        });
        const zReadingText = formatIminZReadingText({
            zReading: {
                z_reading: {
                    summary: salesSummary,
                    generated_at: '2026-08-19T12:00:00.000Z',
                    reconciliation: {
                        status: 'matched',
                        report_recognized_sales: 1050,
                        z_total_amount: 1050,
                        variance: 0,
                        report_refunds_voids: 20,
                        report_adjustment_amount: 0,
                        evaluated_at: '2026-08-19T12:01:00.000Z'
                    }
                }
            },
            businessSettings
        });
        [shiftText, zReadingText].forEach((text) => {
            expect(text).toContain('Acme Corporation');
            expect(text).toContain('Cash (2)');
            expect(text).toContain('GCash (1)');
            expect(text).toContain('Card (Credit/Debit) (1)');
            expect(text).toContain('Employee Credit (1)');
            expect(text).toContain('Other (1)');
        });
        expect(shiftText).toContain('SALES SUMMARY');
        expect(shiftText).toContain('Overall sales');
        expect(shiftText).toContain('705.00');
        expect(shiftText).toContain('Transactions');
        expect(shiftText).not.toContain('Maya (0)');
        expect(shiftText).not.toContain('Subtotal');
        expect(shiftText).not.toContain('Discounts');
        expect(shiftText).not.toContain('VAT');
        expect(shiftText).not.toContain('Total sales');
        expect(shiftText).not.toContain('POS voids');
        expect(zReadingText).toContain('Transactions');
        expect(zReadingText).toContain('Subtotal');
        expect(zReadingText).toContain('Discounts');
        expect(zReadingText).toContain('VAT');
        expect(zReadingText).toContain('Overall total');
        expect(zReadingText).toContain('POS voids (2)');
        expect(zReadingText).toContain('Generated:');
        expect(zReadingText).toContain('2026');
        expect(zReadingText).toContain('REPORT RECONCILIATION');
        expect(zReadingText).toContain('MATCHED');
        expect(zReadingText).toContain('Report recognized');
        expect(zReadingText).toContain('Difference');
        expect(zReadingText).toContain('Checked');
        expect(zReadingText).toContain('Provider refunds reconciled separately.');
        expect(zReadingText).not.toContain('Lifetime total');
    });

    it('formats iMin shift summaries within the selected 57mm paper width', () => {
        const shiftText = formatIminShiftSummaryText({
            shiftSummary: { sales_summary: salesSummary },
            businessSettings,
            paperWidth: '57mm'
        });

        expect(shiftText.split('\n').every((line) => line.length <= 32)).toBe(true);
    });

    it('keeps missing or invalid generation times readable without breaking the report', () => {
        const markup = renderToStaticMarkup(
            <ZReadingPrintView report={{ generated_at: 'not-a-timestamp' }} />
        );
        const text = formatIminZReadingText({
            zReading: { z_reading: { generated_at: 'not-a-timestamp' } }
        });

        expect(markup).toContain('Generated: -');
        expect(text).toContain('Generated: -');
    });

    it('offers the Receipt Preview paper-width choices for Z-reading output', () => {
        const markup = renderToStaticMarkup(
            <ZReadingPrintView
                report={{ generated_at: '2026-09-25T12:00:00.000Z' }}
                paperWidth="57mm"
            />
        );

        expect(markup).toContain('data-paper-width="57mm"');
        expect(markup).toContain('data-testid="pos-z-reading-paper-width"');
        expect(markup).toContain('80mm (3 1/8 in)');
        expect(markup).toContain('57mm (2 1/4 in)');
    });

    it('applies the selected paper width to the current-shift browser print view', () => {
        const markup = renderToStaticMarkup(
            <ShiftCloseSummaryPrintView
                report={{ generated_at: '2026-09-25T12:00:00.000Z' }}
                paperWidth="57mm"
                isPrinterAvailable={false}
            />
        );

        expect(markup).toContain('data-paper-width="57mm"');
        expect(markup).toContain('style="--pos-shift-summary-paper-width:57mm"');
        expect(markup).toContain('data-testid="pos-shift-summary-paper-width"');
        expect(markup).toContain('80mm (3 1/8 in)');
        expect(markup).toContain('57mm (2 1/4 in)');
        expect(markup).toContain('No native POS printer detected.');
        expect(markup).toContain('>Print</button>');
        expect(markup).not.toContain('print:max-w-[80mm]');
    });

    it('formats iMin reports to the selected paper width', () => {
        const report = {
            shift: {
                business_date: '2026-09-25',
                terminal_id: 'COUNTER-01',
                pos_terminal_shift_id: 8
            },
            cash_summary: {
                opening_float_amount: 1000,
                cash_sales_amount: 123,
                cash_in_total: 25,
                cash_out_total: 10,
                expected_cash_amount: 1138,
                closing_cash_amount: 1138,
                cash_variance_amount: 0
            },
            sales_summary: {
                payment_breakdown: paymentBreakdown,
                delivery_provider_breakdown: [
                    { provider_type: 'foodpanda', transaction_count: 2, amount: 350 }
                ]
            }
        };

        const narrowText = formatIminShiftSummaryText({
            shiftSummary: report,
            businessSettings,
            paperWidth: '57mm'
        });
        const wideText = formatIminShiftSummaryText({
            shiftSummary: report,
            businessSettings,
            paperWidth: '80mm'
        });

        expect(narrowText.split('\n').every((row) => row.length <= 32)).toBe(true);
        expect(wideText).toContain('-'.repeat(42));
        expect(narrowText).toContain('-'.repeat(32));
        expect(narrowText).toContain('DELIVERY PROVIDERS');
        expect(narrowText).toContain('SALES SUMMARY');
        expect(narrowText).toContain('Overall sales');
        expect(narrowText).not.toContain('Maya (0)');
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

        expect(markup).toMatch(/Closing cash<\/span><span[^>]*>Not closed<\/span>/);
        expect(markup).toMatch(/Variance<\/span><span[^>]*>Pending close<\/span>/);
        expect(markup).not.toMatch(/Closing cash<\/span><span[^>]*>₱0\.00<\/span>/);
        expect(markup).not.toMatch(/Variance<\/span><span[^>]*>₱0\.00<\/span>/);
    });
});
