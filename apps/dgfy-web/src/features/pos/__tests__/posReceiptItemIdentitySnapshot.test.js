import { describe, expect, it } from 'vitest';
import { renderPosReceiptHtml, renderThermalReceiptText } from '@sieitzz/pos-receipt';

// Mode-switch hardening (issue #178 phase 5): receipt renderers must prefer
// the sale-time item_name_snapshot over a live item join, so a later item
// rename/delete can never retro-change a historical receipt.
describe('pos-receipt item identity snapshot precedence', () => {
  const baseTransaction = {
    invoice_number: 'INV-0001',
    created_at: '2026-08-08T00:00:00Z',
    subtotal_amount: 100,
    total_amount: 100,
    payment_type: 'cash',
    payment_status: 'paid'
  };

  it('prefers item_name_snapshot over the live item join in the HTML receipt', () => {
    const html = renderPosReceiptHtml({
      transaction: {
        ...baseTransaction,
        lines: [{
          item_id: 1,
          item_name_snapshot: 'Original Name At Sale Time',
          item: { name: 'Renamed Later' },
          quantity: 1,
          sale_price: 100,
          line_subtotal: 100
        }]
      }
    });

    expect(html).toContain('Original Name At Sale Time');
    expect(html).not.toContain('Renamed Later');
  });

  it('falls back to the live item join when no snapshot is present (pre-migration rows)', () => {
    const html = renderPosReceiptHtml({
      transaction: {
        ...baseTransaction,
        lines: [{
          item_id: 1,
          item: { name: 'Only Live Name' },
          quantity: 1,
          sale_price: 100,
          line_subtotal: 100
        }]
      }
    });

    expect(html).toContain('Only Live Name');
  });

  it('prefers item_name_snapshot in the thermal text receipt', () => {
    const text = renderThermalReceiptText({
      transaction: {
        ...baseTransaction,
        lines: [{
          item_id: 1,
          item_name_snapshot: 'Snapshot Name',
          item: { name: 'Live Name' },
          quantity: 1,
          sale_price: 100,
          line_subtotal: 100
        }]
      }
    });

    expect(text).toContain('Snapshot Name');
    expect(text).not.toContain('Live Name');
  });

  it('renders a persisted mixed-tender breakdown in HTML and thermal receipts', () => {
    const transaction = {
      ...baseTransaction,
      payment_type: 'cash',
      payment_breakdown: [
        { payment_type: 'cash', payment_label: 'Cash', amount: 50 },
        { payment_type: 'gcash', payment_label: 'GCash', amount: 50 }
      ]
    };
    expect(renderPosReceiptHtml({ transaction })).toContain('Payment Breakdown');
    expect(renderPosReceiptHtml({ transaction })).toContain('GCash');
    expect(renderThermalReceiptText({ transaction })).toContain('GCash 50.00');
  });

  it('shows discounted item totals with an explicit negative discount and net total', () => {
    const transaction = {
      ...baseTransaction,
      subtotal_amount: 80,
      discount_amount: 12,
      discount_label_snapshot: 'Employee Discount',
      total_amount: 68,
      lines: [{
        line_id: 7,
        item_id: 1,
        item_name_snapshot: 'Garlic',
        quantity: 1,
        sale_price: 40,
        line_subtotal: 68
      }],
      discount: {
        lines: [{
          transaction_line_id: 7,
          gross_eligible_amount: 80,
          discount_amount: 12,
          vat_removed: 0
        }]
      }
    };

    const html = renderPosReceiptHtml({ transaction });
    expect(html).toContain('<span>Total</span>');
    expect(html).toContain('<strong>80.00</strong>');
    expect(html).toContain('Discount (Employee Discount)');
    expect(html).toContain('-12.00');
    expect(html).toContain('NET TOTAL');
    expect(html).toContain('<strong>68.00</strong>');

    const thermalText = renderThermalReceiptText({ transaction });
    expect(thermalText).toContain('Discount (Employee Discount)');
    expect(thermalText).toContain('-12.00');
    expect(thermalText).toContain('NET TOTAL');
    expect(thermalText).toContain('TOTAL AMOUNT DUE');
  });
});
