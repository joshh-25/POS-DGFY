import { describe, expect, it } from '@jest/globals';
import { buildOrderTimeline } from '../src/modules/businessAdmin/repositories/businessAdminOrderCenterRepository.js';

describe('Business Admin online-order timeline', () => {
    it('lists status transitions and labels a placed-to-rejected order without synthetic acceptance', () => {
        const at = '2026-10-22T03:00:00.000Z';
        const timeline = buildOrderTimeline({
            created_at: '2026-10-22T02:00:00.000Z',
            accepted_at: at,
            rejected_at: at,
            rejection_reason: 'Outside route'
        }, [{
            action: 'UPDATE',
            timestamp: at,
            actor_username: 'Cashier A',
            changes: {
                event: 'online_order_status_changed',
                from: 'placed', to: 'rejected', reason: 'Outside route'
            }
        }]);
        expect(timeline.map((entry) => entry.event)).toEqual([
            'order_created', 'order_rejected', 'status_changed'
        ]);
        expect(timeline[2]).toMatchObject({
            from: 'placed', to: 'rejected', actor_name: 'Cashier A', note: 'Outside route'
        });
    });
});
