import { describe, expect, it } from '@jest/globals';
import { buildOrderReceiptTransaction } from '../src/modules/businessAdmin/repositories/businessAdminOrderCenterRepository.js';

describe('Business Admin original receipt view contract', () => {
    it('returns the canonical receipt fields without exposing checkout secrets', () => {
        const receipt = buildOrderReceiptTransaction({
            pos_transaction_id: 41,
            invoice_number: 'NFS-000041',
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal',
            created_at: '2026-09-22T04:00:00.000Z',
            terminal_id: 'POS-01',
            cashier: { username: 'cashier@example.com' },
            customer_name: 'Maria Santos',
            payment_type: 'cash',
            payment_status: 'paid',
            payment_breakdown: [{ payment_type: 'cash', amount: 120 }],
            cash_received: '150.0000',
            change_amount: '30.0000',
            subtotal_amount: '120.0000',
            vat_amount: '12.8571',
            discount_amount: '0.0000',
            total_amount: '120.0000',
            lines: [{
                line_id: 9,
                item_id: 3,
                item_name_snapshot: 'Iced Coffee',
                sku_snapshot: 'COF-001',
                quantity: '2.000000000000',
                sale_price: '60.0000',
                line_subtotal: '120.0000',
                item: { item_id: 3, name: 'Renamed Iced Coffee', sku_code: 'LIVE-001' }
            }],
            idempotency_key: 'must-not-leave-the-api'
        });

        expect(receipt).toEqual(expect.objectContaining({
            pos_transaction_id: 41,
            invoice_number: 'NFS-000041',
            terminal_id: 'POS-01',
            customer_name: 'Maria Santos',
            total_amount: '120.0000',
            payment_breakdown: [{ payment_type: 'cash', amount: 120 }]
        }));
        expect(receipt.cash_received).toBe('150.0000');
        expect(receipt.lines[0].item.name).toBe('Iced Coffee');
        expect(receipt.lines[0].item.sku_code).toBe('COF-001');
        expect(receipt).not.toHaveProperty('idempotency_key');
        expect(receipt).not.toHaveProperty('request_hash');
    });
});
