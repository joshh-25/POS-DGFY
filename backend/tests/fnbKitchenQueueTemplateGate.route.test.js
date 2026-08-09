import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

// Issue #178 Phase 21: route-level proof that a template's subtractive
// overlay actually reaches the wired gate - not just that
// requireWorkflowCapability's logic is correct in isolation
// (workflowModeCapability.middleware.test.js already covers that with the
// settings layer mocked out), but that two DIFFERENTLY TEMPLATED TENANTS
// hitting the SAME route, wired exactly as backend/src/routes/fnb.js wires
// it (`requireKitchenQueue = requireWorkflowCapability('kitchenQueue', ...)`),
// get different real outcomes. This is the acceptance criterion the
// original Phase 19 plan called for and the pre-PR audit found missing.
let currentTenantId = 'fnb-full-service-tenant';
const settingsRowsByTenant = {};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: () => ({
            findAll: jest.fn(async () => settingsRowsByTenant[currentTenantId] || [])
        }),
        getStore: () => ({ tenantId: currentTenantId })
    }
}));

const { requireWorkflowCapability } = await import('../src/middleware/workflowModeCapability.js');
const { clearWorkflowCapabilitySettingsCache } = await import(
    '../src/modules/shared/utils/workflowCapabilitySettingsCache.js'
);

const buildRow = (settingKey, value, dataType) => ({
    setting_key: settingKey,
    setting_value: dataType === 'json' ? JSON.stringify(value) : value,
    data_type: dataType
});

// Mirrors backend/src/routes/fnb.js:99 exactly - same capability string,
// same middleware factory, wired onto a route matching its
// GET /kitchen-stations shape.
const requireKitchenQueue = requireWorkflowCapability('kitchenQueue', 'Kitchen Queue');

const buildApp = () => {
    const app = express();
    app.get('/fnb/kitchen-stations', requireKitchenQueue, (_req, res) => (
        res.status(200).json({ success: true, data: [] })
    ));
    return app;
};

describe('fnb kitchen-stations route honors the disabled-capabilities overlay (issue #178 Phase 21)', () => {
    beforeEach(() => {
        clearWorkflowCapabilitySettingsCache();
        Object.keys(settingsRowsByTenant).forEach((key) => delete settingsRowsByTenant[key]);
    });

    it('grants a full-service fnb tenant (no subtraction) - the zero-behavior-change control case', async () => {
        currentTenantId = 'fnb-full-service-tenant';
        settingsRowsByTenant[currentTenantId] = [
            buildRow('ops_workflow_mode', 'fnb', 'string')
        ];

        const response = await request(buildApp()).get('/fnb/kitchen-stations');

        expect(response.status).toBe(200);
    });

    it('denies (403) an fnb_counter_service-templated tenant that subtracted kitchenQueue', async () => {
        currentTenantId = 'fnb-counter-service-tenant';
        settingsRowsByTenant[currentTenantId] = [
            buildRow('ops_workflow_mode', 'fnb', 'string'),
            buildRow('ops_disabled_capabilities', ['tableService', 'kitchenQueue', 'restaurantServiceCharge'], 'json')
        ];

        const response = await request(buildApp()).get('/fnb/kitchen-stations');

        expect(response.status).toBe(403);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            error_code: 'WORKFLOW_MODE_CAPABILITY_DENIED'
        }));
    });

    it('the same two tenants, hit back-to-back through the same cached middleware, resolve independently by tenant', async () => {
        currentTenantId = 'fnb-full-service-tenant';
        settingsRowsByTenant['fnb-full-service-tenant'] = [
            buildRow('ops_workflow_mode', 'fnb', 'string')
        ];
        settingsRowsByTenant['fnb-counter-service-tenant'] = [
            buildRow('ops_workflow_mode', 'fnb', 'string'),
            buildRow('ops_disabled_capabilities', ['tableService', 'kitchenQueue', 'restaurantServiceCharge'], 'json')
        ];

        const app = buildApp();
        const fullServiceResponse = await request(app).get('/fnb/kitchen-stations');
        expect(fullServiceResponse.status).toBe(200);

        currentTenantId = 'fnb-counter-service-tenant';
        const counterServiceResponse = await request(app).get('/fnb/kitchen-stations');
        expect(counterServiceResponse.status).toBe(403);
    });
});
