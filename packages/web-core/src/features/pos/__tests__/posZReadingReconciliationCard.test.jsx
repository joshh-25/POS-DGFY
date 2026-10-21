import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  buildDailySalesCheckCsv,
  buildDailySalesCheckPrintHtml,
  buildZReadingHistoryCsv,
  buildZReadingHistoryPrintHtml
} from '../components/posZReadingReconciliationExports.js';
import {
  ZReadingReconciliationCard
} from '../components/PosReportsAnalyticsWorkspace.jsx';

describe('Daily Sales Check reconciliation layout', () => {
  it('exports the selected-day reconciliation summary as safe CSV and printable HTML', () => {
    const data = {
      status: 'not_comparable',
      reading_identifier: '=HYPERLINK("https://example.com")',
      message: '<img src=x onerror=alert(1)>',
      report_recognized_sales: 125.5,
      z_total_amount: null,
      variance: null,
      report_net_sales: 112.5,
      z_void_transaction_count: 1,
      z_void_amount: 10,
      report_refunds_voids: 5,
      report_adjustment_amount: 0,
      generated_at: null,
      evaluated_at: null
    };

    const formatOptions = {
      businessDate: '2026-09-30',
      currencySymbol: '₱',
      formatMoney: (value, symbol) => `${symbol}${Number(value).toFixed(2)}`,
      formatDateTime: (value) => String(value)
    };
    const csv = buildDailySalesCheckCsv(data, formatOptions);
    const printHtml = buildDailySalesCheckPrintHtml(data, formatOptions);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Business date","2026-09-30"');
    expect(csv).toContain('"Z-reading reference","\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('"Difference","—"');
    expect(printHtml).toContain('Daily Sales Check');
    expect(printHtml).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(printHtml).not.toContain('<img src=x');
  });

  it('exports the saved Z-reading payment breakdown in CSV and printable HTML', () => {
    const data = {
      status: 'matched',
      snapshot_persisted: true,
      business_date: '2026-09-29',
      reading_identifier: 'ZR-20260929-00000001',
      report_recognized_sales: 125.5,
      z_total_amount: 125.5,
      variance: 0,
      z_payment_breakdown: [
        { payment_type: 'cash', payment_label: 'Cash', count: 2, amount: 80 },
        { payment_type: 'gcash', payment_label: 'GCash', count: 1, amount: 45.5 }
      ],
      report_payment_breakdown: [
        { payment_method: 'Cash', gross_sales: 80, net_sales: 70 }
      ],
      report_voided_refunded_transactions: 1,
      report_refunds_voids: 10,
      report_adjustment_amount: 20,
      report_adjustment_rows: [
        { adjustment_type: 'cash_refund', tender_type: 'cash', status: 'succeeded', amount: 10 }
      ]
    };
    const options = {
      currencySymbol: '₱',
      formatMoney: (value, symbol) => `${symbol}${Number(value).toFixed(2)}`,
      formatDateTime: (value) => String(value)
    };

    const csv = buildDailySalesCheckCsv(data, options);
    const printHtml = buildDailySalesCheckPrintHtml(data, options);

    expect(csv).toContain('"Payment breakdown (saved Z-reading)",""');
    expect(csv).toContain('"Cash payments before refunds","₱80.00"');
    expect(csv).toContain('"Cash refunds / voids","−₱10.00"');
    expect(csv).toContain('"Net cash sales","₱70.00"');
    expect(csv).toContain('"Audit adjustment records","₱20.00"');
    expect(csv).toContain('"GCash","₱45.50 · 1 payment"');
    expect(printHtml).toContain('Payment breakdown (saved Z-reading)');
    expect(printHtml).toContain('Cash refunds / voids');
    expect(printHtml).toContain('₱70.00');
    expect(printHtml).toContain('Audit reference; not an additional deduction.');
    expect(printHtml).toContain('GCash');
    expect(printHtml).toContain('₱45.50 · 1 payment');
  });

  it('exports all supplied saved Z-readings with cashier and terminal attribution safely', () => {
    const rows = [{
      business_date: '2026-09-29',
      reading_identifier: '=HYPERLINK("https://example.com")',
      closed_from_terminal_id: 'COUNTER-01',
      closed_by_user_id: 7,
      closed_by_display_name: 'Len2',
      generated_at: '2026-09-29T05:08:00.000Z',
      summary: { transaction_count: 12, total_amount: 432 }
    }, {
      business_date: '2026-09-28',
      reading_identifier: 'ZR-20260928-00000001',
      closed_from_terminal_id: 'COUNTER-02',
      closed_by_display_name: '=CMD()',
      summary: { transaction_count: 1, total_amount: 12 }
    }];
    const formatMoney = (value, symbol) => `${symbol}${Number(value).toFixed(2)}`;
    const csv = buildZReadingHistoryCsv(rows, { currencySymbol: '₱', formatMoney });
    const printHtml = buildZReadingHistoryPrintHtml(rows, {
      currencySymbol: '₱',
      formatMoney,
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
      search: '<script>'
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Business date","Z-reading reference","Terminal","Closed by"');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
    expect(csv).toContain('"\'=CMD()"');
    expect(csv).toContain('"₱432.00"');
    expect(printHtml).toContain('Saved Z-reading history');
    expect(printHtml).toContain('COUNTER-01');
    expect(printHtml).toContain('Len2');
    expect(printHtml).toContain('=CMD()');
    expect(printHtml).not.toContain('<script>');
    expect(printHtml).toContain('&lt;script&gt;');
  });

  it('shows a compact status header, four metric cards, activity, and reading timestamps', () => {
    const markup = renderToStaticMarkup(
      <ZReadingReconciliationCard
        currencySymbol="₱"
        onPrint={() => {}}
        onExport={() => {}}
        data={{
          status: 'matched',
          business_date: '2026-09-29',
          reading_identifier: 'ZR-20260929-00000001',
          message: 'Report recognized sales match the immutable Z-reading total.',
          report_recognized_sales: 125.5,
          z_total_amount: 125.5,
          variance: 0,
          report_net_sales: 112.5,
          z_void_transaction_count: 1,
          z_void_amount: 10,
          report_refunds_voids: 5,
          report_adjustment_amount: 0,
          snapshot_persisted: true,
          z_payment_breakdown: [
            { payment_type: 'cash', payment_label: 'Cash', count: 2, amount: 80 },
            { payment_type: 'gcash', payment_label: 'GCash', count: 1, amount: 45.5 }
          ],
          report_payment_breakdown: [
            { payment_method: 'Cash', gross_sales: 80, net_sales: 70 }
          ],
          report_voided_refunded_transactions: 1,
          report_adjustment_rows: [
            { adjustment_type: 'cash_refund', tender_type: 'cash', status: 'succeeded', amount: 10 }
          ],
          generated_at: '2026-09-29T05:08:00.000Z',
          evaluated_at: '2026-09-29T06:54:00.000Z'
        }}
      />
    );

    const outerSectionClass = markup.match(/^<section class="([^"]+)"/)?.[1] || '';
    expect(outerSectionClass.split(/\s+/)).toEqual(['min-w-0', 'max-w-full']);
    expect(markup).toContain('aria-label="Daily Sales Check actions"');
    expect(markup).toContain('flex w-full flex-col gap-3 min-[360px]:w-auto min-[360px]:flex-row min-[768px]:gap-2');
    expect(markup).toContain('Print / Save PDF');
    expect(markup).toContain('Export CSV');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Z-reading reconciliation');
    expect(markup).toContain('ZR-20260929-00000001');
    expect(markup).toContain('Matched');
    expect(markup).toContain('₱125.50');
    expect(markup).toContain('₱0.00');
    expect(markup).toContain('₱112.50');
    expect(markup.indexOf('Report recognized sales')).toBeLessThan(markup.indexOf('Z-reading total'));
    expect(markup.indexOf('Z-reading total')).toBeLessThan(markup.indexOf('Difference'));
    expect(markup.indexOf('Difference')).toBeLessThan(markup.indexOf('Report net sales'));
    expect(markup).toContain('Different metric; includes line-level discounts/refunds');
    expect(markup).toContain('Refunds / voids deducted from sales');
    expect(markup).toContain('Void/refund activity');
    expect(markup).toContain('Cash payments before refunds');
    expect(markup).toContain('Cash refunds / voids');
    expect(markup).toContain('Net cash sales');
    expect(markup).toContain('₱70.00');
    expect(markup).toContain('Audit adjustment records');
    expect(markup).toContain('Audit reference; not an additional deduction.');
    expect(markup).toContain('Payment breakdown');
    expect(markup).toContain('Payment method amounts are before refunds and voids.');
    expect(markup).toContain('From the saved Z-reading snapshot');
    expect(markup).toContain('Cash');
    expect(markup).toContain('GCash');
    expect(markup).toContain('₱45.50 · 1 payment');
    expect(markup).toContain('Additional Activity');
    expect(markup).toContain('Date &amp; time generated');
    expect(markup).toContain('Checked at');
    expect(markup).toContain('xl:border-l xl:border-slate-200 xl:pl-4');
    expect(markup).toContain('lg:grid-cols-4');
  });

  it('does not turn missing snapshot amounts into zero when a reading has not been generated', () => {
    const markup = renderToStaticMarkup(
      <ZReadingReconciliationCard
        currencySymbol="₱"
        data={{
          status: 'not_generated',
          business_date: '2026-09-29',
          message: 'No Z-reading has been generated for this business date.',
          report_recognized_sales: 100,
          z_total_amount: null,
          variance: null,
          report_net_sales: 95,
          z_void_transaction_count: null,
          z_void_amount: null,
          report_refunds_voids: null,
          report_adjustment_amount: null,
          generated_at: null,
          evaluated_at: null
        }}
      />
    );

    expect(markup).toContain('Not generated');
    expect(markup).toContain('₱100.00');
    expect(markup).toContain('₱95.00');
    expect(markup).toContain('No immutable snapshot yet');
    expect(markup).toContain('>—</dd>');
    expect(markup).not.toContain('₱0.00');
    expect(markup).not.toContain('Payment breakdown');
  });

  it('distinguishes a real variance from a scope that cannot be compared', () => {
    const base = {
      report_recognized_sales: 125,
      z_total_amount: 120,
      report_net_sales: 110
    };
    const varianceMarkup = renderToStaticMarkup(
      <ZReadingReconciliationCard currencySymbol="₱" data={{ ...base, status: 'variance', variance: 5 }} />
    );
    const unavailableMarkup = renderToStaticMarkup(
      <ZReadingReconciliationCard
        currencySymbol="₱"
        data={{ ...base, status: 'not_comparable', variance: 5, message: 'Clear cashier and terminal filters to compare the full day.' }}
      />
    );

    expect(varianceMarkup).toContain('Variance found');
    expect(varianceMarkup).toContain('₱5.00');
    expect(unavailableMarkup).toContain('Comparison unavailable');
    expect(unavailableMarkup).toContain('Clear cashier and terminal filters to compare the full day.');
    expect(unavailableMarkup).not.toContain('₱5.00');
  });
});
