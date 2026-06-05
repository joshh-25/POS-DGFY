/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ReceiptPrintView from '../components/ReceiptPrintView.jsx';

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

  it('does not infer fiscal status from INV invoice prefixes without explicit server contract fields', () => {
    renderReceipt({
      transaction: buildTransaction({
        invoice_number: 'INV-LEGACY-001',
        document_type: null,
        document_context: null
      }),
      businessSettings: {
        pos_business_name: 'Compliance Test Store',
        pos_tin_branch: '123-456-789-000'
      }
    });

    expect(screen.getByText('NON-FISCAL SLIP')).toBeTruthy();
    expect(screen.getByText('NOT A FISCAL RECEIPT')).toBeTruthy();
    expect(screen.getByText('Document context: non_fiscal')).toBeTruthy();
    expect(screen.queryByText('FISCAL INVOICE')).toBeNull();
    expect(screen.queryByText(/TIN\/Branch:/i)).toBeNull();
  });

  it('does not infer fiscal status when document_type is present without document_context', () => {
    renderReceipt({
      transaction: buildTransaction({
        invoice_number: 'INV-MISSING-CONTEXT',
        document_type: 'fiscal_invoice',
        document_context: null
      }),
      businessSettings: {
        pos_business_name: 'Compliance Test Store',
        pos_tin_branch: '123-456-789-000'
      }
    });

    expect(screen.getByText('NON-FISCAL SLIP')).toBeTruthy();
    expect(screen.getByText('Document context: non_fiscal')).toBeTruthy();
    expect(screen.queryByText('FISCAL INVOICE')).toBeNull();
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
        pos_accreditation_number: 'BIR-TEST-2026-001'
      }
    });

    expect(screen.getByText('FISCAL INVOICE')).toBeTruthy();
    expect(screen.getByText('TIN/Branch: 123-456-789-000')).toBeTruthy();
    expect(screen.getByText('PTU: PTU-REF-999')).toBeTruthy();
    expect(screen.getByText('MIN: MIN-2026-001')).toBeTruthy();
    expect(screen.getByText('Accreditation: BIR-TEST-2026-001')).toBeTruthy();
    expect(screen.queryByText('NOT A FISCAL RECEIPT')).toBeNull();
  });

  it('prefers server fiscal document snapshot fields when present', () => {
    renderReceipt({
      transaction: buildTransaction({
        invoice_number: 'INV-001002',
        document_type: 'fiscal_invoice',
        document_context: 'fiscal',
        fiscal_document_hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        fiscal_document_snapshot: {
          template_version: 'rmo-24-2023-prep-v1',
          document: {
            receipt_contract_version: '2026.04.08'
          },
          seller: {
            registered_name: 'Snapshot Registered Corp.',
            tin_branch: '999-888-777-00000',
            ptu_number: 'PTU-SNAPSHOT',
            min_number: 'MIN-SNAPSHOT',
            accreditation_number: 'ACC-SNAPSHOT',
            software_name: 'SKU Inventory Manager',
            software_version: '2026.06',
            software_serial_number: 'SKU-SN-001'
          },
          buyer: {
            name: 'Acme Buyer Inc.',
            tin: '987-654-321-00000',
            business_style: 'Wholesale',
            address: 'Quezon City'
          }
        }
      }),
      businessSettings: {
        pos_business_name: 'Fallback Store',
        pos_tin_branch: '123-456-789-000'
      }
    });

    expect(screen.getByText('Snapshot Registered Corp.')).toBeTruthy();
    expect(screen.getByText('TIN/Branch: 999-888-777-00000')).toBeTruthy();
    expect(screen.getByText('PTU: PTU-SNAPSHOT')).toBeTruthy();
    expect(screen.getByText('Software: SKU Inventory Manager / 2026.06 / SKU-SN-001')).toBeTruthy();
    expect(screen.getByText('Buyer')).toBeTruthy();
    expect(screen.getByText('Acme Buyer Inc.')).toBeTruthy();
    expect(screen.getByText('TIN: 987-654-321-00000')).toBeTruthy();
    expect(screen.getByText('Fiscal document hash: abcdef123456')).toBeTruthy();
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
