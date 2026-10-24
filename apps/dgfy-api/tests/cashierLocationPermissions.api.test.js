import express from 'express';
import request from 'supertest';
import { checkPermission } from '../src/middleware/auth.js';
import { resolveEffectivePermissions } from '../src/utils/userPermissions.js';

// Real Express permission boundary; authentication/identity is a fixture here.
// No database or item writes are made by this contract test.
describe('Phase 355 item-update HTTP authorization', () => {
    test.each([
        ['default cashier', { role: 'cashier' }, 403],
        ['view-only cashier', { role: 'cashier', permissions: ['items:view'] }, 403],
        ['delegated editor', { role: 'cashier', permissions: ['items:view', 'items:edit'] }, 200],
        ['manager without edit', { role: 'manager', permissions: ['items:view'] }, 403],
        ['admin editor without POS shift', { role: 'admin', permissions: ['items:view', 'items:edit'] }, 200]
    ])('%s receives %i', async (_label, actor, expected) => {
        const app = express();
        app.use((req, _res, next) => { req.user = { ...actor, permissions: resolveEffectivePermissions(actor) }; next(); });
        app.put('/items/1', checkPermission('items:edit'), (_req, res) => res.json({ success: true }));
        const response = await request(app).put('/items/1').send({ name: 'Edited' });
        expect(response.status).toBe(expected);
        if (expected === 403) expect(response.body.error_code).toBe('PERMISSION_DENIED');
    });
});
