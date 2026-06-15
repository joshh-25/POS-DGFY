/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ReceiptPrintView from '../components/ReceiptPrintView.jsx';
import { formatIminReceiptText } from '../utils/iminHardwareBridge.js';

const buildTransaction = (overrides = {}) => ({
  pos_transaction_id: 1001,
  created_at: '2026-04-09T09:15:00.000Z',
  invoice_number: 'NFS-001001',
  document_type: 'non_fiscal_slip',
  document_context: 'non_fiscal',
  subtotal_amount: 100,
  vatable_sales: 89.29,
  vat_amount: 10.71,
  vat_exempt_sales: 0,
  zero_rated_sales: 0,
  discount_amount: 0,
  discount_label_snapshot: null,
  discount_rate_snapshot: null,
  service_fee_amount: 0,
  service_fee_label_snapshot: null,
  service_fee_method_snapshot: null,
  total_amount: 100,
  special_instructions: null,
  lines: [
    {
      line_id: 1,
      item_id: 11,
      quantity: 1,
      unit_of_measure: 'pc',
      sale_price: 100,
      line_subtotal: 100,
      item: {
        name: 'Test Item'
      }
    }
  ],
  ...overrides
});

const renderReceipt = (props) => render(
  React.createElement(ReceiptPrintView, props)
);

afterEach(() => {
  cleanup();
});

describe('RCPT-01 receipt contract conformance fixtures', () => {
  it('renders required non-fiscal banner and immutable sequence statement', () => {
    renderReceipt({
      transaction: buildTransaction(),
      businessSettings: {
        pos_business_name: 'Compliance Test Store',
        pos_address: '123 Test St'
      }
    });

    expect(screen.getByText('NON-FISCAL SLIP')).toBeTruthy();
    expect(screen.getByText('NOT A FISCAL RECEIPT')).toBeTruthy();
    expect(screen.getByText('Non-fiscal document')).toBeTruthy();
    expect(screen.getByText('Document context: non_fiscal')).toBeTruthy();
    expect(screen.getByText('Receipt contract version: 2026.04.08')).toBeTruthy();
    expect(screen.getByText('Sequence control: invoice number is system-generated and immutable.')).toBeTruthy();
    expect(screen.queryByText(/TIN\/Branch:/i)).toBeNull();
  });

  it('renders explicit training/test banner when context is training_test', () => {
    renderReceipt({
      transaction: buildTransaction({
        special_instructions: JSON.stringify({
          receipt_contract: {
            version: '2026.04.08',
            document_type: 'non_fiscal_slip',
            document_context: 'training_test'
          }
        })
      }),
      businessSettings: { pos_business_name: 'Compliance Test Store' },
      receiptContract: {
        version: '2026.04.08',
        document_type: 'non_fiscal_slip',
        document_context: 'training_test'
      }
    });

    expect(screen.getByText('NOT A FISCAL RECEIPT')).toBeTruthy();
    expect(screen.getByText('Training/Test mode only')).toBeTruthy();
    expect(screen.getByText('Document context: training_test')).toBeTruthy();
  });

  it('renders fiscal header fields only for fiscal document context', () => {
    renderReceipt({
      transaction: buildTransaction({
        invoice_number: 'INV-001001',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal',
        special_instructions: JSON.stringify({
          receipt_contract: {
            version: '2026.04.08',
            document_type: 'fiscal_invoice',
            document_context: 'fiscal'
          }
        })
      }),
      businessSettings: {
        pos_business_name: 'Compliance Test Store',
        pos_tin_branch: '123-456-789-000',
        pos_ptu_number: 'PTU-REF-999',
        pos_min_number: 'MIN-2026-001',
        pos_accreditation_number: 'BIR-TEST-2026-001',
        pos_software_name: 'DGFY POS',
        pos_software_version: '2026.06',
        pos_software_serial_number: 'DGFY-SN-001'
      }
    });

    expect(screen.getByText('FISCAL INVOICE')).toBeTruthy();
    expect(screen.getByText('TIN/Branch: 123-456-789-000')).toBeTruthy();
    expect(screen.getByText('PTU: PTU-REF-999')).toBeTruthy();
    expect(screen.getByText('MIN: MIN-2026-001')).toBeTruthy();
    expect(screen.getByText('Accreditation: BIR-TEST-2026-001')).toBeTruthy();
    expect(screen.getByText('Software: DGFY POS')).toBeTruthy();
    expect(screen.getByText('Version: 2026.06')).toBeTruthy();
    expect(screen.getByText('Serial: DGFY-SN-001')).toBeTruthy();
    expect(screen.queryByText('NOT A FISCAL RECEIPT')).toBeNull();
  });

  it('keeps iMin hardware receipt fiscal compliance fields aligned with preview', () => {
    const text = formatIminReceiptText({
      transaction: buildTransaction({
        invoice_number: 'INV-001002',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal',
        special_instructions: JSON.stringify({
          receipt_contract: {
            version: '2026.04.08',
            document_type: 'fiscal_invoice',
            document_context: 'fiscal'
          }
        })
      }),
      businessSettings: {
        pos_business_name: 'Compliance Test Store',
        pos_tin_branch: '123-456-789-000',
        pos_ptu_number: 'PTU-REF-999',
        pos_min_number: 'MIN-2026-001',
        pos_accreditation_number: 'BIR-TEST-2026-001',
        pos_software_name: 'DGFY POS',
        pos_software_version: '2026.06',
        pos_software_serial_number: 'DGFY-SN-001'
      },
      receiptContract: {
        version: '2026.04.08',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal'
      }
    });

    expect(text).toContain('TIN/Branch: 123-456-789-000');
    expect(text).toContain('PTU: PTU-REF-999');
    expect(text).toContain('MIN: MIN-2026-001');
    expect(text).toContain('Accreditation: BIR-TEST-2026-001');
    expect(text).toContain('Software: DGFY POS');
    expect(text).toContain('Version: 2026.06');
    expect(text).toContain('Serial: DGFY-SN-001');
  });

  it('keeps regulator-summary rows and footer contract lines in fixed order', () => {
    const { container } = renderReceipt({
      transaction: buildTransaction({
        special_instructions: JSON.stringify({
          receipt_contract: {
            version: '2026.04.08',
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal'
          }
        })
      }),
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });

    const content = container.textContent || '';
    const orderedLabels = [
      'Subtotal',
      'Vatable Sales',
      'VAT Amount',
      'VAT Exempt Sales',
      'Zero Rated Sales',
      'Discount',
      'DGFY convenience fee',
      'Total',
      'Document context: non_fiscal',
      'Receipt contract version: 2026.04.08',
      'Sequence control: invoice number is system-generated and immutable.',
      'Discover Goods For You'
    ];

    let cursor = -1;
    for (const label of orderedLabels) {
      const position = content.indexOf(label);
      expect(position).toBeGreaterThan(-1);
      expect(position).toBeGreaterThan(cursor);
      cursor = position;
    }
  });
});
