import express from 'express';
import request from 'supertest';
import { afterEach, jest } from '@jest/globals';
import {
    clearTenantCapabilityCache,
    invalidateTenantCapabilityCache
} from '../src/modules/shared/utils/tenantCapabilitySettingCache.js';

let currentStore = {};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        getStore: () => currentStore
    }
}));

const { checkAnyPermission, requireTenantCapability } = await import('../src/middleware/auth.js');

const buildSystemSetting = (value) => {
    let currentValue = value;
    return {
        findOne: jest.fn().mockImplementation(async () => (
            currentValue === undefined ? null : { setting_value: currentValue }
        )),
        setValue: (nextValue) => {
            currentValue = nextValue;
        }
    };
};

const buildCapabilityApp = ({ status = 'active', settingKey = 'tenant_ims_enabled' } = {}) => {
    const app = express();
    app.get('/capability-probe',
        (req, _res, next) => {
            req.tenant = { id: 'tenant-1', status };
            next();
        },
        requireTenantCapability(settingKey, 'Capability'),
        (_req, res) => res.status(200).json({ success: true })
    );
    return app;
};

describe('tenant capability route gates', () => {
    beforeEach(() => {
        currentStore = {};
        clearTenantCapabilityCache();
    });

    afterEach(() => jest.restoreAllMocks());

    it('returns TENANT_CAPABILITY_DISABLED when IMS is disabled for an active tenant', async () => {
        currentStore = {
            SystemSetting: buildSystemSetting('false')
        };
        const app = express();
        app.get('/ims-probe',
            (req, _res, next) => {
                req.tenant = { id: 'tenant-1', status: 'active' };
                next();
            },
            requireTenantCapability('tenant_ims_enabled', 'IMS'),
            (_req, res) => res.status(200).json({ success: true })
        );

        const response = await request(app).get('/ims-probe');

        expect(response.status).toBe(403);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            code: 'TENANT_CAPABILITY_DISABLED',
            capability: 'tenant_ims_enabled'
        }));
    });

    it('removes POS fallback permissions when POS is disabled', async () => {
        currentStore = {
            SystemSetting: buildSystemSetting('false')
        };
        const app = express();
        app.get('/fallback-probe',
            (req, _res, next) => {
                req.tenant = { id: 'tenant-1', status: 'active' };
                req.user = {
                    permissions: ['pos:view']
                };
                next();
            },
            checkAnyPermission(['pos:view', 'inventory:view']),
            (_req, res) => res.status(200).json({ success: true })
        );

        const response = await request(app).get('/fallback-probe');

        expect(response.status).toBe(403);
        expect(response.body).toEqual(expect.objectContaining({
            success: false,
            required: ['inventory:view']
        }));
        const secondResponse = await request(app).get('/fallback-probe');
        expect(secondResponse.status).toBe(403);
        expect(currentStore.SystemSetting.findOne).toHaveBeenCalledTimes(1);
    });

    it('loads a capability once for repeated requests in the same tenant TTL', async () => {
        const SystemSetting = buildSystemSetting('true');
        currentStore = { SystemSetting };
        const app = buildCapabilityApp();

        expect((await request(app).get('/capability-probe')).status).toBe(200);
        expect((await request(app).get('/capability-probe')).status).toBe(200);
        expect(SystemSetting.findOne).toHaveBeenCalledTimes(1);
    });

    it('honors a changed value after TTL expiry and immediately after tenant invalidation', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
        const SystemSetting = buildSystemSetting('true');
        currentStore = { SystemSetting };
        const app = buildCapabilityApp();

        expect((await request(app).get('/capability-probe')).status).toBe(200);
        SystemSetting.setValue('false');
        now.mockReturnValue(16_000);
        expect((await request(app).get('/capability-probe')).status).toBe(403);

        SystemSetting.setValue('true');
        invalidateTenantCapabilityCache('tenant-1');
        expect((await request(app).get('/capability-probe')).status).toBe(200);
        expect(SystemSetting.findOne).toHaveBeenCalledTimes(3);
    });

    it('keeps absent capability settings enabled by default', async () => {
        const SystemSetting = buildSystemSetting(undefined);
        currentStore = { SystemSetting };
        const app = buildCapabilityApp();

        expect((await request(app).get('/capability-probe')).status).toBe(200);
        expect(SystemSetting.findOne).toHaveBeenCalledTimes(1);
    });

    it('skips capability lookups for inactive tenants or missing settings models', async () => {
        const SystemSetting = buildSystemSetting('false');
        currentStore = { SystemSetting };
        const inactiveApp = buildCapabilityApp({ status: 'inactive' });
        expect((await request(inactiveApp).get('/capability-probe')).status).toBe(200);
        expect(SystemSetting.findOne).not.toHaveBeenCalled();

        currentStore = {};
        const noSettingsApp = buildCapabilityApp();
        expect((await request(noSettingsApp).get('/capability-probe')).status).toBe(200);
    });
});
