import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';

const mockFindByKey = jest.fn();
const mockFindHiddenKeys = jest.fn();

jest.unstable_mockModule('../src/modules/templates/repositories/storeConfigurationTemplateRepository.js', () => ({
    storeConfigurationTemplateRepository: {
        findByKey: mockFindByKey
    }
}));

jest.unstable_mockModule('../src/modules/registration/repositories/registrationIndustryVisibilityRepository.js', () => ({
    registrationIndustryVisibilityRepository: {
        findHiddenKeys: mockFindHiddenKeys
    }
}));

let app;

beforeAll(async () => {
    const router = (await import('../src/routes/registration.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/registration', router);
});

const publishedTemplate = (templateKey) => ({ template_id: 1, template_key: templateKey, status: 'published' });

// issue #178 "templates become the Operating Mode" follow-up.
describe('GET /api/v1/registration/industries transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindHiddenKeys.mockResolvedValue([]);
    });

    it('returns every catalog entry with a published template_key resolved', async () => {
        mockFindByKey.mockImplementation(async (key) => publishedTemplate(key));

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.industries).toHaveLength(11);

        const microFnb = response.body.data.industries.find((entry) => entry.key === 'micro_fnb');
        expect(microFnb).toEqual(expect.objectContaining({
            workflow_mode: 'fnb',
            template_key: 'fnb_counter_service',
            engine: 'native',
            hidden: false
        }));

        const healthcare = response.body.data.industries.find((entry) => entry.key === 'healthcare');
        expect(healthcare).toEqual(expect.objectContaining({
            workflow_mode: 'healthcare',
            template_key: null,
            engine: 'external',
            hidden: false
        }));
        // Healthcare has no template_key in the catalog, so the repository is
        // never even asked to look one up for it.
        expect(mockFindByKey).not.toHaveBeenCalledWith('healthcare');
    });

    it('degrades a single entry to template_key: null when its template is not published', async () => {
        mockFindByKey.mockImplementation(async (key) => (
            key === 'fnb_counter_service' ? { template_id: 2, template_key: key, status: 'draft' } : publishedTemplate(key)
        ));

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        const microFnb = response.body.data.industries.find((entry) => entry.key === 'micro_fnb');
        expect(microFnb.template_key).toBeNull();
        // A sibling entry pointed at a different, published template is unaffected.
        const fullService = response.body.data.industries.find((entry) => entry.key === 'fnb');
        expect(fullService.template_key).toBe('fnb_full_service');
    });

    it('degrades a single entry to template_key: null when its template row is missing entirely', async () => {
        mockFindByKey.mockImplementation(async (key) => (key === 'retail_store' ? null : publishedTemplate(key)));

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        const retail = response.body.data.industries.find((entry) => entry.key === 'retail');
        expect(retail.template_key).toBeNull();
    });

    it('degrades every entry to template_key: null (never 5xx) when the landlord lookup fails outright', async () => {
        mockFindByKey.mockRejectedValue(new Error('landlord DB unreachable'));

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        for (const entry of response.body.data.industries) {
            expect(entry.template_key).toBeNull();
        }
    });

    // Phase 39: admin-hidden industries stay IN the response, flagged
    // hidden: true - the array never shortens (the frontend service falls
    // back to the full local constant on an empty array, so omission would
    // silently un-hide everything).
    it('flags exactly the admin-hidden industries hidden: true, without shortening the 11-entry array', async () => {
        mockFindByKey.mockImplementation(async (key) => publishedTemplate(key));
        mockFindHiddenKeys.mockResolvedValue(['food_manufacturing', 'hospitality']);

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.data.industries).toHaveLength(11);
        const hiddenKeys = response.body.data.industries.filter((entry) => entry.hidden).map((entry) => entry.key);
        expect(hiddenKeys.sort()).toEqual(['food_manufacturing', 'hospitality']);
        const retail = response.body.data.industries.find((entry) => entry.key === 'retail');
        expect(retail.hidden).toBe(false);
    });

    it('fails open to hidden: false on every entry when the visibility lookup fails outright (never 5xx)', async () => {
        mockFindByKey.mockImplementation(async (key) => publishedTemplate(key));
        mockFindHiddenKeys.mockRejectedValue(new Error('landlord DB unreachable'));

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.industries).toHaveLength(11);
        for (const entry of response.body.data.industries) {
            expect(entry.hidden).toBe(false);
        }
    });
});
