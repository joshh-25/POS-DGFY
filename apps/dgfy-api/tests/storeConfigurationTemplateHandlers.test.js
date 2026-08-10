import { jest } from '@jest/globals';

// issue #178 final-touch hardening: is_preset is a platform-owned provenance
// flag. The Joi validator still accepts it (adminTemplates.transport.test.js
// proves that request isn't 422'd), but this handler must never read it off
// req.validatedData - is_preset can only ever be set by the seed use case,
// which calls the repository directly and bypasses this handler entirely.
const mockCreateDraftTemplateUseCase = jest.fn();
const mockListTemplatesUseCase = jest.fn();
const mockGetTemplateUseCase = jest.fn();
const mockListTemplateAuditLogsUseCase = jest.fn();
const mockUpdateTemplateModulesUseCase = jest.fn();
const mockPublishTemplateUseCase = jest.fn();
const mockDeprecateTemplateUseCase = jest.fn();

jest.unstable_mockModule('../src/modules/templates/index.js', () => ({
    listTemplatesUseCase: mockListTemplatesUseCase,
    getTemplateUseCase: mockGetTemplateUseCase,
    listTemplateAuditLogsUseCase: mockListTemplateAuditLogsUseCase,
    createDraftTemplateUseCase: mockCreateDraftTemplateUseCase,
    updateTemplateModulesUseCase: mockUpdateTemplateModulesUseCase,
    publishTemplateUseCase: mockPublishTemplateUseCase,
    deprecateTemplateUseCase: mockDeprecateTemplateUseCase
}));

const makeRes = () => {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
};

describe('storeConfigurationTemplateHandlers.createDraftTemplate (issue #178 final-touch hardening)', () => {
    let createDraftTemplate;

    beforeAll(async () => {
        ({ createDraftTemplate } = await import('../src/modules/templates/controllers/storeConfigurationTemplateHandlers.js'));
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('never forwards a client-supplied is_preset (or is_canonical) to the create use case', async () => {
        mockCreateDraftTemplateUseCase.mockResolvedValue({ template_id: 1, is_preset: false, is_canonical: false });
        const req = {
            admin: { username: 'platform_admin' },
            validatedData: {
                template_key: 'attempted_preset_claim',
                label: 'Attempted Preset Claim',
                base_mode: 'retail',
                module_keys: ['catalog'],
                // a malicious/stale client trying to sneak these through -
                // the schema still validates them (see the transport test),
                // but this handler must not pass them on.
                is_preset: true,
                is_canonical: true
            }
        };
        const res = makeRes();
        const next = jest.fn();

        await createDraftTemplate(req, res, next);

        expect(mockCreateDraftTemplateUseCase).toHaveBeenCalledTimes(1);
        const useCaseArgs = mockCreateDraftTemplateUseCase.mock.calls[0][0];
        expect(useCaseArgs).not.toHaveProperty('isPreset');
        expect(useCaseArgs).not.toHaveProperty('isCanonical');
        expect(useCaseArgs).toEqual({
            templateKey: 'attempted_preset_claim',
            label: 'Attempted Preset Claim',
            baseMode: 'retail',
            visibility: 'visible',
            owner: 'platform_admin',
            moduleKeys: ['catalog'],
            actorUser: { username: 'platform_admin' }
        });
        expect(res.status).toHaveBeenCalledWith(201);
    });
});
