import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const posRoutesPath = path.resolve(__dirname, '../src/routes/pos.js');
const complianceRoutesPath = path.resolve(__dirname, '../src/routes/compliance.js');
const adminTenantRoutesPath = path.resolve(__dirname, '../src/routes/adminTenants.js');
const settingsRoutesPath = path.resolve(__dirname, '../src/routes/settings.js');
const rbacMatrixPath = path.resolve(__dirname, '../../docs/compliance/evidence/rbac-sensitive-action-matrix.md');

const escapeRegexLiteral = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractRouteDeclaration = ({ source, method, routePath }) => {
    const methodPattern = escapeRegexLiteral(method);
    const pathPattern = escapeRegexLiteral(routePath);
    const matcher = new RegExp(`router\\.${methodPattern}\\(\\s*['"]${pathPattern}['"][\\s\\S]{0,520}?\\);`, 'm');
    const match = matcher.exec(source);
    return match ? match[0] : null;
};

const expectRouteContract = ({ source, method, routePath, requiredFragments = [] }) => {
    const routeDeclaration = extractRouteDeclaration({ source, method, routePath });
    expect(routeDeclaration).not.toBeNull();
    requiredFragments.forEach((fragment) => {
        if (fragment instanceof RegExp) {
            expect(routeDeclaration).toMatch(fragment);
            return;
        }
        expect(routeDeclaration).toContain(fragment);
    });
};

