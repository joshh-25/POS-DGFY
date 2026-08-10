import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

let currentStore = {};

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        getStore: () => currentStore
    }
}));

const { checkAnyPermission, requireTenantCapability } = await import('../src/middleware/auth.js');

const buildSystemSetting = (value) => ({
    findOne: jest.fn().mockResolvedValue(value === undefined ? null : { setting_value: value })
});

describe('tenant capability route gates', () => {
    beforeEach(() => {
        currentStore = {};
    });

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
    });
});
