import {
    buildCreateDraftTemplateUseCase,
    buildUpdateTemplateModulesUseCase,
    buildPublishTemplateUseCase,
    buildDeprecateTemplateUseCase,
    buildListTemplatesUseCase,
    buildGetTemplateUseCase,
    buildListTemplateAuditLogsUseCase
} from '../src/modules/templates/usecases/storeConfigurationTemplateUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const ACTOR = { username: 'platform_admin_1' };
const REASON = 'curating a new template for the catalog';

// A minimal in-memory fake standing in for storeConfigurationTemplateRepository
// - exercises the use case logic (validation, status transitions, audit
// logging) without a real DB, matching this repo's convention for
// usecase-layer unit tests.
const buildFakeRepository = () => {
    let nextId = 1;
    const byId = new Map();
    const auditLogs = [];

    return {
        auditLogs,
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
        },
        async createAuditLog(entry) {
            auditLogs.push(entry);
            return entry;
        },
        async listAuditLogs(templateId) {
            return auditLogs.filter((entry) => entry.templateId === templateId);
        }
    };
};

describe('store configuration template use cases (issue #178 Phase 13/14)', () => {
    it('rejects an invalid module selection on create (missing requires)', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        await expect(createDraft({
            templateKey: 'bad_template',
            label: 'Bad',
            baseMode: 'retail',
            moduleKeys: ['pos'], // requires 'catalog'
            actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED });
    });

    it('rejects create with no actor', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        await expect(createDraft({
            templateKey: 'no_actor', label: 'X', baseMode: 'retail', moduleKeys: ['catalog']
        })).rejects.toMatchObject({ code: DomainErrorCode.AUTHORIZATION_FAILED });
    });

    it('rejects a duplicate template_key', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        await createDraft({ templateKey: 'dup', label: 'A', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR });
        await expect(createDraft({
            templateKey: 'dup', label: 'B', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('creates a valid draft template and audits it', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'retail_lean',
            label: 'Lean Retail',
            baseMode: 'retail',
            moduleKeys: ['catalog', 'pos'],
            actorUser: ACTOR
        });

        expect(template.status).toBe('draft');
        expect(template.modules).toEqual(['catalog', 'pos']);
        expect(repository.auditLogs).toEqual([expect.objectContaining({
            templateId: template.template_id,
            action: 'draft_created',
            actorUsername: 'platform_admin_1'
        })]);
    });

    it('allows editing modules while draft, with a required reason', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const updateModules = buildUpdateTemplateModulesUseCase({ repository });

        const template = await createDraft({
            templateKey: 'services_draft', label: 'S', baseMode: 'services', moduleKeys: ['catalog', 'services'], actorUser: ACTOR
        });

        await expect(updateModules({
            templateId: template.template_id, moduleKeys: ['catalog', 'services', 'inventory'], actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED });

        const updated = await updateModules({
            templateId: template.template_id, moduleKeys: ['catalog', 'services', 'inventory'], reason: REASON, actorUser: ACTOR
        });

        expect(updated.modules).toEqual(['catalog', 'inventory', 'services']);
        expect(repository.auditLogs).toContainEqual(expect.objectContaining({ action: 'modules_updated', reason: REASON }));
    });

    it('publishing validates the module selection and freezes the template', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });
        const updateModules = buildUpdateTemplateModulesUseCase({ repository });

        const template = await createDraft({
            templateKey: 'fnb_counter', label: 'Counter', baseMode: 'fnb', moduleKeys: ['catalog', 'pos', 'fnbDining'], actorUser: ACTOR
        });
        const published = await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
        expect(published.status).toBe('published');
        expect(repository.auditLogs).toContainEqual(expect.objectContaining({ action: 'published', reason: REASON }));

        await expect(updateModules({
            templateId: template.template_id, moduleKeys: ['catalog'], reason: REASON, actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('publishing an already-published template is idempotent and does not double-audit', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'idempotent_pub', label: 'X', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR
        });
        await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
        const secondPublish = await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
        expect(secondPublish.status).toBe('published');
        expect(repository.auditLogs.filter((entry) => entry.action === 'published')).toHaveLength(1);
    });

    it('rejects publishing a deprecated template', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });
        const deprecate = buildDeprecateTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'to_deprecate', label: 'X', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR
        });
        await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
        await deprecate({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });

        await expect(publish({
            templateId: template.template_id, reason: REASON, actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('lists and gets templates, and 404s a missing one', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const list = buildListTemplatesUseCase({ repository });
        const get = buildGetTemplateUseCase({ repository });

        await createDraft({ templateKey: 'a', label: 'A', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR });
        await createDraft({ templateKey: 'b', label: 'B', baseMode: 'fnb', moduleKeys: ['catalog', 'pos', 'fnbDining'], actorUser: ACTOR });

        const all = await list();
        expect(all).toHaveLength(2);

        const filtered = await list({ baseMode: 'fnb' });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].template_key).toBe('b');

        const found = await get({ templateKey: 'a' });
        expect(found.label).toBe('A');

        await expect(get({ templateId: 999 })).rejects.toMatchObject({ code: DomainErrorCode.RESOURCE_NOT_FOUND });
    });

    it('lists audit logs for a template and 404s a missing one', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });
        const listAuditLogs = buildListTemplateAuditLogsUseCase({ repository });

        const template = await createDraft({
            templateKey: 'audited', label: 'X', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR
        });
        await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });

        const logs = await listAuditLogs({ templateId: template.template_id });
        expect(logs.map((l) => l.action)).toEqual(['draft_created', 'published']);

        await expect(listAuditLogs({ templateId: 999 })).rejects.toMatchObject({ code: DomainErrorCode.RESOURCE_NOT_FOUND });
    });
});
