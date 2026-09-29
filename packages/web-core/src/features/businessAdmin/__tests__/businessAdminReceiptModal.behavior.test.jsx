/** @vitest-environment jsdom */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import BusinessAdminReceiptModal from '../BusinessAdminReceiptModal.jsx';
import { getAllSettings } from '../../../services/settingsService.js';

vi.mock('../../../services/settingsService.js', () => ({
    getAllSettings: vi.fn()
}));

const buildOrder = (overrides = {}) => ({
    transaction_id: 41,
    invoice_number: 'NFS-000041',
    transaction_status: 'completed',
    payment_status: 'paid',
    receipt: {
        receipt_contract: {
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal'
        },
        transaction: {
            pos_transaction_id: 41,
            invoice_number: 'NFS-000041',
            document_type: 'non_fiscal_slip',
            document_context: 'non_fiscal',
            created_at: '2026-09-22T04:00:00.000Z',
            payment_type: 'cash',
            payment_status: 'paid',
            subtotal_amount: 120,
            vat_amount: 12.86,
            discount_amount: 0,
            total_amount: 120,
            lines: [{
                line_id: 9,
                item_id: 3,
                quantity: 2,
                sale_price: 60,
                line_subtotal: 120,
                item: { name: 'Iced Coffee' }
            }]
        }
    },
    ...overrides
});
beforeEach(() => {
    getAllSettings.mockResolvedValue({
        pos_business_name: { value: 'Test Cafe' },
        pos_address: { value: '123 Test Street' }
    });
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('Business Admin original receipt popup', () => {
    it('opens a modal and renders the shared original receipt content', async () => {
        render(<BusinessAdminReceiptModal order={buildOrder()} onClose={vi.fn()} />);

        expect(screen.getByTestId('business-admin-receipt-modal')).toBeTruthy();
        expect(screen.getByText('Original receipt')).toBeTruthy();
        expect(screen.getByText('Sales receipt')).toBeTruthy();
        expect(screen.getByText('Iced Coffee')).toBeTruthy();
        expect(screen.getByText('Powered by DGFY POS')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    });

    it('labels finalized refunds without changing the receipt transaction into a replacement sale', () => {
        render(<BusinessAdminReceiptModal
            order={buildOrder({
                payment_status: 'refunded',
                refunds: [{ refund_id: 8, amount: 120, status: 'succeeded', reason: 'Customer request' }]
            })}
            onClose={vi.fn()}
        />);

        expect(screen.getByText('Refund receipt')).toBeTruthy();
        expect(screen.getByTestId('business-admin-receipt-refund-evidence')).toBeTruthy();
        expect(screen.getByText('NFS-000041')).toBeTruthy();
    });
});
