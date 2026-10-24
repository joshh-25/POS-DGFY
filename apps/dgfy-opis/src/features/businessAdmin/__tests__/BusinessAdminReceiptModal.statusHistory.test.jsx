// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BusinessAdminReceiptModal from '../BusinessAdminReceiptModal.jsx';

vi.mock('../../../../../../packages/web-core/src/features/pos/components/ReceiptPrintView.jsx', () => ({
    default: () => <div>Receipt preview</div>
}));
vi.mock('../../../../../../packages/web-core/src/services/settingsService.js', () => ({
    getAllSettings: vi.fn().mockResolvedValue({})
}));

const order = {
    transaction_id: 55,
    invoice_number: 'INV-55',
    receipt: { transaction: { pos_transaction_id: 55 } }
};

afterEach(() => cleanup());

describe('Business Admin receipt status history', () => {
    it('shows a rejected transition with actor, time, and reason', () => {
        render(<BusinessAdminReceiptModal order={{
            ...order,
            timeline: [{
                event: 'status_changed',
                from: 'confirmed',
                to: 'rejected',
                actor_name: 'Cashier A',
                occurred_at: '2026-10-22T03:00:00.000Z',
                note: 'Out of range'
            }]
        }} onClose={() => {}} />);
        const history = screen.getByTestId('business-admin-receipt-status-history');
        expect(history.textContent).toContain('Confirmed → Rejected');
        expect(history.textContent).toContain('Cashier A');
        expect(history.textContent).toContain('Out of range');
    });

    it('omits the history block when the timeline has no status entries', () => {
        render(<BusinessAdminReceiptModal order={{ ...order, timeline: [{ event: 'order_created' }] }} onClose={() => {}} />);
        expect(screen.queryByTestId('business-admin-receipt-status-history')).toBeNull();
    });
});
