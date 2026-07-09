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
  it('renders required non-fiscal banner and DGFY footer', () => {
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
    expect(screen.getByText('Powered by DGFY POS')).toBeTruthy();
    expect(screen.queryByText(/TIN\/Branch:/i)).toBeNull();
    expect(screen.queryByText('SOLD TO:')).toBeNull();
    expect(screen.queryByText('Vatable Sales')).toBeNull();
    expect(screen.getByText('Estimated Tax')).toBeTruthy();
    expect(screen.getByText('This document is not an official tax receipt.')).toBeTruthy();
  });

  it('does not infer fiscal status from an invoice number prefix', () => {
    renderReceipt({
      transaction: buildTransaction({
        invoice_number: 'INV-LEGACY-001',
        document_type: null,
        document_context: null
      }),
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });

    expect(screen.getByText('NON-FISCAL SLIP')).toBeTruthy();
    expect(screen.queryByText('VAT INVOICE')).toBeNull();
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
    expect(screen.getByText('Powered by DGFY POS')).toBeTruthy();
  });

  it('renders fiscal header fields only for fiscal document context', () => {
    renderReceipt({
      transaction: buildTransaction({
        invoice_number: 'INV-001001',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal',
        buyer_name: 'Juan Dela Cruz',
        buyer_tin: '987-654-321-000',
        buyer_address: '456 Buyer St',
        buyer_business_style: 'Juan Trading',
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

    expect(screen.getByText('VAT INVOICE')).toBeTruthy();
    expect(screen.getByText('VAT REG TIN: 123-456-789-000')).toBeTruthy();
    expect(screen.getByText('PTU: PTU-REF-999')).toBeTruthy();
    expect(screen.getByText('MIN: MIN-2026-001')).toBeTruthy();
    expect(screen.getByText('ATP/OCN No.: BIR-TEST-2026-001')).toBeTruthy();
    expect(screen.queryByText('NOT A FISCAL RECEIPT')).toBeNull();
    expect(screen.getByText('SOLD TO:')).toBeTruthy();
    expect(screen.getByText('Business Style: Juan Trading')).toBeTruthy();
    expect(screen.getByText('VAT 12%')).toBeTruthy();
    expect(screen.getByText('Includes tax breakdown and fiscal identifiers.')).toBeTruthy();
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

    expect(text).toContain('VAT REG TIN: 123-456-789-000');
    expect(text).toContain('PTU: PTU-REF-999');
    expect(text).toContain('MIN: MIN-2026-001');
    expect(text).toContain('ATP/OCN No.: BIR-TEST-2026-001');
    expect(text).toContain('Powered by DGFY POS');
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
      'TOTAL SALES',
      'Estimated Tax',
      'Discount',
      'DGFY convenience fee',
      'TOTAL AMOUNT DUE',
      'Payment Method:',
      'Powered by DGFY POS'
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
