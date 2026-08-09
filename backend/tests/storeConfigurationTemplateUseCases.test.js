import {
    buildCreateDraftTemplateUseCase,
    buildUpdateTemplateModulesUseCase,
    buildPublishTemplateUseCase,
    buildDeprecateTemplateUseCase,
    buildListTemplatesUseCase,
    buildGetTemplateUseCase
} from '../src/modules/templates/usecases/storeConfigurationTemplateUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

// A minimal in-memory fake standing in for storeConfigurationTemplateRepository
// - exercises the use case logic (validation, status transitions) without a
// real DB, matching this repo's convention for usecase-layer unit tests.
const buildFakeRepository = () => {
    let nextId = 1;
    const byId = new Map();

    return {
        async findAll({ status = null, baseMode = null } = {}) {
            return [...byId.values()].filter((t) => (
                (!status || t.status === status) && (!baseMode || t.base_mode === baseMode)
            ));
        },
        async findByKey(templateKey) {
            return [...byId.values()].find((t) => t.template_key === templateKey) || null;
        },
        async findById(templateId) {
            return byId.get(templateId) || null;
        },
        async create({ templateKey, label, baseMode, isPreset, visibility, owner, moduleKeys }) {
            const template = {
                template_id: nextId++,
                template_key: templateKey,
                label,
                base_mode: baseMode,
                is_preset: isPreset,
                visibility,
                owner,
                status: 'draft',
                version: 1,
                modules: [...moduleKeys].sort()
            };
            byId.set(template.template_id, template);
            return template;
        },
        async replaceModules(templateId, moduleKeys) {
            const template = byId.get(templateId);
            template.modules = [...moduleKeys].sort();
            return template;
        },
        async setStatus(templateId, status) {
            const template = byId.get(templateId);
            template.status = status;
            return template;
        }
    };
};

describe('store configuration template use cases (issue #178 Phase 13)', () => {
    it('rejects an invalid module selection on create (missing requires)', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        await expect(createDraft({
            templateKey: 'bad_template',
            label: 'Bad',
            baseMode: 'retail',
            moduleKeys: ['pos'] // requires 'catalog'
        })).rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED });
    });

    it('rejects a duplicate template_key', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        await createDraft({ templateKey: 'dup', label: 'A', baseMode: 'retail', moduleKeys: ['catalog'] });
        await expect(createDraft({
            templateKey: 'dup', label: 'B', baseMode: 'retail', moduleKeys: ['catalog']
        })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('creates a valid draft template', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'retail_lean',
            label: 'Lean Retail',
            baseMode: 'retail',
            moduleKeys: ['catalog', 'pos']
        });

        expect(template.status).toBe('draft');
        expect(template.modules).toEqual(['catalog', 'pos']);
    });

    it('allows editing modules while draft', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const updateModules = buildUpdateTemplateModulesUseCase({ repository });

        const template = await createDraft({
            templateKey: 'services_draft', label: 'S', baseMode: 'services', moduleKeys: ['catalog', 'services']
        });
        const updated = await updateModules({ templateId: template.template_id, moduleKeys: ['catalog', 'services', 'inventory'] });

        expect(updated.modules).toEqual(['catalog', 'inventory', 'services']);
    });

    it('publishing validates the module selection and freezes the template', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });
        const updateModules = buildUpdateTemplateModulesUseCase({ repository });

        const template = await createDraft({
            templateKey: 'fnb_counter', label: 'Counter', baseMode: 'fnb', moduleKeys: ['catalog', 'pos', 'fnbDining']
        });
        const published = await publish({ templateId: template.template_id });
        expect(published.status).toBe('published');

        await expect(updateModules({
            templateId: template.template_id, moduleKeys: ['catalog']
        })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('publishing an already-published template is idempotent', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'idempotent_pub', label: 'X', baseMode: 'retail', moduleKeys: ['catalog']
        });
        await publish({ templateId: template.template_id });
        const secondPublish = await publish({ templateId: template.template_id });
        expect(secondPublish.status).toBe('published');
    });

    it('rejects publishing a deprecated template', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });
        const deprecate = buildDeprecateTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'to_deprecate', label: 'X', baseMode: 'retail', moduleKeys: ['catalog']
        });
        await publish({ templateId: template.template_id });
        await deprecate({ templateId: template.template_id });

        await expect(publish({ templateId: template.template_id })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('lists and gets templates, and 404s a missing one', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const list = buildListTemplatesUseCase({ repository });
        const get = buildGetTemplateUseCase({ repository });

        await createDraft({ templateKey: 'a', label: 'A', baseMode: 'retail', moduleKeys: ['catalog'] });
        await createDraft({ templateKey: 'b', label: 'B', baseMode: 'fnb', moduleKeys: ['catalog', 'pos', 'fnbDining'] });

        const all = await list();
        expect(all).toHaveLength(2);

        const filtered = await list({ baseMode: 'fnb' });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].template_key).toBe('b');

        const found = await get({ templateKey: 'a' });
        expect(found.label).toBe('A');

        await expect(get({ templateId: 999 })).rejects.toMatchObject({ code: DomainErrorCode.RESOURCE_NOT_FOUND });
    });
});
