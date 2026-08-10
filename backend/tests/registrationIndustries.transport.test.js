import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import { REGISTRATION_INDUSTRIES } from '../src/modules/shared/constants/registrationIndustries.js';

const mockFindByKey = jest.fn();
const mockCatalogFindAll = jest.fn();

jest.unstable_mockModule('../src/modules/templates/repositories/storeConfigurationTemplateRepository.js', () => ({
    storeConfigurationTemplateRepository: {
        findByKey: mockFindByKey
    }
}));

jest.unstable_mockModule('../src/modules/registration/repositories/registrationIndustryRepository.js', () => ({
    registrationIndustryRepository: {
        findAll: mockCatalogFindAll
    }
}));

let app;

beforeAll(async () => {
    const router = (await import('../src/routes/registration.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/v1/registration', router);
});

const publishedTemplate = (templateKey, modules = []) => ({ template_id: 1, template_key: templateKey, status: 'published', modules });

// Rows shaped exactly as registrationIndustryRepository.findAll() returns
// them, derived from the seed-baseline constant - this is what the
// migration in Phase 43 actually seeds, so the 11-entry pins below
// describe the seeded baseline, not the constant directly.
const seededCatalogRows = () => Object.entries(REGISTRATION_INDUSTRIES).map(([industryKey, entry]) => ({
    industry_key: industryKey,
    display_order: entry.order,
    label: entry.label,
    summary: entry.summary,
    niches: entry.niches,
    workflow_mode: entry.workflow_mode,
    template_key: entry.template_key,
    hidden: false,
    hidden_reason: null,
    is_system: true
}));

// issue #178 "templates become the Operating Mode" follow-up, made
// DB-driven by issue #316: the catalog repository is now the primary
// source, with the seed-baseline constant only as a fail-open fallback.
describe('GET /api/v1/registration/industries transport contracts', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCatalogFindAll.mockResolvedValue(seededCatalogRows());
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
        expect(microFnb.template_modules).toEqual([]);
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

    it('degrades every entry to template_key: null (never 5xx) when the landlord template lookup fails outright', async () => {
        mockFindByKey.mockRejectedValue(new Error('landlord DB unreachable'));

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        for (const entry of response.body.data.industries) {
            expect(entry.template_key).toBeNull();
        }
    });

    // Phase 39/46: admin-hidden industries stay IN the response, flagged
    // hidden: true - the array never shortens (the frontend service falls
    // back to the full local constant on an empty array, so omission would
    // silently un-hide everything).
    it('flags exactly the rows the catalog marks hidden, without shortening the 11-entry array', async () => {
        mockFindByKey.mockImplementation(async (key) => publishedTemplate(key));
        const rows = seededCatalogRows().map((row) => (
            ['food_manufacturing', 'hospitality'].includes(row.industry_key) ? { ...row, hidden: true } : row
        ));
        mockCatalogFindAll.mockResolvedValue(rows);

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.data.industries).toHaveLength(11);
        const hiddenKeys = response.body.data.industries.filter((entry) => entry.hidden).map((entry) => entry.key);
        expect(hiddenKeys.sort()).toEqual(['food_manufacturing', 'hospitality']);
        const retail = response.body.data.industries.find((entry) => entry.key === 'retail');
        expect(retail.hidden).toBe(false);
    });

    // Genuine-regression proof for the fallback branch: run with the
    // fallback commented out first (mockCatalogFindAll rejecting causes the
    // use case to throw, and the request 500s) to confirm this case fails,
    // then restore listRegistrationIndustriesUseCase.js's try/catch.
    it('fails open to the seed-baseline constant (never 5xx) when the catalog lookup fails outright', async () => {
        mockFindByKey.mockImplementation(async (key) => publishedTemplate(key));
        mockCatalogFindAll.mockRejectedValue(new Error('landlord DB unreachable'));

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.industries).toHaveLength(11);
        for (const entry of response.body.data.industries) {
            expect(entry.hidden).toBe(false);
        }
    });

    it('fails open to the seed-baseline constant when the catalog table returns no rows (unmigrated environment)', async () => {
        mockFindByKey.mockImplementation(async (key) => publishedTemplate(key));
        mockCatalogFindAll.mockResolvedValue([]);

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.data.industries).toHaveLength(11);
    });

    it('surfaces an admin-created industry not present in the seed-baseline constant', async () => {
        mockFindByKey.mockImplementation(async (key) => publishedTemplate(key));
        mockCatalogFindAll.mockResolvedValue([
            ...seededCatalogRows(),
            {
                industry_key: 'pet_grooming',
                display_order: 12,
                label: 'Pet Grooming',
                summary: 'Grooming and boarding services for pets.',
                niches: ['Pet salon', 'Mobile grooming'],
                workflow_mode: 'services',
                template_key: 'services_shop',
                hidden: false,
                hidden_reason: null,
                is_system: false
            }
        ]);

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        expect(response.body.data.industries).toHaveLength(12);
        const petGrooming = response.body.data.industries.find((entry) => entry.key === 'pet_grooming');
        expect(petGrooming).toEqual(expect.objectContaining({
            label: 'Pet Grooming',
            workflow_mode: 'services',
            template_key: 'services_shop',
            engine: 'native',
            hidden: false
        }));
    });

    it('carries the published template modules through as template_modules, empty when unpublished', async () => {
        mockFindByKey.mockImplementation(async (key) => (
            key === 'retail_store' ? publishedTemplate(key, ['inventory', 'barcodeScanning']) : null
        ));

        const response = await request(app).get('/api/v1/registration/industries');

        expect(response.status).toBe(200);
        const retail = response.body.data.industries.find((entry) => entry.key === 'retail');
        expect(retail.template_modules).toEqual(['inventory', 'barcodeScanning']);
        const healthcare = response.body.data.industries.find((entry) => entry.key === 'healthcare');
        expect(healthcare.template_modules).toEqual([]);
    });
});
