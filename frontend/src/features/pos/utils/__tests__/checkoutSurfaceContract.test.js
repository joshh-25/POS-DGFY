import { describe, expect, it } from 'vitest';
import {
  DGFY_CONVENIENCE_FEE_LABEL,
  DGFY_CONVENIENCE_FEE_RATE,
  buildPosCheckoutPayload,
  resolveReceiptDocumentContract
} from '../checkoutSurfaceContract.js';

describe('checkout surface contract', () => {
  it('keeps the governed DGFY fee label and rate centralized for both POS surfaces', () => {
    expect(DGFY_CONVENIENCE_FEE_LABEL).toBe('DGFY convenience fee');
    expect(DGFY_CONVENIENCE_FEE_RATE).toBe(0.01);
  });

  it('builds the shared POS checkout payload with terminal, F&B, modifier, and scan metadata', () => {
    const payload = buildPosCheckoutPayload({
      idempotencyKey: 'idem-123',
      terminalId: ' COUNTER-01 ',
      selectedLocationId: 4,
      orderMethod: 'dine_in',
      paymentType: 'gcash',
      calculatedDiscountAmount: '12.50',
      selectedDiscount: { name: 'PWD', percentage: '20' },
      activeShiftId: 22,
      fnbContext: {
        fnb_check_id: 31,
        fnb_table_id: 8,
        fnb_table_label_snapshot: 'Table 8',
        fnb_guest_count: 3,
        fnb_server_id: 5,
        restaurant_service_charge: 15,
        default_course: 'main'
      },
      buyerFiscal: {
        buyer_name: ' Acme Buyer ',
        buyer_tin: ' 987-654-321-00000 ',
        buyer_business_style: ' Wholesale ',
        buyer_address: ' Quezon City '
      },
      cart: [
        {
          item_id: 99,
          quantity: '2',
          sale_price: '120.25',
          price_override_reason: ' manager approved ',
          line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 2 }],
          special_instructions: 'No onions',
          kitchen_station_id: 7,
          scan_metadata: { barcode: 'ABC123', scope: 'pos' }
        }
      ]
    });

    expect(payload).toEqual({
      idempotency_key: 'idem-123',
      terminal_id: 'COUNTER-01',
      location_id: 4,
      order_method: 'dine_in',
      payment_type: 'gcash',
      payment_handoff_mode: 'external',
      discount_amount: 12.5,
      discount_profile_name: 'PWD',
      discount_rate: 20,
      shift_id: 22,
      fnb_check_id: 31,
      fnb_table_id: 8,
      fnb_table_label_snapshot: 'Table 8',
      fnb_guest_count: 3,
      fnb_server_id: 5,
      restaurant_service_charge: 15,
      buyer_name: 'Acme Buyer',
      buyer_tin: '987-654-321-00000',
      buyer_business_style: 'Wholesale',
      buyer_address: 'Quezon City',
      lines: [
        {
          item_id: 99,
          quantity: 2,
          sale_price: 120.25,
          price_override_reason: 'manager approved',
          course: 'main',
          line_modifiers: [{ modifier_group_id: 1, modifier_option_id: 2 }],
          special_instructions: 'No onions',
          kitchen_station_id: 7,
          scan_metadata: { barcode: 'ABC123', scope: 'pos' }
        }
      ]
    });
  });

  it('uses internal payment handoff for cash and omits empty optional fields', () => {
    const payload = buildPosCheckoutPayload({
      idempotencyKey: 'idem-cash',
      paymentType: 'cash',
      cart: [{ item_id: 10, quantity: 1, sale_price: 50 }]
    });

    expect(payload.payment_handoff_mode).toBe('internal');
    expect(payload.terminal_id).toBeUndefined();
    expect(payload.location_id).toBeUndefined();
    expect(payload.discount_profile_name).toBeNull();
    expect(payload.discount_rate).toBeNull();
    expect(payload.buyer_name).toBeUndefined();
    expect(payload.buyer_tin).toBeUndefined();
    expect(payload.buyer_business_style).toBeUndefined();
    expect(payload.buyer_address).toBeUndefined();
    expect(payload.lines[0]).toEqual({
      item_id: 10,
      quantity: 1,
      sale_price: 50,
      price_override_reason: undefined,
      course: undefined,
      line_modifiers: undefined,
      special_instructions: undefined,
      kitchen_station_id: undefined,
      scan_metadata: undefined
    });
  });

  it('resolves receipt status only from explicit document_type and document_context fields', () => {
    expect(resolveReceiptDocumentContract(
      { invoice_number: 'INV-LEGACY-001' },
      null
    )).toEqual({
      document_type: 'non_fiscal_slip',
      document_context: 'non_fiscal',
      label: 'NON-FISCAL SLIP'
    });

    expect(resolveReceiptDocumentContract(
      {
        invoice_number: 'INV-EXPLICIT-NON-FISCAL',
        document_type: 'non_fiscal_slip',
        document_context: 'training_test'
      },
      null
    )).toEqual({
      document_type: 'non_fiscal_slip',
      document_context: 'training_test',
      label: 'NON-FISCAL SLIP'
    });

    expect(resolveReceiptDocumentContract(
      { invoice_number: 'NFS-EXPLICIT-FISCAL' },
      {
        document_type: 'fiscal_invoice',
        document_context: 'fiscal',
        label: 'FISCAL INVOICE'
      }
    )).toEqual({
      document_type: 'fiscal_invoice',
      document_context: 'fiscal',
      label: 'FISCAL INVOICE'
    });
  });
});
