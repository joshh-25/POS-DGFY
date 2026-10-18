import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('../src/routes/pos.js', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
const validatorSource = readFileSync(new URL('../src/validators/posValidator.js', import.meta.url), 'utf8');
const handlerSource = readFileSync(new URL('../src/modules/pushDelivery/controllers/staffPushTokenHandlers.js', import.meta.url), 'utf8');

describe('POS staff push token routes', () => {
    it('mounts the routes under the authenticated POS middleware and applies the pos:view gate', () => {
        expect(serverSource).toContain("app.use('/api/v1/pos', posRoutes);");
        expect(routeSource).toContain('router.use(authenticate);');
        expect(routeSource).toContain('router.use(requirePosDeviceProof);');
        expect(routeSource).toContain("router.post('/staff-push-tokens', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateStaffPushTokenRegistration, staffPushTokenHandlers.registerPosStaffPushToken);");
        expect(routeSource).toContain("router.delete('/staff-push-tokens', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateStaffPushTokenDeletion, staffPushTokenHandlers.deletePosStaffPushToken);");
    });

    it('validates the POS app enum and derives ownership from the authenticated user', () => {
        expect(validatorSource).toContain("valid('pos', 'fiscalpos')");
        expect(validatorSource).toContain("valid('ios', 'android')");
        expect(validatorSource).toContain('previous_token');
        expect(handlerSource).toContain('tenantId: req.user?.tenant_id');
        expect(handlerSource).toContain('userId: req.user?.user_id');
        expect(handlerSource).not.toContain('tenantId: req.body');
        expect(handlerSource).not.toContain('userId: req.body');
    });

    it('never dispatches from the polling GET route', () => {
        const incomingOrdersRoute = routeSource.match(/router\.get\('\/incoming-orders'[^;]+;/)?.[0] || '';
        expect(incomingOrdersRoute).toContain('posController.listIncomingOnlineOrders');
        expect(incomingOrdersRoute).not.toContain('dispatchStaffNewOnlineOrderPush');
    });
});
