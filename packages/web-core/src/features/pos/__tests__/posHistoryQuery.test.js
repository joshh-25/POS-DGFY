import { describe, expect, it } from 'vitest';
import { buildPosHistoryQuery } from '../utils/posHistoryQuery.js';

describe('buildPosHistoryQuery', () => {
    it('limits the default sales view to paid completed transactions', () => {
        expect(buildPosHistoryQuery({ historyStatus: 'all', page: 2 })).toMatchObject({
            page: 2,
            status: 'completed',
            payment_status: 'paid'
        });
    });

    it('keeps voided transactions searchable without treating them as current sales', () => {
        const query = buildPosHistoryQuery({ historyStatus: 'voided' });

        expect(query.status).toBe('voided');
        expect(query).not.toHaveProperty('payment_status');
    });

    it('does not call the server for local pending-sync history', () => {
        expect(buildPosHistoryQuery({ historyStatus: 'pending_sync' })).toBeNull();
    });

    it('preserves supported history filters alongside the sales contract', () => {
        expect(buildPosHistoryQuery({
            historyStatus: 'all',
            paymentType: 'employee_credit',
            orderMethod: 'dine_in',
            orderSource: 'in_store',
            cashierName: 'Hernando',
            dateFrom: '2026-08-01',
            dateTo: '2026-08-12',
            locationId: 3
        })).toMatchObject({
            payment_type: 'employee_credit',
            order_method: 'dine_in',
            order_source: 'in_store',
            cashier_name: 'Hernando',
            date_from: '2026-08-01',
            date_to: '2026-08-12',
            location_id: 3,
            status: 'completed',
            payment_status: 'paid'
        });
    });
});
