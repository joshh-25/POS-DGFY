import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const state = {
    user: null,
    findOne: jest.fn(),
    updateDineInPaymentPolicy: jest.fn((_req, res) => res.status(200).json({ success: true }))
};

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticate: (req, _res, next) => {
        req.user = state.user;
        next();
    },
    checkPermission: () => (_req, _res, next) => next()
}));

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
    default: {
        get: (modelName) => modelName === 'UserLocationGrant'
            ? { findOne: state.findOne }
            : undefined
    }
}));

jest.unstable_mockModule('../src/controllers/tenantLocationController.js', () => ({
    listTenantLocations: jest.fn(),
    createTenantLocation: jest.fn(),
    updateTenantLocation: jest.fn(),
    updateDineInPaymentPolicy: (...args) => state.updateDineInPaymentPolicy(...args),
    deactivateTenantLocation: jest.fn(),
    deleteTenantLocation: jest.fn()
}));

const { default: tenantLocationsRouter } = await import('../src/routes/tenantLocations.js');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/tenant-locations', tenantLocationsRouter);
    return app;
};

describe('tenant-location dine-in payment policy route', () => {
    beforeEach(() => {
        state.user = {
            user_id: 42,
            role: 'manager',
            is_master_admin: false,
            permissions: ['downpayment:settings']
        };
        state.findOne.mockReset();
        state.updateDineInPaymentPolicy.mockClear();
    });

    it('does not throw before checking a non-admin user grant for the selected branch', async () => {
        state.findOne.mockResolvedValue({ user_id: 42, location_id: 7 });

        const response = await request(buildApp())
            .put('/tenant-locations/7/dine-in-payment-policy')
            .send({ allow_dine_in_pay_at_store: true });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
        expect(state.findOne).toHaveBeenCalledWith({
            where: { user_id: 42, location_id: 7 }
        });
        expect(state.updateDineInPaymentPolicy).toHaveBeenCalledTimes(1);
    });

    it('denies a non-admin user without a grant for the selected branch', async () => {
        state.findOne.mockResolvedValue(null);

        const response = await request(buildApp())
            .put('/tenant-locations/7/dine-in-payment-policy')
            .send({ allow_dine_in_pay_at_store: true });

        expect(response.status).toBe(403);
        expect(response.body.error_code).toBe('BUSINESS_ADMIN_BRANCH_ACCESS_DENIED');
        expect(state.updateDineInPaymentPolicy).not.toHaveBeenCalled();
    });
});
