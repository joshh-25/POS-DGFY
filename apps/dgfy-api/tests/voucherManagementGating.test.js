// Regression test for #1493 (Phase 263): voucher-campaign MANAGEMENT is Admin + Accounting only.
//
// The hole this pins shut: routes/vouchers.js's `canManageVouchers` used to accept
// `SYSTEM.EDIT_SETTINGS` as a second arm (#655's dual-gate). `settings:edit` is a permission every
// compatibility-role `manager` holds by default, so restricting `vouchers:manage` alone changed
// nothing at all -- the restriction was unenforceable while that arm stood.
//
// Two kinds of assertion here, deliberately:
//   1. Behavioral probes through the real `checkAnyPermission` middleware, following the same
//      pattern tests/pricelistRoutePermissionParity.test.js (#718) already established.
//   2. A source-text assertion binding those probes to routes/vouchers.js itself. The probes below
//      rebuild the gate from PERMISSIONS constants rather than importing it (the route module does
//      not export its gates), so on their own they would keep passing if someone re-added the
//      legacy arm to the real route. The source check is what makes that impossible to do quietly.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import request from 'supertest';
import { checkAnyPermission } from '../src/middleware/auth.js';
import { PERMISSIONS } from '../src/config/permissions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors routes/vouchers.js post-#1493.
const canViewVouchers = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.VIEW,
    PERMISSIONS.VOUCHERS.actions.MANAGE,
    PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS,
    PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS
]);

const canManageVouchers = checkAnyPermission([
    PERMISSIONS.VOUCHERS.actions.MANAGE
]);

const buildApp = (permissions, { isMasterAdmin = false } = {}) => {
    const app = express();
    app.use((req, _res, next) => {
        req.user = { permissions, is_master_admin: isMasterAdmin };
        next();
    });
    app.get('/view-probe', canViewVouchers, (_req, res) => res.status(200).json({ success: true }));
    app.post('/manage-probe', canManageVouchers, (_req, res) => res.status(200).json({ success: true }));
    return app;
};

describe('#1493 voucher management is restricted to Admin + Accounting', () => {
    it('refuses management to a manager holding only the legacy settings:edit permission', async () => {
        const response = await request(buildApp(['settings:edit'])).post('/manage-probe');
        expect(response.status).toBe(403);
    });

    it('still lets that same manager VIEW campaigns -- #1493 restricts management, not read access', async () => {
        const response = await request(buildApp(['settings:edit'])).get('/view-probe');
        expect(response.status).toBe(200);
    });

    it('lets vouchers:view alone reach the view routes but not the manage routes', async () => {
        const app = buildApp(['vouchers:view']);
        expect((await request(app).get('/view-probe')).status).toBe(200);
        expect((await request(app).post('/manage-probe')).status).toBe(403);
    });

    it('lets vouchers:manage -- the Accounting preset and admin -- through both', async () => {
        const app = buildApp(['vouchers:manage']);
        expect((await request(app).get('/view-probe')).status).toBe(200);
        expect((await request(app).post('/manage-probe')).status).toBe(200);
    });

    it('keeps the is_master_admin bypass intact as the recovery path', async () => {
        const app = buildApp([], { isMasterAdmin: true });
        expect((await request(app).post('/manage-probe')).status).toBe(200);
    });

    it('binds the probes above to routes/vouchers.js: canManageVouchers has no legacy SYSTEM arm', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'vouchers.js'), 'utf8');
        const manageGate = source.match(/const canManageVouchers = checkAnyPermission\(\[([\s\S]*?)\]\);/);
        expect(manageGate).not.toBeNull();
        expect(manageGate[1]).toContain('PERMISSIONS.VOUCHERS.actions.MANAGE');
        expect(manageGate[1]).not.toContain('SYSTEM');

        // canViewVouchers is deliberately unchanged -- assert that too, so a later "cleanup" that
        // strips the legacy arms from BOTH gates fails here instead of silently taking voucher
        // visibility away from every settings-capable manager.
        const viewGate = source.match(/const canViewVouchers = checkAnyPermission\(\[([\s\S]*?)\]\);/);
        expect(viewGate).not.toBeNull();
        expect(viewGate[1]).toContain('PERMISSIONS.SYSTEM.actions.VIEW_SETTINGS');
        expect(viewGate[1]).toContain('PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS');
    });
});
