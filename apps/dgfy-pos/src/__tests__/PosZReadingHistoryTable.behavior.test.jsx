/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosZReadingHistoryTable from '../../../../packages/web-core/src/features/pos/components/PosZReadingHistoryTable.jsx';

afterEach(cleanup);

const row = {
  business_date: '2026-09-27',
  location_id: 12,
  reading_identifier: 'ZR-20260927-00000019',
  generated_at: '2026-09-27T16:00:00.000Z',
  closed_by_user_id: 8,
  closed_from_terminal_id: 'COUNTER-02',
  snapshot_persisted: true,
  summary: { transaction_count: 3, total_amount: 879.5 }
};

describe('POS Z-reading history table', () => {
  it('shows saved rows and requests preview without mutating them', () => {
    const onPreview = vi.fn();
    render(<PosZReadingHistoryTable rows={[row]} total={1} onPreview={onPreview} />);

    expect(screen.getAllByText('ZR-20260927-00000019').length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱879.50').length).toBeGreaterThan(0);
    expect(screen.getByText(/completed, saved branch readings only/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /preview z-reading ZR-20260927-00000019/i }));

    expect(onPreview).toHaveBeenCalledWith(row);
  });

  it('distinguishes loading, empty, and retryable error states', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<PosZReadingHistoryTable loading />);
    expect(screen.getByRole('status').textContent).toContain('Loading saved Z-readings');

    rerender(<PosZReadingHistoryTable rows={[]} total={0} />);
    expect(screen.getByText('No saved Z-readings in this date range')).toBeTruthy();

    rerender(<PosZReadingHistoryTable error="Could not reach the POS API." onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('Could not reach the POS API.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps owner-critical reading and per-shift data visible and collapses secondary audit fields', () => {
    const previewData = {
      business_date: '2026-09-27',
      location_id: 12,
      reading_identifier: row.reading_identifier,
      generated_at: row.generated_at,
      closed_from_terminal_id: 'COUNTER-01',
      counters: { z_counter: 7, reset_counter: 2, lifetime_grand_total: 29876.45 },
      summary: {
        transaction_count: 3,
        total_amount: 150,
        subtotal_amount: 140,
        discount_amount: 2,
        service_fee_total: 3,
        restaurant_service_charge_total: 5,
        vatable_sales: 100,
        vat_amount: 12,
        vat_exempt_sales: 20,
        zero_rated_sales: 0,
        void_transaction_count: 1,
        void_amount: 10,
        payment_breakdown: [{ payment_label: 'Cash', amount: 100, count: 2 }]
      },
      details: {
        captured: true,
        branch_name: 'Test Branch',
        generated_by: { display_name: 'Alex Owner' },
        report_period: {
          starts_at: '2026-09-26T16:00:00.000Z',
          ends_at_exclusive: '2026-09-27T16:00:00.000Z'
        },
        refunds: {
          succeeded_count: 1,
          succeeded_amount: 8,
          pending_count: 2,
          pending_amount: 16,
          review_count: 1,
          review_amount: 4
        },
        receipt_ranges: {
          sales: { beginning_invoice_number: 'INV-001', ending_invoice_number: 'INV-003' },
          voids: { beginning_invoice_number: 'VOID-001', ending_invoice_number: 'VOID-001' },
          returns: { tracked: false, reason: 'Return receipt tracking was unavailable.' }
        },
        shifts: [
          {
            shift_id: 11,
            terminal_id: 'COUNTER-01',
            opening_cashier: { display_name: 'Alex Cashier' },
            opened_at: '2026-09-27T01:00:00.000Z',
            closed_at: '2026-09-27T08:00:00.000Z',
            transaction_count: 2,
            sales_amount: 100,
            cash: { opening_float_amount: 20, expected_cash_amount: 90, counted_cash_amount: 85, variance_amount: -5 },
            cashier_sales: [{ display_name: 'Alex Cashier', transaction_count: 2, sales_amount: 100 }],
            adjustments: {
              void_transaction_count: 1,
              void_amount: 10,
              refunds: { succeeded_count: 1, succeeded_amount: 8 }
            },
            receipt_ranges: {
              sales: { beginning_invoice_number: 'INV-001', ending_invoice_number: 'INV-002' },
              voids: { beginning_invoice_number: 'VOID-001', ending_invoice_number: 'VOID-001' }
            }
          },
          {
            shift_id: 12,
            terminal_id: 'COUNTER-02',
            opening_cashier: { display_name: 'Mira Cashier' },
            opened_at: '2026-09-27T08:00:00.000Z',
            closed_at: '2026-09-27T16:00:00.000Z',
            transaction_count: 1,
            sales_amount: 50,
            cash: { opening_float_amount: 10, expected_cash_amount: 40, counted_cash_amount: 52, variance_amount: 12 },
            cashier_sales: [{ display_name: 'Mira Cashier', transaction_count: 1, sales_amount: 50 }],
            adjustments: { void_transaction_count: 0, void_amount: 0, refunds: { succeeded_count: 0, succeeded_amount: 0 } },
            receipt_ranges: { sales: { beginning_invoice_number: 'INV-003', ending_invoice_number: 'INV-003' } }
          }
        ]
      }
    };

    render(
      <PosZReadingHistoryTable
        rows={[row]}
        total={1}
        preview={{ open: true, row, data: previewData }}
      />
    );

    expect(screen.getAllByText('Alex Cashier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mira Cashier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Over / short for this shift')).toHaveLength(2);
    expect(screen.getByText('₱-5.00')).toBeTruthy();
    expect(screen.getByText('₱12.00')).toBeTruthy();
    expect(screen.getByText('VATable: ₱100.00')).toBeTruthy();
    expect(screen.getByText('Cash')).toBeTruthy();

    const disclosureSummary = screen.getByText('Show additional audit details');
    const disclosure = disclosureSummary.closest('details');
    expect(disclosure?.open).toBe(false);

    fireEvent.click(disclosureSummary);

    expect(disclosure?.open).toBe(true);
    expect(screen.getByText('Accumulated total')).toBeTruthy();
    expect(screen.getAllByText('Sales invoices')).toHaveLength(3);
    expect(screen.getByText('Pending refunds')).toBeTruthy();
  });
});
