// #2159 Legacy Promos route contract. The middleware behavior itself is covered by
// voucherManagementGating.test.js's probes against the real `checkAnyPermission`; these assertions
// bind the new routes to the intended gates and pin the registration order that keeps the static
// `/legacy-promos` path from being captured by the numeric `/:voucher_id` route.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routeSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'vouchers.js'), 'utf8');

describe('#2159 legacy promo route gating and ordering', () => {
    it('gates the list route with the existing voucher view gate', () => {
        expect(routeSource).toMatch(/router\.get\(\s*'\/legacy-promos',\s*authenticate,\s*canViewVouchers,\s*listLegacyPromos/s);
    });

    it('gates revocation strictly with vouchers:manage -- no settings:edit arm', () => {
        expect(routeSource).toMatch(/router\.post\(\s*'\/legacy-promos\/revoke',\s*authenticate,\s*canManageVouchers,\s*validateLegacyPromoRevoke,\s*revokeLegacyPromo/s);
        const manageGate = routeSource.match(/const canManageVouchers = checkAnyPermission\(\[([\s\S]*?)\]\);/);
        expect(manageGate).not.toBeNull();
        expect(manageGate[1]).toContain('PERMISSIONS.VOUCHERS.actions.MANAGE');
        expect(manageGate[1]).not.toContain('SYSTEM');
    });

    it('registers the static legacy path before the numeric voucher-id route', () => {
        const legacyIndex = routeSource.indexOf("'/legacy-promos'");
        const voucherIdIndex = routeSource.indexOf("'/:voucher_id'");
        expect(legacyIndex).toBeGreaterThan(-1);
        expect(voucherIdIndex).toBeGreaterThan(-1);
        expect(legacyIndex).toBeLessThan(voucherIdIndex);
    });
});
