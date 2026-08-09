import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockListTemplates = jest.fn((req, res) => res.status(200).json({ success: true, data: { query: req.validatedQuery } }));
const mockGetTemplate = jest.fn((req, res) => res.status(200).json({ success: true, data: { id: req.params.id } }));
const mockListTemplateAuditLogs = jest.fn((req, res) => res.status(200).json({ success: true, data: { query: req.validatedQuery } }));
const mockCreateDraftTemplate = jest.fn((req, res) => res.status(201).json({ success: true, data: { validated: req.validatedData } }));
const mockUpdateTemplateModules = jest.fn((req, res) => res.status(200).json({ success: true, data: { validated: req.validatedData } }));
const mockPublishTemplate = jest.fn((req, res) => res.status(200).json({ success: true, data: { validated: req.validatedData } }));
const mockDeprecateTemplate = jest.fn((req, res) => res.status(200).json({ success: true, data: { validated: req.validatedData } }));

jest.unstable_mockModule('../src/modules/templates/controllers/storeConfigurationTemplateHandlers.js', () => ({
    listTemplates: mockListTemplates,
    getTemplate: mockGetTemplate,
    listTemplateAuditLogs: mockListTemplateAuditLogs,
    createDraftTemplate: mockCreateDraftTemplate,
    updateTemplateModules: mockUpdateTemplateModules,
    publishTemplate: mockPublishTemplate,
    deprecateTemplate: mockDeprecateTemplate
}));

jest.unstable_mockModule('../src/middleware/auth.js', () => ({
    authenticateAdmin: (req, _res, next) => {
        req.admin = { id: 1, username: 'platform_admin' };
        next();
    }
}));

let app;

beforeAll(async () => {
    const router = (await import('../src/routes/adminTemplates.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/admin/templates', router);
});

describe('admin template curation transport contracts (issue #178 Phase 14)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejects a create-draft payload with an invalid module key', async () => {
        const response = await request(app)
            .post('/api/v1/admin/templates')
            .send({
                template_key: 'my_template',
                label: 'My Template',
                base_mode: 'retail',
                module_keys: ['not_a_real_module']
            });

        expect(response.status).toBe(422);
        expect(response.body.success).toBe(false);
        expect(mockCreateDraftTemplate).not.toHaveBeenCalled();
    });

    it('rejects a create-draft payload with an invalid template_key format', async () => {
        const response = await request(app)
            .post('/api/v1/admin/templates')
            .send({
                template_key: 'Not Valid!',
                label: 'X',
                base_mode: 'retail',
                module_keys: ['catalog']
            });

        expect(response.status).toBe(422);
        expect(mockCreateDraftTemplate).not.toHaveBeenCalled();
    });

    it('passes a valid create-draft payload through to the handler', async () => {
        const response = await request(app)
            .post('/api/v1/admin/templates')
            .send({
                template_key: 'retail_lean',
                label: 'Lean Retail',
                base_mode: 'retail',
                module_keys: ['catalog', 'pos']
            });

        expect(response.status).toBe(201);
        expect(mockCreateDraftTemplate).toHaveBeenCalledTimes(1);
        expect(mockCreateDraftTemplate.mock.calls[0][0].validatedData).toEqual(expect.objectContaining({
            template_key: 'retail_lean',
            label: 'Lean Retail',
            base_mode: 'retail',
            module_keys: ['catalog', 'pos']
        }));
    });

    it('rejects updating modules without a reason', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/templates/5/modules')
            .send({ module_keys: ['catalog'] });

        expect(response.status).toBe(422);
        expect(response.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['reason']));
        expect(mockUpdateTemplateModules).not.toHaveBeenCalled();
    });

    it('passes a valid modules-update payload through, with the id param intact', async () => {
        const response = await request(app)
            .patch('/api/v1/admin/templates/5/modules')
            .send({ module_keys: ['catalog', 'pos'], reason: 'adjusting the lean retail bundle' });

        expect(response.status).toBe(200);
        expect(mockUpdateTemplateModules.mock.calls[0][0]).toEqual(expect.objectContaining({
            params: expect.objectContaining({ id: '5' }),
            validatedData: { module_keys: ['catalog', 'pos'], reason: 'adjusting the lean retail bundle' }
        }));
    });

    it('rejects publish/deprecate without a reason', async () => {
        const publishResponse = await request(app).post('/api/v1/admin/templates/5/publish').send({});
        expect(publishResponse.status).toBe(422);
        expect(mockPublishTemplate).not.toHaveBeenCalled();

        const deprecateResponse = await request(app).post('/api/v1/admin/templates/5/deprecate').send({});
        expect(deprecateResponse.status).toBe(422);
        expect(mockDeprecateTemplate).not.toHaveBeenCalled();
    });

    it('passes publish/deprecate through with a valid reason', async () => {
        const publishResponse = await request(app)
            .post('/api/v1/admin/templates/5/publish')
            .send({ reason: 'ready for general availability' });
        expect(publishResponse.status).toBe(200);
        expect(mockPublishTemplate).toHaveBeenCalledTimes(1);

        const deprecateResponse = await request(app)
            .post('/api/v1/admin/templates/5/deprecate')
            .send({ reason: 'superseded by a newer template' });
        expect(deprecateResponse.status).toBe(200);
        expect(mockDeprecateTemplate).toHaveBeenCalledTimes(1);
    });

    it('rejects an unsupported status filter on list', async () => {
        const response = await request(app).get('/api/v1/admin/templates?status=archived');
        expect(response.status).toBe(422);
        expect(mockListTemplates).not.toHaveBeenCalled();
    });

    it('coerces a valid string limit to a number before calling the handler', async () => {
        const response = await request(app).get('/api/v1/admin/templates/5/audit-logs?limit=150');
        expect(response.status).toBe(200);
        expect(mockListTemplateAuditLogs.mock.calls[0][0].validatedQuery).toEqual({ limit: 150 });
    });

    it('rejects an out-of-range audit-log limit', async () => {
        const response = await request(app).get('/api/v1/admin/templates/5/audit-logs?limit=999');
        expect(response.status).toBe(422);
        expect(mockListTemplateAuditLogs).not.toHaveBeenCalled();
    });
});
