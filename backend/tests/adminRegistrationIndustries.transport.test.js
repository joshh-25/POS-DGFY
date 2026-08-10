import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockListAdminRegistrationIndustries = jest.fn((req, res) => res.status(200).json({ success: true, data: { industries: [] } }));
const mockCreateRegistrationIndustry = jest.fn((req, res) => res.status(201).json({
    success: true,
    data: { industry: { key: req.validatedData?.industry_key, ...req.validatedData } }
}));
const mockUpdateRegistrationIndustry = jest.fn((req, res) => res.status(200).json({
    success: true,
    data: { industry: { key: req.params.industryKey, ...req.validatedData } }
}));
const mockSetRegistrationIndustryVisibility = jest.fn((req, res) => res.status(200).json({
    success: true,
    data: { industry: { key: req.params.industryKey, ...req.validatedData } }
}));
const mockListRegistrationIndustryVisibilityAuditLogs = jest.fn((req, res) => res.status(200).json({ success: true, data: { query: req.validatedQuery } }));

jest.unstable_mockModule('../src/modules/registration/controllers/adminRegistrationIndustryHandlers.js', () => ({
    listAdminRegistrationIndustries: mockListAdminRegistrationIndustries,
    createRegistrationIndustry: mockCreateRegistrationIndustry,
    updateRegistrationIndustry: mockUpdateRegistrationIndustry,
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

const validCreateBody = () => ({
    industry_key: 'pet_grooming',
    label: 'Pet Grooming',
    summary: 'Grooming and boarding services for pets.',
    niches: ['Pet salon', 'Mobile grooming'],
    workflow_mode: 'services',
    template_key: 'services_shop',
    reason: 'New industry vertical'
});

beforeAll(async () => {
    const router = (await import('../src/routes/adminRegistrationIndustries.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/registration-industries', router);
});

// issue #178 Phase 39 (visibility) + issue #316 (full CRUD): admin
// curation surface for the registration Industry catalog, mirroring
// adminTemplates.transport.test.js's shape.
describe('admin registration-industry catalog transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        authenticated = true;
    });

    it('rejects every route without an authenticated admin', async () => {
        authenticated = false;

        const listResponse = await request(app).get('/api/v1/admin/registration-industries');
        expect(listResponse.status).toBe(401);
        expect(mockListAdminRegistrationIndustries).not.toHaveBeenCalled();

        const createResponse = await request(app).post('/api/v1/admin/registration-industries').send(validCreateBody());
        expect(createResponse.status).toBe(401);
        expect(mockCreateRegistrationIndustry).not.toHaveBeenCalled();

        const updateResponse = await request(app)
            .patch('/api/v1/admin/registration-industries/micro_fnb')
            .send({ label: 'Micro F&B', reason: 'testing' });
        expect(updateResponse.status).toBe(401);
        expect(mockUpdateRegistrationIndustry).not.toHaveBeenCalled();

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

    describe('POST / (create)', () => {
        it('rejects a body missing required fields', async () => {
            const response = await request(app).post('/api/v1/admin/registration-industries').send({ label: 'Pet Grooming' });
            expect(response.status).toBe(422);
            expect(mockCreateRegistrationIndustry).not.toHaveBeenCalled();
        });

        it('rejects an invalid industry_key pattern', async () => {
            const response = await request(app)
                .post('/api/v1/admin/registration-industries')
                .send({ ...validCreateBody(), industry_key: 'Pet-Grooming!' });
            expect(response.status).toBe(422);
            expect(mockCreateRegistrationIndustry).not.toHaveBeenCalled();
        });

        it('rejects an unrecognized workflow_mode', async () => {
            const response = await request(app)
                .post('/api/v1/admin/registration-industries')
                .send({ ...validCreateBody(), workflow_mode: 'not_a_real_mode' });
            expect(response.status).toBe(422);
            expect(mockCreateRegistrationIndustry).not.toHaveBeenCalled();
        });

        it('rejects is_system and hidden as unknown fields rather than silently stripping them', async () => {
            const response = await request(app)
                .post('/api/v1/admin/registration-industries')
                .send({ ...validCreateBody(), is_system: true, hidden: false });
            expect(response.status).toBe(422);
            expect(mockCreateRegistrationIndustry).not.toHaveBeenCalled();
        });

        it('rejects a too-short reason', async () => {
            const response = await request(app)
                .post('/api/v1/admin/registration-industries')
                .send({ ...validCreateBody(), reason: 'no' });
            expect(response.status).toBe(422);
            expect(mockCreateRegistrationIndustry).not.toHaveBeenCalled();
        });

        it('passes a valid create request through, defaulting niches and template_key', async () => {
            const { niches, template_key, ...rest } = validCreateBody();
            const response = await request(app).post('/api/v1/admin/registration-industries').send(rest);

            expect(response.status).toBe(201);
            expect(mockCreateRegistrationIndustry.mock.calls[0][0].validatedData).toEqual(expect.objectContaining({
                industry_key: 'pet_grooming',
                niches: [],
                template_key: null
            }));
        });
    });

    describe('PATCH /:industryKey (update)', () => {
        it('rejects an empty body (no editable field, no reason)', async () => {
            const response = await request(app).patch('/api/v1/admin/registration-industries/micro_fnb').send({});
            expect(response.status).toBe(422);
            expect(mockUpdateRegistrationIndustry).not.toHaveBeenCalled();
        });

        it('rejects a body with a reason but no editable field', async () => {
            const response = await request(app)
                .patch('/api/v1/admin/registration-industries/micro_fnb')
                .send({ reason: 'trying to update nothing' });
            expect(response.status).toBe(422);
            expect(mockUpdateRegistrationIndustry).not.toHaveBeenCalled();
        });

        it('rejects industry_key, is_system, and hidden as unknown fields', async () => {
            const response = await request(app)
                .patch('/api/v1/admin/registration-industries/micro_fnb')
                .send({ industry_key: 'renamed', label: 'New label', reason: 'testing' });
            expect(response.status).toBe(422);
            expect(mockUpdateRegistrationIndustry).not.toHaveBeenCalled();
        });

        it('passes a valid single-field update through, with the industryKey param intact', async () => {
            const response = await request(app)
                .patch('/api/v1/admin/registration-industries/micro_fnb')
                .send({ label: 'Micro F&B, Carinderia', reason: 'clarifying the label' });

            expect(response.status).toBe(200);
            expect(mockUpdateRegistrationIndustry.mock.calls[0][0]).toEqual(expect.objectContaining({
                params: expect.objectContaining({ industryKey: 'micro_fnb' }),
                validatedData: { label: 'Micro F&B, Carinderia', reason: 'clarifying the label' }
            }));
        });

        it('allows template_key: null explicitly through', async () => {
            const response = await request(app)
                .patch('/api/v1/admin/registration-industries/pet_grooming')
                .send({ workflow_mode: 'ticketing_transport', template_key: null, reason: 're-classifying as external' });

            expect(response.status).toBe(200);
            expect(mockUpdateRegistrationIndustry.mock.calls[0][0].validatedData).toEqual(expect.objectContaining({
                workflow_mode: 'ticketing_transport',
                template_key: null
            }));
        });
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
