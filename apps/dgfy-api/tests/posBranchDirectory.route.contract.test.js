import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('../src/routes/pos.js', import.meta.url), 'utf8');

describe('POS branch directory routes', () => {
    it('keeps branch discovery and view telemetry behind the dedicated read capability', () => {
        expect(routeSource).toContain("const branchViewPermission = PERMISSIONS.POS.actions.VIEW_BRANCH_POS;");
        expect(routeSource).toContain("PERMISSIONS.POS.actions.VIEW_BRANCH_POS");
        expect(routeSource).toContain("router.get('/branch-directory', checkPermission(branchViewPermission), posController.getPosBranchDirectory);");
        expect(routeSource).toContain("router.post('/branch-directory/view-events', checkPermission(branchViewPermission), validateBranchViewEvent, posController.recordPosBranchViewEvent);");
    });

    it('keeps governed shift relocation separate from read-only branch viewing', () => {
        expect(routeSource).toContain("router.post('/terminal/shifts/:id/switch-location'");
        expect(routeSource).toContain('checkPermission(PERMISSIONS.POS.actions.SWITCH_LOCATION_POS)');
        expect(routeSource).toContain("router.get('/admin/location-monitor', checkAnyPermission(branchMonitorPermissions)");
    });
});
