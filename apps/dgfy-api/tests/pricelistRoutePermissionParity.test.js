// Regression test for #718: routes/pricelists.js had no legacy-permission fallback arm, unlike
// routes/vouchers.js. `resolveEffectivePermissions` (utils/userPermissions.js) only falls back to
// role defaults when a user's *stored* permissions array is empty, so any admin/manager whose
// stored array predates #655's PERMISSIONS.VOUCHERS group -- on any deploy path that skips
// scripts/deploy.sh's backfill step, e.g. the containerized GHCR path -- got 200 on
// POST /api/v1/vouchers and 403 on every /api/v1/pricelists route.
//
// This mounts the real checkAnyPermission middleware with the exact permission constants
// pricelists.js's own canViewPricelists/canManagePricelists build from (not raw strings), the same
// pattern tenantCapabilityRouteGates.test.js already uses for a real Express route probe.

import express from 'express';
import request from 'supertest';
import { checkAnyPermission } from '../src/middleware/auth.js';
import { PERMISSIONS } from '../src/config/permissions.js';

const canViewPricelists = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.VIEW,
    PERMISSIONS.VOUCHERS.actions.MANAGE,
    PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
    PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
]);

const canManagePricelists = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.MANAGE,
    PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
]);

const buildApp = (permissions) => {
    const app = express();
    app.use((req, _res, next) => {
        req.user = { permissions, is_master_admin: false };
        next();
    });
    app.get('/view-probe', canViewPricelists, (_req, res) => res.status(200).json({ success: true }));
    app.post('/manage-probe', canManagePricelists, (_req, res) => res.status(200).json({ success: true }));
    return app;
};

describe('#718 pricelist route permission parity with routes/vouchers.js', () => {
    it('a user with only the legacy settings:view permission reaches the view routes', async () => {
        const app = buildApp(['settings:view']);
        const response = await request(app).get('/view-probe');
        expect(response.status).toBe(200);
    });

    it('a user with only the legacy settings:edit permission reaches the manage routes', async () => {
        const app = buildApp(['settings:edit']);
        const viewResponse = await request(app).get('/view-probe');
        const manageResponse = await request(app).post('/manage-probe');
        expect(viewResponse.status).toBe(200);
        expect(manageResponse.status).toBe(200);
    });

    it('settings:view alone still cannot reach the manage routes', async () => {
        const app = buildApp(['settings:view']);
        const response = await request(app).post('/manage-probe');
        expect(response.status).toBe(403);
    });

    it('a user with only vouchers:view reaches view but not manage routes', async () => {
        const app = buildApp(['vouchers:view']);
        const viewResponse = await request(app).get('/view-probe');
        const manageResponse = await request(app).post('/manage-probe');
        expect(viewResponse.status).toBe(200);
        expect(manageResponse.status).toBe(403);
    });

    it('a user with vouchers:manage reaches both view and manage routes', async () => {
        const app = buildApp(['vouchers:manage']);
        const viewResponse = await request(app).get('/view-probe');
        const manageResponse = await request(app).post('/manage-probe');
        expect(viewResponse.status).toBe(200);
        expect(manageResponse.status).toBe(200);
    });

    it('an unrelated permission reaches neither route', async () => {
        const app = buildApp(['items:view']);
        const viewResponse = await request(app).get('/view-probe');
        const manageResponse = await request(app).post('/manage-probe');
        expect(viewResponse.status).toBe(403);
        expect(manageResponse.status).toBe(403);
    });
});
