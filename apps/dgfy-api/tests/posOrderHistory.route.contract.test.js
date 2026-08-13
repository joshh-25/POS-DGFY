import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('../src/routes/pos.js', import.meta.url), 'utf8');

describe('POS order history route contract', () => {
    it('requires POS view permission and validates the history query', () => {
        expect(routeSource).toContain(
            "router.get('/order-history', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateOnlineOrderHistoryQuery, posController.listOnlineOrderHistory);"
        );
    });
});
