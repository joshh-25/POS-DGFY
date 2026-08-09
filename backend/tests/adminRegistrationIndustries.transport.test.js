import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockListAdminRegistrationIndustries = jest.fn((req, res) => res.status(200).json({ success: true, data: { industries: [] } }));
const mockSetRegistrationIndustryVisibility = jest.fn((req, res) => res.status(200).json({
    success: true,
    data: { industry: { key: req.params.industryKey, ...req.validatedData } }
}));
const mockListRegistrationIndustryVisibilityAuditLogs = jest.fn((req, res) => res.status(200).json({ success: true, data: { query: req.validatedQuery } }));

jest.unstable_mockModule('../src/modules/registration/controllers/adminRegistrationIndustryHandlers.js', () => ({
    listAdminRegistrationIndustries: mockListAdminRegistrationIndustries,
    setRegistrationIndustryVisibility: mockSetRegistrationIndustryVisibility,
    listRegistrationIndustryVisibilityAuditLogs: mockListRegistrationIndustryVisibilityAuditLogs
}));

let authenticated = true;
jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticateAdmin: (req, res, next) => {
        if (!authenticated) return res.status(401).json({ success: false, message: 'Unauthorized' });
        req.admin = { id: 1, username: 'platform_admin' };
        return next();
    }
}));

let app;

beforeAll(async () => {
    const router = (await import('../src/routes/adminRegistrationIndustries.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/registration-industries', router);
});

// issue #178 Phase 39: admin curation surface for registration Industry
// visibility, mirroring adminTemplates.transport.test.js's shape.
describe('admin registration-industry visibility transport contracts (issue #178 Phase 39)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        authenticated = true;
    });

    it('rejects every route without an authenticated admin', async () => {
        authenticated = false;

        const listResponse = await request(app).get('/api/v1/admin/registration-industries');
        expect(listResponse.status).toBe(401);
        expect(mockListAdminRegistrationIndustries).not.toHaveBeenCalled();

        const patchResponse = await request(app)
            .patch('/api/v1/admin/registration-industries/micro_fnb/visibility')
            .send({ hidden: true, reason: 'testing' });
        expect(patchResponse.status).toBe(401);
        expect(mockSetRegistrationIndustryVisibility).not.toHaveBeenCalled();

        const auditResponse = await request(app).get('/api/v1/admin/registration-industries/micro_fnb/audit-logs');
        expect(auditResponse.status).toBe(401);
        expect(mockListRegistrationIndustryVisibilityAuditLogs).not.toHaveBeenCalled();
    });

    it('lists industries for an authenticated admin', async () => {
        const response = await request(app).get('/api/v1/admin/registration-industries');
        expect(response.status).toBe(200);
        expect(mockListAdminRegistrationIndustries).toHaveBeenCalledTimes(1);
    });

    it('rejects a visibility update missing reason', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/registration-industries/micro_fnb/visibility')
            .send({ hidden: true });

        expect(response.status).toBe(422);
        expect(response.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['reason']));
        expect(mockSetRegistrationIndustryVisibility).not.toHaveBeenCalled();
    });

    it('rejects a visibility update with a non-boolean hidden', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/registration-industries/micro_fnb/visibility')
            .send({ hidden: 'yes', reason: 'testing a non-boolean value' });

        expect(response.status).toBe(422);
        expect(mockSetRegistrationIndustryVisibility).not.toHaveBeenCalled();
    });

    it('rejects a visibility update with a too-short reason', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/registration-industries/micro_fnb/visibility')
            .send({ hidden: true, reason: 'no' });

        expect(response.status).toBe(422);
        expect(mockSetRegistrationIndustryVisibility).not.toHaveBeenCalled();
    });

    it('passes a valid visibility update through, with the industryKey param intact', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/registration-industries/food_manufacturing/visibility')
            .send({ hidden: true, reason: 'temporarily pausing this vertical' });

        expect(response.status).toBe(200);
        expect(mockSetRegistrationIndustryVisibility.mock.calls[0][0]).toEqual(expect.objectContaining({
            params: expect.objectContaining({ industryKey: 'food_manufacturing' }),
            validatedData: { hidden: true, reason: 'temporarily pausing this vertical' }
        }));
    });

    it('coerces a valid string limit to a number for audit-log listing', async () => {
        const response = await request(app).get('/api/v1/admin/registration-industries/micro_fnb/audit-logs?limit=150');
        expect(response.status).toBe(200);
        expect(mockListRegistrationIndustryVisibilityAuditLogs.mock.calls[0][0].validatedQuery).toEqual({ limit: 150 });
    });

    it('rejects an out-of-range audit-log limit', async () => {
        const response = await request(app).get('/api/v1/admin/registration-industries/micro_fnb/audit-logs?limit=999');
        expect(response.status).toBe(422);
        expect(mockListRegistrationIndustryVisibilityAuditLogs).not.toHaveBeenCalled();
    });
});
