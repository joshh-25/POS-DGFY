// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildPosCustomerDisplayScopeKey,
    buildPosCustomerDisplaySnapshot,
    getPosCustomerDisplayStorageKey,
    isPosCustomerDisplaySnapshotFresh,
    publishPosCustomerDisplaySnapshot,
    readPosCustomerDisplaySnapshot,
    subscribeToPosCustomerDisplay
} from '../../../../packages/web-core/src/features/pos/utils/posCustomerDisplaySync.js';

const scope = {
    tenantId: 'tenant-a',
    terminalId: 'counter 01',
    locationId: 7
};

describe('POS customer display synchronization', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('builds a stable tenant, terminal, and location scope without accepting incomplete scopes', () => {
        expect(buildPosCustomerDisplayScopeKey(scope)).toBe('tenant-a:COUNTER-01:7');
        expect(getPosCustomerDisplayStorageKey(scope)).toBe('dgfy_pos_customer_display_v1:tenant-a:COUNTER-01:7');
        expect(buildPosCustomerDisplayScopeKey({ tenantId: 'tenant-a', terminalId: 'counter 01' })).toBe('');
    });

    it('publishes only the customer-safe order projection', () => {
        const snapshot = buildPosCustomerDisplaySnapshot({
            scope,
            businessName: 'Cafe Demo',
            currency: 'PHP',
            cart: [{
                item_id: 21,
                item_name: 'Latte',
                quantity: 2,
                sale_price: 125,
                special_instructions: 'Private cashier note',
                service_option_details: [{ name: 'Oat milk' }]
            }],
            subtotal: 250,
            total: 280,
            itemCount: 2
        });

        expect(snapshot).toMatchObject({
            state: 'active',
            business_name: 'Cafe Demo',
            item_count: 2,
            subtotal: 250,
            total: 280,
            lines: [{
                name: 'Latte',
                quantity: 2,
                unitPrice: 125,
                lineTotal: 250,
                options: ['Oat milk']
            }]
        });
        expect(JSON.stringify(snapshot)).not.toContain('Private cashier note');
        expect(JSON.stringify(snapshot)).not.toContain('token');
    });

    it('round-trips the scoped snapshot and notifies an open display tab', () => {
        const received = [];
        const unsubscribe = subscribeToPosCustomerDisplay(scope, (snapshot) => received.push(snapshot));

        publishPosCustomerDisplaySnapshot({
            scope,
            cart: [{ item_name: 'Rice bowl', quantity: 1, sale_price: 180 }],
            subtotal: 180,
            total: 180,
            itemCount: 1
        });

        expect(readPosCustomerDisplaySnapshot(scope)).toMatchObject({
            state: 'active',
            total: 180,
            lines: [{ name: 'Rice bowl', quantity: 1, lineTotal: 180 }]
        });
        expect(received).toHaveLength(1);
        expect(received[0].scope_key).toBe(buildPosCustomerDisplayScopeKey(scope));

        unsubscribe();
    });

    it('expires a snapshot after the bounded display freshness window', () => {
        const snapshot = buildPosCustomerDisplaySnapshot({ scope, cart: [] });
        expect(isPosCustomerDisplaySnapshotFresh(snapshot, snapshot.updated_at + (5 * 60 * 1000))).toBe(true);
        expect(isPosCustomerDisplaySnapshotFresh(snapshot, snapshot.updated_at + (5 * 60 * 1000) + 1)).toBe(false);
    });
});
