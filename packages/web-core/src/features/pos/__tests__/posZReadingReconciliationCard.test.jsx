// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDailySalesCheckCsv,
  buildDailySalesCheckPrintHtml,
  buildZReadingHistoryCsv,
  buildZReadingHistoryPrintHtml
} from '../components/posZReadingReconciliationExports.js';
import {
  ZReadingReconciliationCard
} from '../components/PosReportsAnalyticsWorkspace.jsx';

const renderMarkup = (element) => {
  const { container, unmount } = render(element);
  const markup = container.innerHTML;
  unmount();
  return markup;
};

afterEach(() => cleanup());

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
    const markup = renderMarkup(
      <ZReadingReconciliationCard
        currencySymbol="₱"
        onPrint={() => {}}
        onExport={() => {}}
        onHistory={() => {}}
        data={{
          status: 'matched',
          business_date: '2026-09-29',
          reading_identifier: 'ZR-20260929-00000001',
          message: 'Report recognized sales match the immutable Z-reading total.',
          report_recognized_sales: 3000,
          z_total_amount: 3000,
          variance: 0,
          report_net_sales: 1234567.89,
          z_void_transaction_count: 3000,
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
    expect(markup).toContain('aria-label="View Z-reading history"');
    expect(markup).toContain('flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0');
    expect(markup).toContain('aria-label="Print or save Daily Sales Check as PDF"');
    expect(markup).toContain('min-h-10 h-10 w-10 shrink-0 justify-center');
    expect(markup).toContain('sr-only min-[1200px]:not-sr-only">Print / Save PDF</span>');
    expect(markup).toContain('aria-label="Export Daily Sales Check as CSV"');
    expect(markup).toContain('sr-only min-[1200px]:not-sr-only">Export CSV</span>');
    expect(markup).toContain('History');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('Z-reading reconciliation');
    expect(markup).toContain('ZR-20260929-00000001');
    expect(markup).toContain('Matched');
    expect(markup).toContain('₱3,000.00');
    expect(markup).toContain('₱0.00');
    expect(markup).toContain('₱1,234,567.89');
    expect(markup).toContain('3,000 · ₱10.00');
    expect(markup).toContain('class="sr-only"');
    expect(markup).toContain('text-[10px] font-semibold leading-4 text-slate-600">Recognized sales</dt>');
    expect(markup.indexOf('Recognized sales')).toBeLessThan(markup.indexOf('Z-reading total'));
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
    expect(markup).toContain('Report refunds / voids');
    expect(markup).toContain('Report adjustments');
    expect(markup).toContain('Additional Activity');
    expect(markup).toContain('class="mt-3 min-w-0" aria-labelledby="daily-sales-additional-activity-heading"');
    expect(markup).toContain('Generated at');
    expect(markup).toContain('Checked at');
    expect(markup).toContain('class="mt-3 grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4"');
    expect(markup).toContain('text-[clamp(0.75rem,3.8vw,1rem)]');
    expect(markup).toContain('sm:h-11 sm:w-11');
    expect(markup).toContain('lg:grid-cols-5');
    expect(markup).toContain('aria-label="Additional Z-reading activity and timestamps"');
  });

  it('routes the History shortcut to the supplied existing history handler', () => {
    const onHistory = vi.fn();
    render(
      <ZReadingReconciliationCard
        data={{ status: 'not_generated', report_recognized_sales: 100, report_net_sales: 95 }}
        onHistory={onHistory}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'View Z-reading history' }));
    expect(onHistory).toHaveBeenCalledOnce();
  });

  it('does not turn missing snapshot amounts into zero when a reading has not been generated', () => {
    const markup = renderMarkup(
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
    const varianceMarkup = renderMarkup(
      <ZReadingReconciliationCard currencySymbol="₱" data={{ ...base, status: 'variance', variance: 5 }} />
    );
    const unavailableMarkup = renderMarkup(
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
