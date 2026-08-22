/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ReceiptPrintView from '../components/ReceiptPrintView.jsx';
import { formatIminReceiptText, printReceiptWithIminBridge } from '../utils/iminHardwareBridge.js';

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
  delete window.iMinBridge;
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
    expect(screen.queryByText(/SC\/PWD\/NAAC\/MOV\/Solo Parent ID No\./i)).toBeNull();
    expect(screen.queryByText(/^Signature:/i)).toBeNull();
    expect(screen.getByText('Estimated Tax')).toBeTruthy();
    expect(screen.getByText('This document is not an official tax receipt.')).toBeTruthy();
  });

  it('renders the company icon when a storefront profile image is configured', () => {
    renderReceipt({
      transaction: buildTransaction(),
      businessSettings: {
        pos_business_name: 'Compliance Test Store',
        storefront_profile_image_url: '/uploads/storefront-assets/t1/profile.png'
      }
    });

    const businessIcon = screen.getByRole('img', { name: 'Compliance Test Store icon' });
    expect(businessIcon.getAttribute('src')).toContain('/uploads/storefront-assets/t1/profile.png');
  });

  it('renders no icon, and prints with no logo, when no company icon is configured (issue #321)', () => {
    // Preview (ReceiptPrintView -> renderPosReceiptHtml) and the physical iMin print
    // path (printReceiptWithIminBridge) both derive the logo from the same
    // businessSettings fields, so an unset icon must be a no-op on both, never a
    // silent fallback to a hardcoded platform icon on the print side alone.
    renderReceipt({
      transaction: buildTransaction(),
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });

    expect(screen.queryByRole('img', { name: 'Compliance Test Store icon' })).toBeNull();

    const printCalls = [];
    const printReceiptWithLogo = (...args) => {
      printCalls.push(args);
      return { success: true, message: 'Receipt printed.' };
    };
    window.iMinBridge = {
      isIminWrapper: () => true,
      printReceiptWithLogo,
      printReceipt: () => ({ success: true, message: 'Receipt printed.' })
    };

    const printResult = printReceiptWithIminBridge({
      transaction: buildTransaction(),
      businessSettings: { pos_business_name: 'Compliance Test Store' },
      openDrawerAfterPrint: false
    });

    expect(printResult.handled).toBe(true);
    expect(printCalls).toHaveLength(1);
    expect(printCalls[0][2]).toBe('');
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
    expect(screen.getByText('VAT Amount (12%)')).toBeTruthy();
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

  it('shows Senior/PWD receipt fields only for statutory discounts', () => {
    renderReceipt({
      transaction: buildTransaction({
        discount: {
          discount_type: 'senior',
          customer_name: 'Juan Dela Cruz',
          senior_pwd_id_number: 'SC-12345'
        }
      }),
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });

    expect(screen.getByText('SC/PWD/NAAC/MOV/Solo Parent ID No.: SC-12345')).toBeTruthy();
    expect(screen.getByText('Signature: __________________________')).toBeTruthy();
  });

  it('keeps iMin Senior/PWD fields hidden for non-statutory discounts and shows them for statutory discounts', () => {
    const nonStatutoryText = formatIminReceiptText({
      transaction: buildTransaction({
        discount: {
          discount_type: 'manual',
          customer_name: 'Walk-in Customer',
          senior_pwd_id_number: 'SHOULD-NOT-SHOW'
        }
      }),
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });

    expect(nonStatutoryText).not.toContain('SC/PWD/NAAC/MOV/Solo Parent ID No.:');
    expect(nonStatutoryText).not.toContain('Signature: __________________________');

    const statutoryText = formatIminReceiptText({
      transaction: buildTransaction({
        discount: {
          discount_type: 'pwd',
          customer_name: 'Maria Santos',
          senior_pwd_id_number: 'PWD-98765'
        }
      }),
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });

    expect(statutoryText).toContain('SC/PWD/NAAC/MOV/Solo Parent ID No.: PWD-98765');
    expect(statutoryText).toContain('Signature: __________________________');
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

  it('prints authoritative online promo, delivery, and payment metadata', () => {
    const transaction = buildTransaction({
      payment_type: 'qrph',
      payment_status: 'paid',
      payment_reference: 'pay_authoritative_123',
      subtotal_amount: 100,
      discount_amount: 20,
      discount_label_snapshot: 'Online Promo',
      discount_rate_snapshot: 20,
      service_fee_amount: 1,
      delivery_fee: 30,
      total_amount: 111,
      discount: {
        discount_type: 'promo',
        promo_code: 'SAVE20'
      }
    });
    const { container } = renderReceipt({
      transaction,
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });
    const text = container.textContent || '';

    expect(text).toContain('Promo CodeSAVE20');
    expect(text).toContain('Discount TypePROMO');
    expect(text).toContain('Delivery Fee30.00');
    expect(text).toContain('Payment Status:PAID');
    expect(text).toContain('Payment Reference:pay_authoritative_123');
    expect(text).toContain('TOTAL AMOUNT DUE111.00');
    expect(text).not.toContain('DGFY convenience fee');
    expect(text).not.toContain('Cash Received:');

    const hardwareText = formatIminReceiptText({
      transaction,
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });
    expect(hardwareText).toContain('Promo Code: SAVE20');
    expect(hardwareText).toContain('Discount Type: PROMO');
    expect(hardwareText).toContain('Delivery Fee');
    expect(hardwareText).toContain('Payment Status: PAID');
    expect(hardwareText).toContain('Payment Reference: pay_authoritative_123');
    expect(hardwareText).not.toContain('DGFY convenience fee');
    expect(hardwareText).not.toContain('Cash Received');
  });

  it('keeps the physical receipt line discount breakdown aligned with the preview', () => {
    const transaction = buildTransaction({
      subtotal_amount: 80,
      discount_amount: 12,
      discount_label_snapshot: 'Employee Discount',
      total_amount: 68,
      lines: [{
        line_id: 7,
        item_id: 11,
        item_name_snapshot: 'Garlic',
        quantity: 1,
        sale_price: 40,
        line_subtotal: 68,
        item: { name: 'Renamed Later' }
      }],
      discount: {
        lines: [{
          transaction_line_id: 7,
          gross_eligible_amount: 80,
          discount_amount: 12,
          vat_removed: 0
        }]
      }
    });

    const hardwareText = formatIminReceiptText({
      transaction,
      businessSettings: { pos_business_name: 'Compliance Test Store' }
    });

    expect(hardwareText).toContain('Garlic');
    expect(hardwareText).not.toContain('Renamed Later');
    expect(hardwareText).toContain('PHP 80.00');
    expect(hardwareText).toContain('-PHP 12.00');
    expect(hardwareText).toContain('NET TOTAL');
    expect(hardwareText).toContain('PHP 68.00');
  });

  it('renders and formats receipts when Android WebView does not provide replaceAll', () => {
    const originalReplaceAll = String.prototype.replaceAll;
    Object.defineProperty(String.prototype, 'replaceAll', {
      configurable: true,
      value: undefined
    });

    try {
      const transaction = buildTransaction({
        payment_type: 'cash_sale',
        payment_status: 'awaiting_payment',
        discount: { discount_type: 'senior_pwd' }
      });
      const { container } = renderReceipt({
        transaction,
        businessSettings: { pos_business_name: 'Compatibility Test Store' }
      });

      expect(container.textContent).toContain('CASH SALE');
      expect(container.textContent).toContain('AWAITING PAYMENT');
      expect(container.textContent).toContain('SENIOR PWD');

      const hardwareText = formatIminReceiptText({
        transaction,
        businessSettings: { pos_business_name: 'Compatibility Test Store' }
      });
      const printCalls = [];
      window.iMinBridge = {
        isIminWrapper: () => true,
        printReceipt: (...args) => {
          printCalls.push(args);
          return { success: true, message: 'Receipt printed.' };
        }
      };
      const printResult = printReceiptWithIminBridge({
        transaction,
        businessSettings: { pos_business_name: 'Compatibility Test Store' },
        openDrawerAfterPrint: true
      });

      expect(hardwareText).toContain('Payment Status: AWAITING PAYMENT');
      expect(hardwareText).toContain('Discount Type: SENIOR PWD');
      expect(printResult.handled).toBe(true);
      expect(printCalls).toHaveLength(1);
      expect(printCalls[0][0]).toContain('Payment Status: AWAITING PAYMENT');
      expect(printCalls[0][1]).toBe(true);
    } finally {
      Object.defineProperty(String.prototype, 'replaceAll', {
        configurable: true,
        value: originalReplaceAll
      });
    }
  });
});