describe('RBAC-01 route-to-permission coverage contracts', () => {
    let posRoutes = '';
    let complianceRoutes = '';
    let adminTenantRoutes = '';
    let settingsRoutes = '';
    let rbacMatrix = '';

    beforeAll(() => {
        posRoutes = fs.readFileSync(posRoutesPath, 'utf8');
        complianceRoutes = fs.readFileSync(complianceRoutesPath, 'utf8');
        adminTenantRoutes = fs.readFileSync(adminTenantRoutesPath, 'utf8');
        settingsRoutes = fs.readFileSync(settingsRoutesPath, 'utf8');
        rbacMatrix = fs.readFileSync(rbacMatrixPath, 'utf8');
    });

    it('guards storefront branding asset routes with dedicated storefront branding permission middleware', () => {
        expectRouteContract({
            source: settingsRoutes,
            method: 'post',
            routePath: '/storefront-assets/:asset_type',
            requiredFragments: [
                'authenticate',
                'checkStorefrontBrandingEditPermission',
                'validateStorefrontAssetTypeParam',
                'storefrontAssetUpload.single(\'image\')',
                'settingsController.uploadStorefrontAsset'
            ]
        });
        expectRouteContract({
            source: settingsRoutes,
            method: 'delete',
            routePath: '/storefront-assets/:asset_type',
            requiredFragments: [
                'authenticate',
                'checkStorefrontBrandingEditPermission',
                'validateStorefrontAssetTypeParam',
                'settingsController.deleteStorefrontAsset'
            ]
        });
    });

    it('guards compliance activation and profile mutation routes with edit-settings permission', () => {
        expectRouteContract({
            source: complianceRoutes,
            method: 'post',
            routePath: '/activate',
            requiredFragments: [
                'checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS)',
                'validateComplianceActivateMode',
                'complianceController.activateCompliantMode'
            ]
        });
        expectRouteContract({
            source: complianceRoutes,
            method: 'put',
            routePath: '/profile',
            requiredFragments: [
                'checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS)',
                'validateComplianceProfilePatch',
                'complianceController.updateComplianceProfile'
            ]
        });
        expectRouteContract({
            source: complianceRoutes,
            method: 'post',
            routePath: '/mode/revert-to-non-compliant',
            requiredFragments: [
                'checkPermission(PERMISSIONS.SYSTEM.actions.EDIT_SETTINGS)',
                'validateComplianceModeDowngrade',
                'complianceController.revertToNonCompliantMode'
            ]
        });
    });

    it('guards POS terminal mutation routes with explicit action permissions', () => {
        expectRouteContract({
            source: posRoutes,
            method: 'post',
            routePath: '/terminal/shifts/open',
            requiredFragments: [
                'checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS)',
                'validateOpenTerminalShift',
                'posController.openTerminalShift'
            ]
        });
        expectRouteContract({
            source: posRoutes,
            method: 'post',
            routePath: '/terminal/shifts/:id/cash-events',
            requiredFragments: [
                'checkPermission(PERMISSIONS.POS.actions.ADJUST_CASH_DRAWER)',
                'validateShiftIdParam',
                'validateCashDrawerEvent',
                'posController.recordCashDrawerEvent'
            ]
        });
        expectRouteContract({
            source: posRoutes,
            method: 'post',
            routePath: '/terminal/shifts/:id/close',
            requiredFragments: [
                'checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS)',
                'validateShiftIdParam',
                'validateCloseTerminalShift',
                'posController.closeTerminalShift'
            ]
        });
        expectRouteContract({
            source: posRoutes,
            method: 'patch',
            routePath: '/orders/:id/status',
            requiredFragments: [
                'checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS)',
                'validatePosTransactionIdParam',
                'validateUpdateOnlineOrderStatus',
                'posController.updateOnlineOrderStatus'
            ]
        });
    });

    it('guards admin incident-review routes with admin authentication and action validation', () => {
        expectRouteContract({
            source: adminTenantRoutes,
            method: 'get',
            routePath: '/:id/compliance/security-incidents',
            requiredFragments: [
                'authenticateAdmin',
                'validateComplianceSecurityIncidentQuery',
                'adminListComplianceSecurityIncidents'
            ]
        });
        expectRouteContract({
            source: adminTenantRoutes,
            method: 'post',
            routePath: '/:id/compliance/security-incidents/:incident_id/acknowledge',
            requiredFragments: [
                'authenticateAdmin',
                'validateComplianceSecurityIncidentParam',
                'validateComplianceSecurityIncidentAction',
                'adminAcknowledgeComplianceSecurityIncident'
            ]
        });
        expectRouteContract({
            source: adminTenantRoutes,
            method: 'post',
            routePath: '/:id/compliance/security-incidents/:incident_id/resolve',
            requiredFragments: [
                'authenticateAdmin',
                'validateComplianceSecurityIncidentParam',
                'validateComplianceSecurityIncidentAction',
                'adminResolveComplianceSecurityIncident'
            ]
        });
        expectRouteContract({
            source: adminTenantRoutes,
            method: 'post',
            routePath: '/:id/compliance/mode/select',
            requiredFragments: [
                'authenticateAdmin',
                'validateAdminComplianceModeChoice',
                'adminSelectComplianceMode'
            ]
        });
        expectRouteContract({
            source: adminTenantRoutes,
            method: 'post',
            routePath: '/:id/compliance/mode/upgrade',
            requiredFragments: [
                'authenticateAdmin',
                'validateAdminComplianceModeUpgrade',
                'adminUpgradeComplianceMode'
            ]
        });
        expectRouteContract({
            source: adminTenantRoutes,
            method: 'post',
            routePath: '/:id/force-non-compliant',
            requiredFragments: [
                'authenticateAdmin',
                'validateComplianceModeDowngrade',
                'adminForceNonCompliant'
            ]
        });
    });

    it('keeps route evidence synced with the RBAC sensitive action matrix', () => {
        [
            '/terminal/shifts/open',
            '/terminal/shifts/:id/cash-events',
            '/terminal/shifts/:id/close',
            '/z-reading/close-day',
            'PUT /profile',
            'POST /activate',
            'POST /mode/revert-to-non-compliant',
            '/:id/compliance/security-incidents/:incident_id/acknowledge',
            '/:id/compliance/security-incidents/:incident_id/resolve',
            '/:id/compliance/mode/select',
            '/:id/compliance/mode/upgrade',
            '/:id/force-non-compliant'
        ].forEach((token) => {
            expect(rbacMatrix).toContain(token);
        });
    });
});
